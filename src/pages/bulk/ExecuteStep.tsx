import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { InvoiceTemplate } from '../../../shared/types.js'
import { apiPost, chunk } from '../../lib/api.js'
import { bumpCount } from '../../lib/numbering.js'
import type { InvoiceNumbering } from '../../lib/numbering.js'
import { useToast } from '../../context/ToastContext.js'
import { buildCreateItems, type WizardRecord } from '../../lib/wizard.js'
import { Badge, Button, Card, EmptyState, Spinner } from '../../components/ui.js'

type Phase = 'create' | 'mark_sent' | 'email'
type ItemStatus = 'pending' | 'created' | 'sent' | 'emailed' | 'error'
type RecordStatus = { id: string; status: ItemStatus; message?: string; invoiceId?: string }

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
  const [statuses, setStatuses] = useState<RecordStatus[]>(() => records.filter((w) => w.flags.create).map((w) => ({ id: w.record.id, status: 'pending' })))
  const [phase, setPhase] = useState<Phase | null>(null)
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [done, setDone] = useState(false)

  const items = useMemo(() => buildCreateItems(records, template, numbering), [records, template, numbering])

  const update = (id: string, patch: Partial<RecordStatus>) => {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const patchRecord = (id: string, invoiceId: string) => {
    setRecords((prev) => prev.map((w) => (w.record.id === id ? { ...w, invoiceId } : w)))
  }

  const runPhase = async (p: Phase) => {
    const targets = statuses.filter((s) => {
      if (p === 'create') return s.status === 'pending' || s.status === 'error'
      if (p === 'mark_sent') return s.status === 'created' || s.status === 'error'
      return s.status === 'sent' || s.status === 'created' || s.status === 'error'
    })
    if (targets.length === 0) return
    setPhase(p)
    setTotal(targets.length)
    setProgress(0)
    let failed = 0
    for (const batch of chunk(targets, 5)) {
      await Promise.all(
        batch.map(async (target) => {
          const w = records.find((r) => r.record.id === target.id)
          if (!w) return
          if (p === 'create') {
            const item = items.find((i) => i.id === target.id)
            if (!item) {
              update(target.id, { status: 'error', message: 'Missing client — go back to the Clients step.' })
              failed++
              return
            }
            try {
              const result = await apiPost<{ results: { id: string; ok: boolean; invoiceId?: string; number?: string; error?: string }[] }>('/api/ninja/invoices-create', {
                items: [item],
              })
              const r = result.results[0]
              if (r?.ok) {
                update(target.id, { status: 'created', invoiceId: r.invoiceId, message: `Invoice ${r.number ?? ''} created` })
                patchRecord(target.id, r.invoiceId ?? '')
                if (item.autoNumbered) bumpCount(item.clientId)
              } else {
                update(target.id, { status: 'error', message: r?.error ?? 'Create failed' })
                failed++
              }
            } catch (err) {
              update(target.id, { status: 'error', message: err instanceof Error ? err.message : 'Create failed' })
              failed++
            }
          } else {
            const action = p
            const itemsFor = w.invoiceId ? [{ id: w.record.id, invoiceId: w.invoiceId }] : []
            if (itemsFor.length === 0) {
              update(target.id, { status: 'error', message: 'No invoice to send' })
              failed++
              return
            }
            try {
              const result = await apiPost<{ results: { id: string; ok: boolean; error?: string }[] }>('/api/ninja/invoices-actions', {
                action,
                items: itemsFor,
              })
              const r = result.results[0]
              if (r?.ok) {
                update(target.id, { status: p === 'mark_sent' ? 'sent' : 'emailed' })
              } else {
                update(target.id, { status: 'error', message: r?.error ?? 'Failed' })
                failed++
              }
            } catch (err) {
              update(target.id, { status: 'error', message: err instanceof Error ? err.message : 'Failed' })
              failed++
            }
          }
          setProgress((prev) => prev + 1)
        }),
      )
    }
    if (failed > 0) toast('warning', `${failed} record(s) failed during ${p}.`)
    setPhase(null)
  }

  const runAll = async () => {
    setRunning(true)
    setDone(false)
    await runPhase('create')
    if (statuses.some((s) => s.status === 'created')) await runPhase('mark_sent')
    if (statuses.some((s) => s.status === 'sent' || s.status === 'created')) await runPhase('email')
    setDone(true)
    setRunning(false)
  }

  const retry = async () => {
    setDone(false)
    setRunning(true)
    await runPhase('create')
    await runPhase('mark_sent')
    await runPhase('email')
    setDone(true)
    setRunning(false)
  }

  const count = (s: ItemStatus) => statuses.filter((x) => x.status === s).length
  const hasErrors = statuses.some((s) => s.status === 'error')

  return (
    <Card
      title="Run invoices"
      subtitle="Create each invoice, mark it sent, then email the PDF — in batches of 5."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void retry()} disabled={running || !hasErrors}>
            Retry failed
          </Button>
          <Button onClick={() => void runAll()} loading={running} disabled={statuses.length === 0}>
            Start
          </Button>
        </div>
      }
    >
      {(phase || running) && (
        <div className="mb-4 flex items-center gap-3 text-sm text-slate-600">
          <Spinner />
          <span>
            {phase === 'create' && 'Creating invoices'}
            {phase === 'mark_sent' && 'Marking invoices sent'}
            {phase === 'email' && 'Emailing invoices'}
            … {progress}/{total}
          </span>
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Pending</p>
          <p className="text-lg font-semibold text-slate-800">{count('pending')}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Created</p>
          <p className="text-lg font-semibold text-emerald-600">{count('created') + count('sent') + count('emailed')}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Sent</p>
          <p className="text-lg font-semibold text-slate-800">{count('sent') + count('emailed')}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Emailed</p>
          <p className="text-lg font-semibold text-slate-800">{count('emailed')}</p>
        </div>
      </div>
      {done && !hasErrors && (
        <div className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          All done — {count('emailed')} invoice(s) created and emailed.
        </div>
      )}
      {statuses.length === 0 ? (
        <EmptyState title="No records selected for invoicing." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((s) => {
                const w = records.find((r) => r.record.id === s.id)
                if (!w) return null
                return (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{w.record.customerName}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{w.client.clientName ?? w.client.status}</td>
                    <td className="px-3 py-2">
                      <Badge tone={s.status === 'error' ? 'red' : s.status === 'pending' ? 'slate' : 'green'}>{s.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{s.message ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}