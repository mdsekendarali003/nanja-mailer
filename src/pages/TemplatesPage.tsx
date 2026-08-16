import { useState } from 'react'
import type { InvoiceTemplate } from '../../shared/types.js'
import { deleteTemplate, listTemplates, newTemplateId, saveTemplate } from '../lib/templates.js'
import { useToast } from '../context/ToastContext.js'
import { Badge, Button, Card, ConfirmDialog, Input, TextArea } from '../components/ui.js'

const emptyTemplate = (): InvoiceTemplate => ({
  id: newTemplateId(),
  name: '',
  description: '',
  lineItemDescription: '',
  accountCode: '4100',
  supportMessage: 'If you have any issues, please contact our customer service team at {{support_number}}',
  paymentTermsDays: 14,
})

export default function TemplatesPage() {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<InvoiceTemplate[]>(() => listTemplates())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<InvoiceTemplate | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const selected = templates.find((t) => t.id === selectedId) ?? null

  const select = (id: string) => {
    setSelectedId(id)
    setDraft({ ...(templates.find((t) => t.id === id) ?? emptyTemplate()) })
  }

  const create = () => {
    const tpl = emptyTemplate()
    setTemplates((prev) => [...prev, tpl])
    setSelectedId(tpl.id)
    setDraft({ ...tpl })
  }

  const save = () => {
    if (!draft) return
    if (!draft.name.trim()) {
      toast('error', 'Template name is required.')
      return
    }
    setTemplates(saveTemplate(draft))
    toast('success', 'Template saved.')
  }

  const remove = () => {
    if (!deleteId) return
    const updated = deleteTemplate(deleteId)
    setTemplates(updated)
    setDeleteId(null)
    if (selectedId === deleteId) {
      setSelectedId(null)
      setDraft(null)
    }
    toast('info', 'Template deleted.')
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-800">Templates</h1>
      <p className="mt-1 text-sm text-slate-500">
        Line item descriptions render variables as <code className="rounded bg-slate-100 px-1">{"{{variable}}"}</code> from each record.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
        <div>
          <Button className="w-full" onClick={create}>
            + New template
          </Button>
          <ul className="mt-3 space-y-1">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => select(t.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    selectedId === t.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t.name || '(unnamed)'}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {draft && selected ? (
          <Card title={draft.name || 'Untitled template'} subtitle="Invoice templates used by the bulk wizard.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Standard services" />
              <Input
                label="Payment terms (days)"
                type="number"
                min={0}
                value={draft.paymentTermsDays ?? ''}
                onChange={(e) => setDraft({ ...draft, paymentTermsDays: Number(e.target.value) || undefined })}
              />
              <TextArea label="Line item description template" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="e.g. {{description}} — {{invoice_number}}" />
              <TextArea label="Line item description (second part)" value={draft.lineItemDescription ?? ''} onChange={(e) => setDraft({ ...draft, lineItemDescription: e.target.value })} placeholder="Optional — joined with the first part by an em dash" />
              <Input
                label="Account code"
                value={draft.accountCode ?? ''}
                onChange={(e) => setDraft({ ...draft, accountCode: e.target.value })}
                placeholder="e.g. 4100"
              />
              <TextArea label="Support message" value={draft.supportMessage ?? ''} onChange={(e) => setDraft({ ...draft, supportMessage: e.target.value })} placeholder={'Use {{support_number}}'} />
              <Input
                label="Support number"
                value={draft.supportNumber ?? ''}
                onChange={(e) => setDraft({ ...draft, supportNumber: e.target.value })}
                placeholder="e.g. +1 555 000 1234"
              />
            </div>
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Account code is optional — stored per line for bookkeeping (not shown on the invoice). Common codes: 4100 Service Revenue, 4000 Sale of Goods.
            </div>
            <div className="mt-4 flex justify-between">
              <Button variant="danger" onClick={() => setDeleteId(draft.id)}>
                Delete
              </Button>
              <div className="flex items-center gap-2">
                <Badge tone={draft.accountCode ? 'green' : 'amber'}>{draft.accountCode ? `Account ${draft.accountCode}` : 'No account code'}</Badge>
                <Button onClick={save}>Save template</Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <p className="py-8 text-center text-sm text-slate-400">Select a template on the left, or create a new one.</p>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete template?"
        message="Records in progress will keep their current settings, but future imports will not see this template."
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}