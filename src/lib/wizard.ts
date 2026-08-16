import type { ClientMatchState, InvoiceRecordData, InvoiceTemplate, NinjaInvoicePayload } from '../../shared/types.js'
import { buildInvoicePayload } from '../../shared/pure/ninja.js'
import { validateRecord } from './records.js'
import { randomInvoiceNumber, type InvoiceNumbering } from './numbering.js'

export interface WizardRecord {
  record: InvoiceRecordData
  client: ClientMatchState
  flags: { create: boolean; markSent: boolean; email: boolean }
  invoiceId?: string
  invoiceNumber?: string
}

export interface CreateItem {
  id: string
  clientId: string
  payload: NinjaInvoicePayload
  autoNumbered?: boolean
}

export type ExecuteItemStatus = 'pending' | 'created' | 'sent' | 'emailed' | 'error'

export interface ExecuteStatusItem {
  id: string
  status: ExecuteItemStatus
  message?: string
  invoiceId?: string
}

export function makeWizardRecord(record: InvoiceRecordData): WizardRecord {
  const recordWithErrors = { ...record, errors: validateRecord(record) }
  return {
    record: recordWithErrors,
    client: { status: 'unmatched' },
    flags: { create: true, markSent: true, email: true },
  }
}

export function hasInvalidRecords(records: WizardRecord[]): boolean {
  return records.some((w) => w.record.errors.length > 0)
}

export function isUnmatched(w: WizardRecord): boolean {
  return w.client.status === 'unmatched' || w.client.status === 'not_found'
}

export function hasUnmatchedNonSkipped(records: WizardRecord[]): boolean {
  return records.some((w) => isUnmatched(w))
}

export function hasAnyCreate(records: WizardRecord[]): boolean {
  return records.some((w) => w.flags.create)
}

export function assignClient(records: WizardRecord[], id: string, state: Partial<ClientMatchState>): WizardRecord[] {
  return records.map((w) => {
    if (w.record.id !== id) return w
    return { ...w, client: { ...w.client, ...state } }
  })
}

export function assignInvoiceNumbers(items: CreateItem[], _counts: Record<string, number>, prefix: string): CreateItem[] {
  const used = new Set<string>()
  const make = (): string => {
    let number = randomInvoiceNumber(prefix)
    while (used.has(number)) number = randomInvoiceNumber(prefix)
    used.add(number)
    return number
  }
  return items.map((item) => {
    if (item.payload.number) return item
    return { ...item, payload: { ...item.payload, number: make() }, autoNumbered: true }
  })
}

export function buildCreateItems(
  records: WizardRecord[],
  template: InvoiceTemplate | undefined,
  numbering: InvoiceNumbering | undefined,
): CreateItem[] {
  const items: CreateItem[] = []
  for (const w of records) {
    if (!w.flags.create) continue
    if (!w.client.clientId) continue
    items.push({ id: w.record.id, clientId: w.client.clientId, payload: buildInvoicePayload(w.record, template, w.client.clientId) })
  }
  if (numbering?.enabled) {
    const prefix = numbering.prefix.trim() || 'INV'
    return assignInvoiceNumbers(items, {}, prefix)
  }
  return items
}
