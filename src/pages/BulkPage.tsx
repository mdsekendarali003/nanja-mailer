import { useEffect, useMemo, useState } from 'react'
import type { InvoiceRecordData, InvoiceTemplate } from '../../shared/types.js'
import { getTemplate, listTemplates } from '../lib/templates.js'
import { readNumbering, saveNumbering, type InvoiceNumbering } from '../lib/numbering.js'
import { clearWizardSession, loadWizardSession, saveWizardSession } from '../lib/wizard-session.js'
import { Button, Card } from '../components/ui.js'
import { money } from '../lib/api.js'
import { hasInvalidRecords, hasUnmatchedNonSkipped, makeWizardRecord, type WizardRecord } from '../lib/wizard.js'
import { SourceStep } from './bulk/SourceStep.js'
import { RecordsStep } from './bulk/RecordsStep.js'
import { ClientsStep } from './bulk/ClientsStep.js'
import { PreviewStep } from './bulk/PreviewStep.js'
import { ExecuteStep } from './bulk/ExecuteStep.js'

const STEP_NAMES = ['Source', 'Records', 'Clients', 'Preview', 'Execute']

export default function BulkPage() {
  const [initial] = useState(() => loadWizardSession())
  const [step, setStep] = useState(initial?.step ?? 0)
  const [source, setSource] = useState<'csv' | 'emails' | null>(initial?.source ?? null)
  const [records, setRecords] = useState<WizardRecord[]>(initial?.records ?? [])
  const [templateId, setTemplateId] = useState<string | null>(initial?.templateId ?? null)
  const [template, setTemplate] = useState<InvoiceTemplate | undefined>(() => {
    const id = initial?.templateId
    return id ? getTemplate(id) : undefined
  })
  const [numbering, setNumbering] = useState<InvoiceNumbering>(() => initial?.numbering ?? readNumbering())
  const [resumed, setResumed] = useState<boolean>(() => !!(initial && initial.records.length > 0))

  useEffect(() => {
    saveNumbering(numbering)
  }, [numbering])

  useEffect(() => {
    saveWizardSession({ step, source, records, templateId, numbering })
  }, [step, source, records, templateId, numbering])

  const onSourceRecords = (incoming: InvoiceRecordData[], src: 'csv' | 'emails') => {
    clearWizardSession()
    setSource(src)
    setRecords(incoming.map(makeWizardRecord))
    const t = listTemplates()
    setTemplateId(t[0]?.id ?? null)
    setTemplate(t[0])
    setStep(1)
    setResumed(false)
  }

  const restart = () => {
    clearWizardSession()
    setStep(0)
    setSource(null)
    setRecords([])
    setTemplateId(null)
    setTemplate(undefined)
    setResumed(false)
  }

  const canContinue = (): boolean => {
    if (step === 0) return records.length > 0
    if (step === 1) return !hasInvalidRecords(records)
    if (step === 2) return !hasUnmatchedNonSkipped(records)
    if (step === 3) return records.some((w) => w.flags.create)
    return false
  }

  const totals = useMemo(() => {
    const total = records.reduce((sum, w) => sum + w.record.lineItems.reduce((s, i) => s + i.quantity * i.unitAmount, 0), 0)
    const lineItems = records.reduce((sum, w) => sum + w.record.lineItems.length, 0)
    const withMissingEmail = records.filter((w) => !w.record.email.trim()).length
    return { total, lineItems, withMissingEmail }
  }, [records])

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-800">Bulk import</h1>
      <p className="mt-1 text-sm text-slate-500">
        Import sales records from a CSV or pasted emails, match them to Invoice Ninja clients, review the invoices, and create them.
      </p>

      {resumed && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <span>
            Resumed your previous import — {records.length} record(s) · step {Math.min(step + 1, STEP_NAMES.length)} of {STEP_NAMES.length}
            {step === 4 && ' — invoices may have been partially created, sent or emailed; review before re-running.'}
          </span>
          <button onClick={restart} className="font-medium underline">
            Start fresh
          </button>
        </div>
      )}

      <ol className="mt-5 flex items-center gap-2 text-sm">
        {STEP_NAMES.map((name, i) => (
          <li key={name} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-300">→</span>}
            <span
              className={`rounded-full px-3 py-1 font-medium ${
                i === step ? 'bg-brand-600 text-white' : i < step ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {i + 1}. {name}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        {step === 0 && <SourceStep onRecords={onSourceRecords} />}
        {step === 1 && (
          <RecordsStep
            records={records.map((w) => w.record)}
            setRecords={(next) => setRecords(next.map(makeWizardRecord))}
            numbering={numbering}
            setNumbering={setNumbering}
          />
        )}
        {step === 2 && <ClientsStep records={records} setRecords={setRecords} />}
        {step === 3 && <PreviewStep records={records} setRecords={setRecords} numbering={numbering} onRun={() => setStep(4)} />}
        {step === 4 && (
          <div className="space-y-4">
            <Card
              title="Summary"
              subtitle={`${records.length} record(s) · ${totals.lineItems} line item(s) · ${money(totals.total)} · source: ${source === 'emails' ? 'Emails' : 'CSV'}`}
              actions={
                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-500">Template</label>
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    value={templateId ?? ''}
                    onChange={(e) => {
                      const t = listTemplates().find((x) => x.id === e.target.value)
                      setTemplateId(t?.id ?? null)
                      setTemplate(t)
                    }}
                  >
                    {listTemplates().map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" onClick={restart}>
                    Start a new import
                  </Button>
                </div>
              }
            >
              {totals.withMissingEmail > 0 && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {totals.withMissingEmail} record(s) have no email address — they can still be invoiced, but the PDF email step will skip them.
                </p>
              )}
            </Card>
            <ExecuteStep records={records} setRecords={setRecords} template={template} numbering={numbering} />
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        {step > 0 && step < 4 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            ← Back
          </Button>
        )}
        {step < 3 && (
          <div className="ml-auto flex items-center gap-3">
            {step === 1 && source && (
              <button onClick={() => setStep(0)} className="text-sm text-slate-500 hover:text-slate-700">
                Start over with a different source
              </button>
            )}
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue()}>
              Continue →
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}