import { describe, it, expect } from 'vitest'
import { parseCsv, parseCsvToRecords, detectColumnIndexes, validateRow } from '../shared/pure/csv.js'

const VALID_CSV = [
  'customer_name,email,description,qty,unit_price,account_code,support_number,invoice_number,date',
  'Acme Corp,billing@acme.com,Hosting,2,50.00,4100,SUP-1,INV-1,2026-08-01',
  'Globex Inc,sales@globex.com,Setup,1,99.99,,SUP-2,INV-2,2026-08-02',
].join('\n')

describe('parseCsv', () => {
  it('parses simple rows', () => {
    const rows = parseCsv('a,b\n1,2\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
  it('handles quoted fields with commas and quotes', () => {
    const rows = parseCsv('"Hello, world","say ""hi"""\n')
    expect(rows).toEqual([['Hello, world', 'say "hi"']])
  })
  it('handles CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n')
    expect(rows).toHaveLength(2)
  })
  it('skips empty lines', () => {
    const rows = parseCsv('a,b\n\n\n1,2\n')
    expect(rows).toHaveLength(2)
  })
})

describe('detectColumnIndexes', () => {
  it('detects aliased headers', () => {
    const idx = detectColumnIndexes(['Customer Name', 'Email Address', 'Item', 'Qty', 'Price', 'Postcode'])
    expect(idx.customerName).toBe(0)
    expect(idx.email).toBe(1)
    expect(idx.description).toBe(2)
    expect(idx.qty).toBe(3)
    expect(idx.unitPrice).toBe(4)
    expect(idx.postalCode).toBe(5)
  })
  it('supports invoice# and zip aliases', () => {
    const idx = detectColumnIndexes(['name', 'invoice#', 'zip'])
    expect(idx.customerName).toBe(0)
    expect(idx.invoiceNumber).toBe(1)
    expect(idx.postalCode).toBe(2)
  })
})

describe('parseCsvToRecords', () => {
  it('maps a valid file into records', () => {
    const result = parseCsvToRecords(VALID_CSV)
    expect(result.rejected).toBe(false)
    expect(result.records).toHaveLength(2)
    const [first, second] = result.records
    expect(first.customerName).toBe('Acme Corp')
    expect(first.email).toBe('billing@acme.com')
    expect(first.lineItems[0]).toMatchObject({ description: 'Hosting', quantity: 2, unitAmount: 50 })
    expect(first.accountCode?.length ?? first.lineItems[0].accountCode).toBe('4100')
    expect(first.lineItems[0].accountCode).toBe('4100')
    expect(first.supportNumber).toBe('SUP-1')
    expect(first.invoiceNumber).toBe('INV-1')
    expect(first.date).toBe('2026-08-01')
    expect(first.source).toBe('csv')
    expect(second.lineItems[0].accountCode).toBeUndefined()
  })

  it('rejects when required columns are missing', () => {
    const result = parseCsvToRecords('name,email\nAcme,a@b.com\n')
    expect(result.rejected).toBe(true)
    expect(result.message).toMatch(/Required columns not found/)
  })

  it('collects per-row errors for invalid rows', () => {
    const csv = [
      'customer_name,email,description,qty,unit_price',
      'Good,good@x.com,Thing,1,10',
      'Bad,no qty here',
      'Worse,,Also no price',
    ].join('\n')
    const result = parseCsvToRecords(csv)
    expect(result.records).toHaveLength(1)
    expect(result.rowErrors).toHaveLength(2)
    expect(result.rowErrors[0].join(' ')).toMatch(/missing item description|missing quantity|missing unit price/)
  })

  it('rejects the file when more than 10% of rows are invalid', () => {
    const csv = [
      'customer_name,email,description,qty,unit_price',
      'Good,good@x.com,Thing,1,10',
      'Bad,one,,',
      'Bad,two,,',
      'Bad,three,,',
    ].join('\n')
    const result = parseCsvToRecords(csv)
    expect(result.rejected).toBe(true)
    expect(result.message).toMatch(/more than 10%/)
  })

  it('accepts files where invalid rows are under 10%', () => {
    const good = (i: number) => `Good,good${i}@x.com,Thing,1,10`
    const csv = [
      'customer_name,email,description,qty,unit_price',
      ...Array.from({ length: 10 }, (_, i) => good(i)),
      'Bad,bad@x.com,,',
    ].join('\n')
    const result = parseCsvToRecords(csv)
    expect(result.rejected).toBe(false)
    expect(result.records).toHaveLength(10)
  })

  it('strips currency symbols from unit prices', () => {
    const result = parseCsvToRecords('customer_name,email,description,qty,unit_price\nAcme,a@b.com,Thing,1,$49.99\n')
    expect(result.records[0].lineItems[0].unitAmount).toBe(49.99)
  })

  it('reports non-numeric quantity and price', () => {
    const csv = 'customer_name,email,description,qty,unit_price\nAcme,a@b.com,Thing,two,ten\n'
    const result = parseCsvToRecords(csv)
    expect(result.rowErrors).toHaveLength(1)
    expect(result.rowErrors[0].join(' ')).toMatch(/not a number/)
  })

  it('handles empty files gracefully', () => {
    const result = parseCsvToRecords('')
    expect(result.records).toHaveLength(0)
    expect(result.rejected).toBe(false)
  })
})

describe('validateRow', () => {
  it('flags missing required fields', () => {
    const columns = { customerName: 0, email: 1, description: 2, qty: 3, unitPrice: 4 }
    const { errors } = validateRow(['', '', '', '', ''], columns, 2)
    expect(errors.join(' ')).toMatch(/missing customer name/)
    expect(errors.join(' ')).toMatch(/missing item description/)
    expect(errors.join(' ')).toMatch(/missing quantity/)
    expect(errors.join(' ')).toMatch(/missing unit price/)
  })
  it('passes a fully valid row', () => {
    const columns = { customerName: 0, email: 1, description: 2, qty: 3, unitPrice: 4 }
    const { errors, record } = validateRow(['Acme', 'a@b.com', 'Thing', '3', '7.50'], columns, 2)
    expect(errors).toHaveLength(0)
    expect(record?.lineItems[0].quantity).toBe(3)
    expect(record?.lineItems[0].unitAmount).toBe(7.5)
  })
})