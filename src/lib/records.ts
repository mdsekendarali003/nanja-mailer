import type { InvoiceRecordData, LineItemDraft } from '../../shared/types.js'

export function validateRecord(record: InvoiceRecordData): string[] {
  const errors: string[] = []
  if (!record.customerName.trim()) errors.push('Customer name is required')
  if (!record.email.trim()) errors.push('Email is required')
  record.lineItems.forEach((item, i) => {
    if (!item.description.trim()) errors.push(`Line ${i + 1}: description is required`)
    if (!(item.quantity > 0)) errors.push(`Line ${i + 1}: quantity must be greater than 0`)
    if (!(item.unitAmount > 0)) errors.push(`Line ${i + 1}: unit price must be greater than 0`)
  })
  return errors
}

export function recordTotal(record: InvoiceRecordData): number {
  return record.lineItems.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0)
}

export function hasInvalidRecords(records: InvoiceRecordData[]): boolean {
  return records.some((r) => r.errors.length > 0)
}

export function editRecord(records: InvoiceRecordData[], id: string, patch: Partial<InvoiceRecordData>): InvoiceRecordData[] {
  return records.map((record) => {
    if (record.id !== id) return record
    const next = { ...record, ...patch }
    next.errors = validateRecord(next)
    return next
  })
}

export function patchLineItem(
  records: InvoiceRecordData[],
  id: string,
  itemIndex: number,
  patch: Partial<LineItemDraft>,
): InvoiceRecordData[] {
  const record = records.find((r) => r.id === id)
  if (!record) return records
  const lineItems = record.lineItems.map((item, i) => (i === itemIndex ? { ...item, ...patch } : item))
  return editRecord(records, id, { lineItems })
}

export function addLineItem(records: InvoiceRecordData[], id: string): InvoiceRecordData[] {
  const record = records.find((r) => r.id === id)
  if (!record) return records
  const lineItems = [...record.lineItems, { description: '', quantity: 1, unitAmount: 0 }]
  return editRecord(records, id, { lineItems })
}

export function removeLineItem(records: InvoiceRecordData[], id: string, itemIndex: number): InvoiceRecordData[] {
  const record = records.find((r) => r.id === id)
  if (!record || record.lineItems.length <= 1) return records
  const lineItems = record.lineItems.filter((_, i) => i !== itemIndex)
  return editRecord(records, id, { lineItems })
}
