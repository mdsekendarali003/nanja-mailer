import type { InvoiceRecordData, InvoiceTemplate, NinjaClientInfo, NinjaInvoicePayload, NinjaLineItemPayload } from '../types.js'

export interface NinjaClientPayload {
  name: string
  contacts: { first_name: string; last_name: string; email: string }[]
}

export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  const first = parts[0] ?? ''
  const last = parts.slice(1).join(' ')
  return { first, last }
}

export function buildClientPayload(record: InvoiceRecordData): NinjaClientPayload {
  const { first, last } = splitName(record.customerName)
  return {
    name: record.customerName.trim(),
    contacts: [{ first_name: first, last_name: last, email: record.email.trim() }],
  }
}

export function isoDate(date: string | undefined, offsetDays = 0): string {
  const base = date ? new Date(`${date}T00:00:00`) : new Date()
  if (Number.isNaN(base.getTime())) return ''
  const d = new Date(base)
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function buildInvoicePayload(record: InvoiceRecordData, template: InvoiceTemplate | undefined, clientId: string): NinjaInvoicePayload {
  const lineItems: NinjaLineItemPayload[] = record.lineItems.map((item) => {
    const payload: NinjaLineItemPayload = {
      cost: item.unitAmount,
      quantity: item.quantity,
      notes: '',
    }
    const itemName = item.description.trim()
    if (itemName) payload.product_key = itemName
    const accountCode = item.accountCode?.trim() || template?.accountCode?.trim()
    if (accountCode) payload.income_account_id = accountCode
    return payload
  })
  const payload: NinjaInvoicePayload = {
    client_id: clientId,
    date: isoDate(record.date),
    line_items: lineItems,
  }
  if (record.invoiceNumber?.trim()) payload.number = record.invoiceNumber.trim()
  if (record.reference?.trim()) payload.po_number = record.reference.trim()
  if (template?.supportMessage?.trim()) {
    const supportNumber = record.supportNumber?.trim() || template.supportNumber?.trim() || ''
    payload.terms = template.supportMessage.trim().replace(/\{\{\s*support_number\s*\}\}/g, supportNumber)
  }
  if (record.dueDate?.trim()) {
    const due = isoDate(record.dueDate)
    if (due) payload.due_date = due
  } else {
    const termsDays = template?.paymentTermsDays
    if (termsDays && termsDays > 0) {
      const due = isoDate(record.date, termsDays)
      if (due) payload.due_date = due
    }
  }
  return payload
}

export function normalizeNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchClientToRecord(clients: NinjaClientInfo[], record: InvoiceRecordData): NinjaClientInfo | undefined {
  const email = record.email.trim().toLowerCase()
  if (email) {
    const byEmail = clients.find((c) => c.email?.trim().toLowerCase() === email)
    if (byEmail) return byEmail
  }
  const name = normalizeNameForMatch(record.customerName)
  if (!name) return undefined
  return clients.find((c) => normalizeNameForMatch(c.name) === name)
}
