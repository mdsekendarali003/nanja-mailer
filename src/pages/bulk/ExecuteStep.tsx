import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { InvoiceTemplate } from '../../../shared/types.js'
import { apiPost, chunk } from '../../lib/api.js'
import { randomInvoiceNumber, type InvoiceNumbering } from '../../lib/numbering.js'
import { clearExecuteStatus, loadExecuteStatus, saveExecuteStatus } from '../../lib/wizard-session.js'
import { useToast } from '../../context/ToastContext.js'
import { buildCreateItems, type ExecuteItemStatus, type ExecuteStatusItem, type WizardRecord } from '../../lib/wizard.js'
import { Button, Card, EmptyState, Spinner } from '../../components/ui.js'

type Phase = 'create' | 'mark_sent' | 'email'

interface LogEntry {
  id: number
  time: string
  type: 'info' | 'success' | 'error'
  text: string
}

const LOG_LIMIT = 200

export function ExecuteStep({
  records,
  setRecords,
  template,
  numbering,
}: {
  records: WizardRecord[]
  setRecords: Dispatch<SetStateAction<WizardRecord[]>>
  template: InvoiceTemplate | undefined
  numbering: InvoiceNumbering
}) {
  const { toast } = useToast()
  const [running, setRunning] = useState(false)
  const [statuses, setStatuses] = useState<ExecuteStatusItem[]>(() => {
    const saved = loadExecuteStatus()
    const base: ExecuteStatusItem[] =
      saved && saved.statuses.length > 0
        ? saved.statuses
        : records.filter((w) => w.flags.create).map((w) => ({ id: w.record.id, status: 'pending' as ExecuteItemStatus }))
    return base.map((s) => {
      const w = records.find((r) => r.record.id === s.id)
      if (w?.invoiceId && (s.status === 'pending' || s.status === 'error')) {
        return { ...s, status: 'created' as ExecuteItemStatus, invoiceId: w.invoiceId, message: s.message ?? 'Invoice created' }
      }
      return s
    })
  })
  const [interrupted, setInterrupted] = useState(() => !!loadExecuteStatus()?.interrupted)
  const [verifying, setVerifying] = useState(false)
  const [phase, setPhase] = useState<Phase | null>(null)
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const nextLogId = useRef(1)
  const logPanelRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => buildCreateItems(records, template, numbering), [records, template, numbering])

  const statusesRef = useRef(statuses)

  useEffect(() => {
    saveExecuteStatus({ statuses, interrupted: interrupted || phase !== null || running })
  }, [statuses, interrupted, phase, running])

  useEffect(() => {
    const el = logPanelRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  const log = (type: LogEntry['type'], text: string) => {
    setLogs((prev) => [...prev.slice(-(LOG_LIMIT - 1)), { id: nextLogId.current++, time: new Date().toLocaleTimeString(), type, text }])
  }

  const update = (id: string, patch: Partial<ExecuteStatusItem>) => {
    const next = statusesRef.current.map((s) => (s.id === id ? { ...s, ...patch } : s))
    statusesRef.current = next
    setStatuses(next)
  }

  const patchRecord = (id: string, invoiceId: string) => {
    setRecords((prev) => prev.map((w) => (w.record.id === id ? { ...w, invoiceId } : w)))
  }

  const customerOf = (id: string): string => {
    return records.find((r) => r.record.id === id)?.record.customerName ?? id
  }

  useEffect(() => {
    const saved = loadExecuteStatus()
    if (!saved || saved.statuses.length === 0) return
    const candidates = items.filter((i) => {
      const s = statusesRef.current.find((x) => x.id === i.id)
      const w = records.find((r) => r.record.id === i.id)
      return s && s.status === 'pending' && !w?.invoiceId && !!i.payload.number && !s.message?.startsWith('Checked')
    })
    if (candidates.length === 0) return
    let cancelled = false
    setVerifying(true)
    log('info', `Checking Invoice Ninja for ${candidates.length} invoice(s) that may have been created before the interruption…`)
    ;(async () => {
      try {
        const result = await apiPost<{ results: { key: string; found: boolean; checked: boolean; invoiceId?: string }[] }>('/api/ninja/invoices-check', {
          items: candidates.map((i) => ({ key: i.id, clientId: i.clientId, number: i.payload.number as string })),
        })
        if (cancelled) return
        for (const r of result.results) {
          if (r.found && r.invoiceId) {
            update(r.key, { status: 'created', invoiceId: r.invoiceId, message: 'Recovered — already created in Invoice Ninja' })
            patchRecord(r.key, r.invoiceId)
            log('success', `${customerOf(r.key)} — recovered, already created in Invoice Ninja (${r.invoiceId})`)
          } else if (r.checked) {
            update(r.key, { status: 'pending', message: 'Checked — not yet created' })
            log('info', `${customerOf(r.key)} — not created yet, ready to send`)
          } else {
            update(r.key, { status: 'pending', message: 'Could not verify — check Invoice Ninja before running' })
            log('error', `${customerOf(r.key)} — could not verify against Invoice Ninja, check before sending`)
          }
        }
      } catch {
        log('error', 'Could not check Invoice Ninja — records will be sent as pending.')
      } finally {
        if (!cancelled) setVerifying(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runPhase = async (p: Phase) => {
    const targets = statusesRef.current.filter((s) => {
      if (p === 'create') return s.status === 'pending' || s.status === 'error'
      if (p === 'mark_sent') return s.status === 'created' || s.status === 'error'
      return s.status === 'sent' || s.status === 'created' || s.status === 'error'
    })
    if (targets.length === 0) return
    setPhase(p)
    setTotal(targets.length)
    setProgress(0)
    if (p === 'create') log('info', `Creating ${targets.length} invoice(s)…`)
    else if (p === 'mark_sent') log('info', `Marking ${targets.length} invoice(s) as sent…`)
    else log('info', `Emailing ${targets.length} invoice(s)…`)
    let failed = 0
    for (const batch of chunk(targets, 3)) {
      await Promise.all(
        batch.map(async (target) => {
          const w = records.find((r) => r.record.id === target.id)
          if (!w) return
          if (p === 'create') {
            if (w.record.errors.length > 0) {
              const details = w.record.errors.join('; ')
              update(target.id, { status: 'error', message: details })
              log('error', `${customerOf(target.id)} — record is invalid: ${details} — fix it in the Records step first`)
              failed++
              return
            }
            const item = items.find((i) => i.id === target.id)
            if (!item) {
              update(target.id, { status: 'error', message: 'Missing client — go back to the Clients step.' })
              log('error', `${customerOf(target.id)} — no client assigned, skipped`)
              failed++
              return
            }
            const autoNumbered = item.autoNumbered === true && numbering.enabled
            const prefix = numbering.prefix.trim() || 'INV'
            let itemToSend = item
            let errorMessage = 'unknown error'
            try {
              for (let attempt = 0; attempt < 5; attempt++) {
                const result = await apiPost<{ results: { id: string; ok: boolean; invoiceId?: string; invoiceNumber?: string; error?: { error: string } }[] }>('/api/ninja/invoices-create', {
                  items: [itemToSend],
                })
                const r = result.results[0]
                if (r?.ok) {
                  update(target.id, { status: 'created', invoiceId: r.invoiceId, message: `Invoice ${r.invoiceNumber ?? ''} created` })
                  patchRecord(target.id, r.invoiceId ?? '')
                  log('success', `${customerOf(target.id)} — invoice ${r.invoiceNumber ?? '?'} (${r.invoiceId ?? 'no id'}) created`)
                  return
                }
                errorMessage = r?.error?.error ?? 'unknown error'
                if (autoNumbered && /already been taken/i.test(errorMessage)) {
                  itemToSend = { ...itemToSend, payload: { ...itemToSend.payload, number: randomInvoiceNumber(prefix) } }
                  log('info', `${customerOf(target.id)} — number taken, retrying with a new random number…`)
                  continue
                }
                break
              }
              update(target.id, { status: 'error', message: errorMessage })
              log('error', `${customerOf(target.id)} — create failed: ${errorMessage}`)
              failed++
            } catch (err) {
              update(target.id, { status: 'error', message: err instanceof Error ? err.message : 'Create failed' })
              log('error', `${customerOf(target.id)} — create failed: ${err instanceof Error ? err.message : 'unknown error'}`)
              failed++
            }
          } else {
            const action = p
            const invoiceId = target.invoiceId || w.invoiceId
            const itemsFor = invoiceId ? [{ id: w.record.id, invoiceId }] : []
            if (itemsFor.length === 0) {
              update(target.id, { status: 'error', message: 'No invoice to send' })
              log('error', `${customerOf(target.id)} — no invoice to send`)
              failed++
              return
            }
            try {
              const result = await apiPost<{ results: { id: string; ok: boolean; error?: { error: string } }[] }>('/api/ninja/invoices-actions', {
                action,
                items: itemsFor,
              })
              const r = result.results[0]
              if (r?.ok) {
                update(target.id, { status: p === 'mark_sent' ? 'sent' : 'emailed' })
                if (p === 'mark_sent') log('success', `${customerOf(target.id)} — marked as sent`)
                else log('success', `${customerOf(target.id)} — emailed`)
              } else {
                const errorMessage = r?.error?.error ?? 'unknown error'
                update(target.id, { status: 'error', message: errorMessage })
                log('error', `${customerOf(target.id)} — ${p === 'mark_sent' ? 'mark-sent' : 'email'} failed: ${errorMessage}`)
                failed++
              }
            } catch (err) {
              update(target.id, { status: 'error', message: err instanceof Error ? err.message : 'Failed' })
              log('error', `${customerOf(target.id)} — ${p === 'mark_sent' ? 'mark-sent' : 'email'} failed: ${err instanceof Error ? err.message : 'unknown error'}`)
              failed++
            }
          }
          setProgress((prev) => prev + 1)
        }),
      )
    }
    if (failed > 0) toast('warning', `${failed} record(s) failed during ${p}. See the log below.`)
    setPhase(null)
  }

  const sendAll = async () => {
    setRunning(true)
    setInterrupted(false)
    log('info', 'Starting — creating invoices, marking sent and emailing…')
    await runPhase('create')
    if (statusesRef.current.some((s) => s.status === 'created')) await runPhase('mark_sent')
    if (statusesRef.current.some((s) => s.status === 'sent' || s.status === 'created')) await runPhase('email')
    setRunning(false)
    clearExecuteStatus()
    const emailed = statusesRef.current.filter((s) => s.status === 'emailed').length
    const failed = statusesRef.current.filter((s) => s.status === 'error').length
    if (failed > 0) log('error', `Finished — ${emailed} emailed, ${failed} failed. Retry the failed ones or check Invoice Ninja.`)
    else log('success', `All done — ${emailed} invoice(s) created and emailed.`)
  }

  const retryFailed = async () => {
    setRunning(true)
    setInterrupted(false)
    await runPhase('create')
    await runPhase('mark_sent')
    await runPhase('email')
    setRunning(false)
    clearExecuteStatus()
  }

  const count = (s: ExecuteItemStatus) => statuses.filter((x) => x.status === s).length
  const hasErrors = statuses.some((s) => s.status === 'error')

  return (
    <Card
      title="Send invoices"
      subtitle="One click creates every invoice, marks it sent and emails the PDF — progress appears below in real time."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void retryFailed()} disabled={running || !hasErrors}>
            Retry failed
          </Button>
          <Button onClick={() => void sendAll()} loading={running} disabled={statuses.length === 0}>
            {running ? 'Sending…' : 'Send all'}
          </Button>
        </div>
      }
    >
      {(phase || running || verifying) && (
        <div className="mb-4 flex items-center gap-3 text-sm text-slate-600">
          <Spinner />
          <span>
            {verifying && 'Checking Invoice Ninja for invoices created before the interruption…'}
            {phase === 'create' && 'Creating invoices'}
            {phase === 'mark_sent' && 'Marking invoices sent'}
            {phase === 'email' && 'Emailing invoices'}
            {phase && `… ${progress}/${total}`}
          </span>
        </div>
      )}
      {interrupted && !running && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your previous run was interrupted. Invoices that were already created are recovered automatically — press{' '}
          <span className="font-medium">Send all</span> to continue from where it left off.
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Ready to send</p>
          <p className="text-lg font-semibold text-slate-800">{count('pending')}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Created</p>
          <p className="text-lg font-semibold text-emerald-600">{count('created') + count('sent') + count('emailed')}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Emailed</p>
          <p className="text-lg font-semibold text-slate-800">{count('emailed')}</p>
        </div>
        <div className="rounded-lg bg-red-50 p-3">
          <p className="text-xs text-slate-500">Failed</p>
          <p className={`text-lg font-semibold ${hasErrors ? 'text-red-600' : 'text-slate-800'}`}>{count('error')}</p>
        </div>
      </div>
      {statuses.length === 0 ? (
        <EmptyState title="No records selected for invoicing." />
      ) : (
        <div ref={logPanelRef} className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-xs">
          {logs.length === 0 && <p className="text-slate-500">Press “Send all” to start — every email will appear here in real time.</p>}
          {logs.map((entry) => (
            <p
              key={entry.id}
              className={`py-0.5 ${
                entry.type === 'success' ? 'text-emerald-400' : entry.type === 'error' ? 'text-red-400' : 'text-slate-300'
              }`}
            >
              <span className="text-slate-500">[{entry.time}]</span> {entry.text}
            </p>
          ))}
        </div>
      )}
    </Card>
  )
}