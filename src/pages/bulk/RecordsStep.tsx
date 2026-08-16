import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { InvoiceRecordData } from '../../../shared/types.js'
import { addLineItem, editRecord, patchLineItem, recordTotal, removeLineItem } from '../../lib/records.js'
import type { InvoiceNumbering } from '../../lib/numbering.js'
import { money } from '../../lib/api.js'
import { useToast } from '../../context/ToastContext.js'
import { Badge, Button, Card, Checkbox, EmptyState, Input } from '../../components/ui.js'

const BULK_DEFAULTS_KEY = 'mailflow_bulk_defaults'

interface BulkDefaults {
  description: string
  quantity: string
  unitPrice: string
}

function loadBulkDefaults(): BulkDefaults {
  try {
    const raw = localStorage.getItem(BULK_DEFAULTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BulkDefaults>
      return {
        description: typeof parsed.description === 'string' ? parsed.description : '',
        quantity: typeof parsed.quantity === 'string' ? parsed.quantity : '',
        unitPrice: typeof parsed.unitPrice === 'string' ? parsed.unitPrice : '',
      }
    }
  } catch {
    // fall through to empty defaults
  }
  return { description: '', quantity: '', unitPrice: '' }
}

function saveBulkDefaults(defaults: BulkDefaults): void {
  try {
    localStorage.setItem(BULK_DEFAULTS_KEY, JSON.stringify(defaults))
  } catch {
    // ignore quota errors
  }
}

