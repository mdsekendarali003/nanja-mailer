import { useMemo, useState } from 'react'
import { listTemplates } from '../../lib/templates.js'
import type { InvoiceNumbering } from '../../lib/numbering.js'
import { money, shortDate } from '../../lib/api.js'
import { buildCreateItems, isUnmatched, type WizardRecord } from '../../lib/wizard.js'
import { Badge, Button, Card, EmptyState, Select } from '../../components/ui.js'

export function PreviewStep({
  records,
  setRecords,
  numbering,
  onRun,
}: {
  records: WizardRecord[]
  setRecords: (next: WizardRecord[]) => void
  numbering: InvoiceNumbering
  onRun: () => void
}) {
  const templates = useMemo(() => listTemplates(), [])
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const template = templates.find((t) => t.id === templateId)

  const previews = useMemo(() => buildCreateItems(records, template, numbering), [records, template, numbering])
  const willCreate = records.filter((w) => w.flags.create).length
  const willSend = records.filter((w) => w.flags.markSent && w.flags.create).length
  const willEmail = records.filter((w) => w.flags.email && w.flags.create).length

  const toggle = (id: string, key: 'create' | 'markSent' | 'email') => {
    setRecords(records.map((w) => (w.record.id === id ? { ...w, flags: { ...w.flags, [key]: !w.flags[key] } } : w)))
  }

  return (
    <div className="space-y-4">
      <Card
        title="Review invoices"
        subtitle="Toggle which records to invoice, whether to mark them sent, and whether to email the PDFs."
        actions={
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Template</label>
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-56">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Button onClick={onRun} disabled={willCreate === 0}>
              Run {willCreate} invoice{willCreate === 1 ? '' : 's'}
            </Button>
          </div>
        }
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Will create</p>
            <p className="text-lg font-semibold text-emerald-600">{willCreate}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Mark sent</p>
            <p className="text-lg font-semibold text-slate-800">{willSend}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Email PDF</p>
            <p className="text-lg font-semibold text-slate-800">{willEmail}</p>
          </div>
        </div>
        {previews.length === 0 ? (
          <EmptyState title="Nothing to invoice yet." />
        ) : (
          <div className="space-y-3">
            {records.map((w) => {
              if (!w.flags.create) return null
              const preview = previews.find((p) => p.id === w.record.id)
              const total = preview ? preview.payload.line_items.reduce((s, li) => s + li.cost * li.quantity, 0) : 0
              return (
                <div key={w.record.id} className={`rounded-lg border p-4 ${isUnmatched(w) ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{w.record.customerName}</p>
                      <p className="text-xs text-slate-500">
                        {w.record.email} Â· client {w.client.clientName ?? w.client.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                      <label className="inline-flex items-center gap-1">
                        <input type="checkbox" checked={w.flags.create} onChange={() => toggle(w.record.id, 'create')} /> Create
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input type="checkbox" checked={w.flags.markSent} onChange={() => toggle(w.record.id, 'markSent')} /> Mark sent
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input type="checkbox" checked={w.flags.email} onChange={() => toggle(w.record.id, 'email')} /> Email
                      </label>
                    </div>
                  </div>
                  {preview && (
                    <div className="mt-3 text-xs">
                      <p className="text-slate-500">
                        Invoice <span className="font-mono text-slate-700">{preview.payload.number}</span>
                        {preview.autoNumbered && <span className="text-slate-400"> (auto)</span>} Â· due{' '}
                        <span className="font-mono text-slate-700">{shortDate(preview.payload.due_date)}</span> Â· terms{' '}
                        <span className="font-mono text-slate-700">{preview.payload.terms || '—'}</span>
                      </p>
                      <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-[10px] uppercase text-slate-400">
                            <tr>
                              <th className="px-2 py-1">Item</th>
                              <th className="px-2 py-1 w-24">Product key</th>
                              <th className="px-2 py-1 w-16 text-right">Qty</th>
                              <th className="px-2 py-1 w-24 text-right">Unit</th>
                              <th className="px-2 py-1 w-24 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-600">
                            {preview.payload.line_items.map((li, i) => (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="px-2 py-1">{li.notes}</td>
                                <td className="px-2 py-1 font-mono text-[10px]">{li.product_key || '—'}</td>
                                <td className="px-2 py-1 text-right">{li.quantity}</td>
                                <td className="px-2 py-1 text-right">{money(li.cost)}</td>
                                <td className="px-2 py-1 text-right">{money(li.cost * li.quantity)}</td>
                              </tr>
                            ))}
                            <tr className="border-t border-slate-200 font-semibold">
                              <td colSpan={4} className="px-2 py-1 text-right">
                                Total
                              </td>
                              <td className="px-2 py-1 text-right">{money(total)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {isUnmatched(w) && <Badge tone="red">No client — this invoice will fail. Fix it in the Clients step.</Badge>}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}


