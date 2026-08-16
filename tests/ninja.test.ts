import { describe, expect, it } from 'vitest'
import type { InvoiceRecordData, InvoiceTemplate } from '../shared/types.js'
import { buildClientPayload, buildInvoicePayload, isoDate, matchClientToRecord, splitName, type NinjaClientInfo } from '../shared/pure/ninja.js'

const template: InvoiceTemplate = {
  id: 't1',
  name: 'Default',
  accountCode: '4100',
  supportMessage: 'If you have any issues, contact support.',
  paymentTermsDays: 14,
}

function record(overrides: Partial<InvoiceRecordData> = {}): InvoiceRecordData {
  return {
    id: 'r1',
    source: 'csv',
    customerName: 'John Doe',
    email: 'john.doe@example.com',
    lineItems: [{ description: 'Widget', quantity: 2, unitAmount: 25 }],
    errors: [],
    ...overrides,
  }
}

describe('splitName', () => {
  it('splits first and last names', () => {
    expect(splitName('John Doe')).toEqual({ first: 'John', last: 'Doe' })
    expect(splitName('Mary Jane Smith')).toEqual({ first: 'Mary', last: 'Jane Smith' })
    expect(splitName('John')).toEqual({ first: 'John', last: '' })
  })
})

describe('buildClientPayload', () => {
  it('builds name + contact from the record', () => {
    expect(buildClientPayload(record())).toEqual({
      name: 'John Doe',
      contacts: [{ first_name: 'John', last_name: 'Doe', email: 'john.doe@example.com' }],
    })
  })
})

describe('buildInvoicePayload', () => {
  it('maps records, template and client id', () => {
    const payload = buildInvoicePayload(record({ invoiceNumber: 'INV-001', reference: 'PO-9', date: '2026-08-01' }), template, 'client-abc')
    expect(payload.client_id).toBe('client-abc')
    expect(payload.number).toBe('INV-001')
    expect(payload.po_number).toBe('PO-9')
    expect(payload.date).toBe('2026-08-01')
    expect(payload.due_date).toBe('2026-08-15')
    expect(payload.terms).toBe('If you have any issues, contact support.')
    expect(payload.line_items).toEqual([{ product_key: '4100', cost: 25, quantity: 2, notes: 'Widget' }])
  })

  it('omits optional fields when absent', () => {
    const payload = buildInvoicePayload(record(), template)
    expect(payload.number).toBeUndefined()
    expect(payload.po_number).toBeUndefined()
    expect(payload.due_date).toBe(isoDate(undefined, 14)) // today + 14 days
  })

  it('uses the item name (description) as the invoice line notes', () => {
    const payload = buildInvoicePayload(record(), template, 'c1')
    expect(payload.line_items[0].notes).toBe('Widget')
    expect(payload.line_items[0].product_key).toBe('4100')
  })

  it('uses per-item item code over template item code', () => {
    const payload = buildInvoicePayload(
      record({ lineItems: [{ description: 'A', quantity: 1, unitAmount: 5, accountCode: '2000' }] }),
      template,
      'c1',
    )
    expect(payload.line_items[0].product_key).toBe('2000')
  })

  it('omits product_key when no item code is set', () => {
    const payload = buildInvoicePayload(record({ lineItems: [{ description: 'A', quantity: 1, unitAmount: 5 }] }), { ...template, accountCode: undefined }, 'c1')
    expect(payload.line_items[0].product_key).toBeUndefined()
  })

  it('uses the explicit due date over template payment terms', () => {
    const payload = buildInvoicePayload(record({ date: '2026-08-01', dueDate: '2026-09-30' }), template, 'c1')
    expect(payload.due_date).toBe('2026-09-30')
  })

  it('substitutes the record support number into the support message', () => {
    const tpl: InvoiceTemplate = { ...template, supportMessage: 'Call us at {{support_number}} if you need help.' }
    const payload = buildInvoicePayload(record({ supportNumber: 'SUP-123' }), tpl, 'c1')
    expect(payload.terms).toBe('Call us at SUP-123 if you need help.')
  })

  it('falls back to the template support number when the record has none', () => {
    const tpl: InvoiceTemplate = { ...template, supportMessage: 'Call {{support_number}}', supportNumber: 'TPL-999' }
    const payload = buildInvoicePayload(record(), tpl, 'c1')
    expect(payload.terms).toBe('Call TPL-999')
  })

  it('empties the placeholder when no support number is set anywhere', () => {
    const tpl: InvoiceTemplate = { ...template, supportMessage: 'Call {{support_number}}' }
    const payload = buildInvoicePayload(record(), tpl, 'c1')
    expect(payload.terms).toBe('Call ')
  })
})

describe('matchClientToRecord', () => {
  const clients: NinjaClientInfo[] = [
    { id: 'c1', name: 'John Doe', email: 'john.doe@example.com' },
    { id: 'c2', name: 'Acme Corp', email: 'billing@acme.com' },
  ]

  it('matches by email first', () => {
    expect(matchClientToRecord(clients, record())?.id).toBe('c1')
  })

  it('matches by normalized name when email differs', () => {
    expect(matchClientToRecord(clients, record({ email: 'other@x.com' }))?.id).toBe('c1')
  })

  it('is case and punctuation insensitive', () => {
    expect(matchClientToRecord(clients, record({ email: 'other@x.com', customerName: 'John. Doe' }))?.id).toBe('c1')
  })

  it('returns undefined when nothing matches', () => {
    expect(matchClientToRecord(clients, record({ email: 'x@x.com', customerName: 'Nobody Here' }))).toBeUndefined()
  })
})
