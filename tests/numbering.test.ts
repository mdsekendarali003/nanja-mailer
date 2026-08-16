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

  const RANDOM = /^INV-[A-Z0-9]{8}$/

  it('assigns a unique random number to every item', () => {
    const items = [item('a', 'c1'), item('b', 'c1'), item('c', 'c2'), item('d', 'c2'), item('e', 'c1')]
    const numbered = assignInvoiceNumbers(items, {}, 'INV')
    const numbers = numbered.map((i) => i.payload.number)
    expect(numbers.length).toBe(5)
    expect(new Set(numbers).size).toBe(5)
    for (const number of numbers) expect(number).toMatch(RANDOM)
    expect(numbered.map((i) => i.autoNumbered)).toEqual([true, true, true, true, true])
  })

  it('keeps explicit numbers untouched and still randomizes the rest', () => {
    const items = [item('a', 'c1', 'PO-1'), item('b', 'c1')]
    const numbered = assignInvoiceNumbers(items, {}, 'INV')
    expect(numbered[0].payload.number).toBe('PO-1')
    expect(numbered[0].autoNumbered).toBeUndefined()
    expect(numbered[1].payload.number).toMatch(RANDOM)
    expect(numbered[1].autoNumbered).toBe(true)
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

  it('assigns unique random numbers when enabled', () => {
    const records = [
      { ...makeWizardRecord(record('A', 'a@x.com')), client: { status: 'matched', clientId: 'c1', source: 'auto' } },
      { ...makeWizardRecord(record('B', 'b@x.com')), client: { status: 'matched', clientId: 'c2', source: 'auto' } },
    ]
    const items = buildCreateItems(records, template, { enabled: true, prefix: 'INV' })
    const numbers = items.map((i) => i.payload.number)
    for (const number of numbers) expect(number).toMatch(/^INV-[A-Z0-9]{8}$/)
    expect(new Set(numbers).size).toBe(2)
  })

  it('skips records without a client', () => {
    const records = [makeWizardRecord(record('A', 'a@x.com'))]
    const items = buildCreateItems(records, template, { enabled: true, prefix: 'INV' })
    expect(items).toEqual([])
  })
})