export function RecordsStep({
  records,
  setRecords,
  numbering,
  setNumbering,
}: {
  records: InvoiceRecordData[]
  setRecords: (next: InvoiceRecordData[]) => void
  numbering: InvoiceNumbering
  setNumbering: Dispatch<SetStateAction<InvoiceNumbering>>
}) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [bulkDescription, setBulkDescription] = useState(() => loadBulkDefaults().description)
  const [bulkQuantity, setBulkQuantity] = useState(() => loadBulkDefaults().quantity)
  const [bulkUnitPrice, setBulkUnitPrice] = useState(() => loadBulkDefaults().unitPrice)
  const [bulkDate, setBulkDate] = useState('')
  const [bulkDueDate, setBulkDueDate] = useState('')

  const applyItemFields = () => {
    if (records.length === 0) return
    const description = bulkDescription.trim()
    const quantity = bulkQuantity.trim() === '' ? null : Number(bulkQuantity)
    const unitPrice = bulkUnitPrice.trim() === '' ? null : Number(bulkUnitPrice)
    if (quantity !== null && !(quantity > 0)) {
      toast('error', 'Quantity must be greater than 0.')
      return
    }
    if (unitPrice !== null && !Number.isFinite(unitPrice)) {
      toast('error', 'Unit price must be a number.')
      return
    }
    if (!description && quantity === null && unitPrice === null) return
    setRecords(
      records.map((record) => ({
        ...record,
        lineItems: record.lineItems.map((item) => ({
          ...item,
          description: description || item.description,
          quantity: quantity ?? item.quantity,
          unitAmount: unitPrice ?? item.unitAmount,
        })),
      })),
    )
    saveBulkDefaults({ description, quantity: bulkQuantity.trim(), unitPrice: bulkUnitPrice.trim() })
    if (description) setBulkDescription('')
    if (quantity !== null) setBulkQuantity('')
    if (unitPrice !== null) setBulkUnitPrice('')
    toast('success', 'Item fields applied to all records.')
  }

  const applyDates = () => {
    if (records.length === 0) return
    if (!bulkDate && !bulkDueDate) return
    setRecords(
      records.map((record) => ({
        ...record,
        date: bulkDate || record.date,
        dueDate: bulkDueDate || record.dueDate,
      })),
    )
    setBulkDate('')
    setBulkDueDate('')
    toast('success', 'Dates applied to all records.')
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return records
    return records.filter(
      (record) =>
        record.customerName.toLowerCase().includes(q) ||
        record.email.toLowerCase().includes(q) ||
        record.orderNumber?.toLowerCase().includes(q) ||
        record.lineItems.some((i) => i.description.toLowerCase().includes(q)),
    )
  }, [records, search])

  const totals = useMemo(() => records.reduce((sum, r) => sum + recordTotal(r), 0), [records])
  const invalidCount = records.filter((r) => r.errors.length > 0).length

  return (
    <div className="space-y-4">
      <Card title="Bulk edit" subtitle="Set the item, unit price and quantity once — applied to every record.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Item name"
            value={bulkDescription}
            onChange={(e) => setBulkDescription(e.target.value)}
            placeholder="e.g. Monthly hosting"
          />
          <Input label="Unit price" type="number" min={0} step="0.01" value={bulkUnitPrice} onChange={(e) => setBulkUnitPrice(e.target.value)} placeholder="49.00" />
          <Input label="Quantity" type="number" min={0} step="any" value={bulkQuantity} onChange={(e) => setBulkQuantity(e.target.value)} placeholder="1" />
          <div className="flex items-end">
            <Button
              variant="secondary"
              onClick={applyItemFields}
              disabled={
                records.length === 0 ||
                (!bulkDescription.trim() && bulkQuantity.trim() === '' && bulkUnitPrice.trim() === '')
              }
            >
              Apply to all
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Invoice date" type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          <Input label="Due date" type="date" value={bulkDueDate} onChange={(e) => setBulkDueDate(e.target.value)} />
          <div className="flex items-end">
            <Button variant="secondary" onClick={applyDates} disabled={records.length === 0 || (!bulkDate && !bulkDueDate)}>
              Apply dates to all
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          The last-used item, quantity and unit price are remembered for your next import.
        </p>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Checkbox
            checked={numbering.enabled}
            onChange={(e) => setNumbering((prev) => ({ ...prev, enabled: e.target.checked }))}
            label={
              <>
                Auto-assign a unique random invoice number to every invoice (e.g. <span className="font-mono">INV-8QK3M2X9</span>)
              </>
            }
          />
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <Input
              label="Number prefix"
              value={numbering.prefix}
              onChange={(e) => setNumbering((prev) => ({ ...prev, prefix: e.target.value }))}
              className="w-32"
            />
            <p className="max-w-md text-xs text-slate-400">
              Every email gets its own randomly generated number, so nothing can ever clash with an existing invoice in Invoice Ninja.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Review imported records" subtitle="Fix any invalid rows before continuing.">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Records</p>
            <p className="text-lg font-semibold text-slate-800">{records.length}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Total value</p>
            <p className="text-lg font-semibold text-slate-800">{money(totals)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Invalid rows</p>
            <p className={`text-lg font-semibold ${invalidCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{invalidCount}</p>
          </div>
        </div>
        {invalidCount === 0 && records.length > 0 && (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">All records are valid — you can continue.</p>
        )}
      </Card>

      <Card>
        <Input placeholder="Search records…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
        {filtered.length === 0 ? (
          <EmptyState title="No records match your search." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Line item</th>
                  <th className="px-3 py-2 w-20">Qty</th>
                  <th className="px-3 py-2 w-28">Unit price</th>
                  <th className="px-3 py-2 w-28">Item</th>
                  <th className="px-3 py-2 w-28">PO/Ref #</th>
                  <th className="px-3 py-2 w-32">Invoice #</th>
                  <th className="px-3 py-2 w-36">Support #</th>
                  <th className="px-3 py-2 w-32">Date</th>
                  <th className="px-3 py-2 w-32">Status</th>
                </tr>
              </thead>
              {filtered.map((record) => (
                <tbody key={record.id} className={record.errors.length > 0 ? 'bg-red-50/40' : 'bg-white'}>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-1.5">
                      <Input value={record.customerName} onChange={(e) => setRecords(editRecord(records, record.id, { customerName: e.target.value }))} className="w-44" />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input value={record.email} onChange={(e) => setRecords(editRecord(records, record.id, { email: e.target.value }))} className="w-48" />
                    </td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">{record.lineItems.length} line item(s)</td>
                    <td className="px-3 py-1.5" colSpan={3}></td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={record.reference ?? ''}
                        placeholder="—"
                        onChange={(e) => setRecords(editRecord(records, record.id, { reference: e.target.value || undefined }))}
                        className="w-28"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={record.invoiceNumber ?? ''}
                        placeholder="—"
                        onChange={(e) => setRecords(editRecord(records, record.id, { invoiceNumber: e.target.value || undefined }))}
                        className="w-28"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={record.supportNumber ?? ''}
                        placeholder="—"
                        onChange={(e) => setRecords(editRecord(records, record.id, { supportNumber: e.target.value || undefined }))}
                        className="w-32"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="date"
                        value={record.date ?? ''}
                        onChange={(e) => setRecords(editRecord(records, record.id, { date: e.target.value || undefined }))}
                        className="w-32"
                      />
                    </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          {record.errors.length > 0 ? (
                            <Badge tone="red">{record.errors.length} error(s)</Badge>
                          ) : (
                            <Badge tone="green">Valid</Badge>
                          )}
                          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setRecords(addLineItem(records, record.id))}>
                            + Add line
                          </Button>
                        </div>
                      </td>
                    </tr>
                  {record.lineItems.map((item, i) => (
                    <tr key={i} className="border-t border-slate-100 bg-slate-50/50">
                      <td className="px-3 py-1.5 text-xs text-slate-400" colSpan={1}>
                        Line {i + 1}
                      </td>
                      <td className="px-3 py-1.5" colSpan={1}>
                        <Input value={item.description} onChange={(e) => setRecords(patchLineItem(records, record.id, i, { description: e.target.value }))} className="w-64" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" min={0} step="any" value={item.quantity} onChange={(e) => setRecords(patchLineItem(records, record.id, i, { quantity: Number(e.target.value) }))} className="w-20" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" min={0} step="0.01" value={item.unitAmount} onChange={(e) => setRecords(patchLineItem(records, record.id, i, { unitAmount: Number(e.target.value) }))} className="w-28" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input value={item.accountCode ?? ''} placeholder="—" onChange={(e) => setRecords(patchLineItem(records, record.id, i, { accountCode: e.target.value || undefined }))} className="w-28" />
                      </td>
                      <td className="px-3 py-1.5 text-xs text-slate-400" colSpan={5}></td>
                      <td className="px-3 py-1.5">
                        <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setRecords(removeLineItem(records, record.id, i))}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {record.errors.length > 0 && (
                    <tr className="border-t border-red-100">
                      <td colSpan={11} className="px-3 py-1.5 text-xs text-red-600">
                        {record.errors.join(' · ')}
                      </td>
                    </tr>
                  )}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
