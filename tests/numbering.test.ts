import { describe, expect, it } from 'vitest'
import type { InvoiceRecordData, InvoiceTemplate } from '../shared/types.js'
import { formatInvoiceNumber } from '../src/lib/numbering.js'
import { assignInvoiceNumbers, buildCreateItems, makeWizardRecord, type CreateItem } from '../src/lib/wizard.js'

describe('formatInvoiceNumber', () => {
  it('zero-pads to four digits', () => {
    expect(formatInvoiceNumber('INV', 1)).toBe('INV0001')
    expect(formatInvoiceNumber('INV', 42)).toBe('INV0042')
    expect(formatInvoiceNumber('INV', 9999)).toBe('INV9999')
    expect(formatInvoiceNumber('INV', 10000)).toBe('INV10000')
  })
})

describe('assignInvoiceNumbers', () => {
  function item(id: string, clientId: string, number?: string): CreateItem {
    return { id, clientId, payload: { client_id: clientId, date: '2026-08-15', line_items: [], ...(number ? { number } : {}) } }
  }

  it('numbers sequentially per client starting from the stored count', () => {
    const items = [item('a', 'c1'), item('b', 'c1'), item('c', 'c2'), item('d', 'c2'), item('e', 'c1')]
    const numbered = assignInvoiceNumbers(items, { c1: 7, c2: 0 }, 'INV')
    expect(numbered.map((i) => i.payload.number)).toEqual(['INV0008', 'INV0009', 'INV0001', 'INV0002', 'INV0010'])
    expect(numbered.map((i) => i.autoNumbered)).toEqual([true, true, true, true, true])
  })

  it('keeps explicit numbers untouched and does not consume the sequence', () => {
    const items = [item('a', 'c1', 'PO-1'), item('b', 'c1')]
    const numbered = assignInvoiceNumbers(items, {}, 'INV')
    expect(numbered[0].payload.number).toBe('PO-1')
    expect(numbered[0].autoNumbered).toBeUndefined()
    expect(numbered[1].payload.number).toBe('INV0001')
  })
})

describe('buildCreateItems', () => {
  const template: InvoiceTemplate = {
    id: 't1',
    name: 'Default',
    accountCode: '4100',
    paymentTermsDays: 14,
  }

  function record(customerName: string, email: string): InvoiceRecordData {
    return {
      id: customerName,
      source: 'emails',
      customerName,
      email,
      lineItems: [{ description: 'Monthly hosting', quantity: 1, unitAmount: 49 }],
      errors: [],
    }
  }

  it('skips numbering when disabled', () => {
    const records = [
      { ...makeWizardRecord(record('A', 'a@x.com')), client: { status: 'matched', clientId: 'c1', source: 'auto' } },
      { ...makeWizardRecord(record('B', 'b@x.com')), client: { status: 'matched', clientId: 'c1', source: 'auto' } },
    ]
    const items = buildCreateItems(records, template, { enabled: false, prefix: 'INV' })
    expect(items.map((i) => i.payload.number)).toEqual([undefined, undefined])
  })

  it('assigns per-client sequential numbers when enabled', () => {
    const records = [
      { ...makeWizardRecord(record('A', 'a@x.com')), client: { status: 'matched', clientId: 'c1', source: 'auto' } },
      { ...makeWizardRecord(record('B', 'b@x.com')), client: { status: 'matched', clientId: 'c2', source: 'auto' } },
    ]
    const items = buildCreateItems(records, template, { enabled: true, prefix: 'INV' })
    expect(items.map((i) => i.payload.number)).toEqual(['INV0001', 'INV0001'])
  })

  it('skips records without a client', () => {
    const records = [makeWizardRecord(record('A', 'a@x.com'))]
    const items = buildCreateItems(records, template, { enabled: true, prefix: 'INV' })
    expect(items).toEqual([])
  })
})