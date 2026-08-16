import type { InvoiceRecordData, LineItemDraft } from '../types.js'

export interface CsvRow {
  cells: string[]
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((c) => c.trim() !== '')) rows.push(row)
  }
  return rows
}

export const COLUMN_ALIASES: Record<string, string[]> = {
  customerName: ['customer_name', 'customer name', 'name', 'customer', 'client', 'customer name'],
  email: ['email', 'email_address', 'e-mail'],
  phone: ['phone', 'telephone', 'phone_number', 'tel', 'mobile'],
  address: ['address', 'address1', 'street', 'street_address', 'line1'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  postalCode: ['postal_code', 'postcode', 'postal code', 'zip', 'zip_code', 'zipcode'],
  country: ['country'],
  description: ['description', 'item', 'item_description', 'line_item', 'product', 'product_name'],
  qty: ['qty', 'quantity', 'units', 'qty_ordered'],
  unitPrice: ['unit_price', 'unit price', 'price', 'amount', 'unit_amount', 'unitamount'],
  accountCode: ['account_code', 'account code', 'account', 'chart_of_account'],
  supportNumber: ['support_number', 'support number', 'support_ref', 'ticket'],
  invoiceNumber: ['invoice_number', 'invoice number', 'invoice#', 'invoice', 'number'],
  date: ['date', 'invoice_date', 'order_date', 'created'],
}

const HEADER_ALIASES: Record<string, string[]> = {
  customerName: ['customer_name', 'customer name', 'name', 'customer', 'client'],
  email: ['email', 'email_address', 'email address', 'e-mail'],
  phone: ['phone', 'telephone', 'phone_number', 'tel', 'mobile'],
  address: ['address', 'address1', 'street', 'street_address'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  postalCode: ['postal_code', 'postcode', 'zip', 'zip_code'],
  country: ['country'],
  description: ['description', 'item', 'item_description', 'line_item', 'product', 'product_name'],
  qty: ['qty', 'quantity', 'units'],
  unitPrice: ['unit_price', 'unit price', 'price', 'amount', 'unit_amount'],
  accountCode: ['account_code', 'account code', 'account'],
  supportNumber: ['support_number', 'support number', 'support_ref'],
  invoiceNumber: ['invoice_number', 'invoice number', 'invoice#', 'invoice'],
  date: ['date', 'invoice_date', 'order_date'],
}

export interface CsvImportResult {
  records: InvoiceRecordData[]
  rowErrors: string[][]
  totalRows: number
  rejected: boolean
  message?: string
}

export function detectColumnIndexes(headerCells: string[]): Record<string, number> {
  const header = headerCells.map((h) => h.trim().toLowerCase())
  const found: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = header.findIndex((h) => aliases.some((a) => a === h || a === h.replace(/\s+/g, ' ')))
    if (idx >= 0) found[field] = idx
  }
  return found
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null
  const cleaned = value.replace(/[$£€,\s]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function makeRecordId(): string {
  const c = globalThis as { crypto?: { randomUUID?: () => string } }
  if (c.crypto?.randomUUID) return c.crypto.randomUUID()
  return 'rec-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function validateRow(
  row: string[],
  columns: Record<string, number>,
  rowIndex: number,
): { record?: InvoiceRecordData; errors: string[] } {
  const errors: string[] = []
  const cell = (field: string) => {
    const idx = columns[field]
    return idx === undefined ? undefined : (row[idx] || '').trim()
  }

  const name = cell('customerName')
  const description = cell('description')
  const qtyRaw = cell('qty')
  const priceRaw = cell('unitPrice')

  if (!name) errors.push(`Row ${rowIndex}: missing customer name`)
  if (!description) errors.push(`Row ${rowIndex}: missing item description`)
  if (!qtyRaw) errors.push(`Row ${rowIndex}: missing quantity`)
  else if (toNumber(qtyRaw) === null) errors.push(`Row ${rowIndex}: quantity "${qtyRaw}" is not a number`)

  const unitPrice = priceRaw ? toNumber(priceRaw) : null
  if (!priceRaw) errors.push(`Row ${rowIndex}: missing unit price`)
  else if (unitPrice === null) errors.push(`Row ${rowIndex}: unit price "${priceRaw}" is not a number`)

  const accountCode = cell('accountCode')
  if (errors.length > 0) return { errors }

  const quantity = toNumber(qtyRaw as string) as number
  const lineItems: LineItemDraft[] = [
    {
      description: description as string,
      quantity,
      unitAmount: unitPrice as number,
      accountCode: accountCode || undefined,
    },
  ]

  const record: InvoiceRecordData = {
    id: makeRecordId(),
    source: 'csv',
    customerName: name as string,
    email: cell('email') || '',
    phone: cell('phone') || undefined,
    address: cell('address') || undefined,
    city: cell('city') || undefined,
    state: cell('state') || undefined,
    postalCode: cell('postalCode') || undefined,
    country: cell('country') || undefined,
    lineItems,
    supportNumber: cell('supportNumber') || undefined,
    invoiceNumber: cell('invoiceNumber') || undefined,
    date: cell('date') || undefined,
    errors: [],
  }
  return { record, errors: [] }
}

export function parseCsvToRecords(text: string): CsvImportResult {
  const rows = parseCsv(text)
  if (rows.length === 0) return { records: [], rowErrors: [], totalRows: 0, rejected: false }
  const columns = detectColumnIndexes(rows[0])
  const missing: string[] = []
  for (const field of ['customerName', 'description', 'qty', 'unitPrice']) {
    if (columns[field] === undefined) missing.push(field)
  }
  if (missing.length > 0) {
    const message = `Required columns not found: ${missing.join(', ')}. Expected aliases of: customer name, description/item, qty/quantity, unit price/price/amount.`
    return { records: [], rowErrors: [], totalRows: 0, rejected: true, message }
  }
  const dataRows = rows.slice(1)
  const records: InvoiceRecordData[] = []
  const rowErrors: string[][] = []
  dataRows.forEach((row, i) => {
    const { record, errors } = validateRow(row, columns, i + 2)
    if (record && errors.length === 0) records.push(record)
    else rowErrors.push(errors.length > 0 ? errors : [`Row ${i + 2}: empty row`])
  })
  const invalidCount = rowErrors.length
  const rejected = dataRows.length > 0 && invalidCount / dataRows.length > 0.1
  return {
    records,
    rowErrors,
    totalRows: dataRows.length,
    rejected,
    message: rejected
      ? `${invalidCount} of ${dataRows.length} rows are invalid (${Math.round((invalidCount / dataRows.length) * 100)}%). The file was rejected because more than 10% of rows are invalid.`
      : undefined,
  }
}

export const CSV_TEMPLATE_HEADER = [
  'customer_name',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'postal_code',
  'country',
  'description',
  'qty',
  'unit_price',
  'account_code',
  'support_number',
  'invoice_number',
  'date',
]

export const CSV_TEMPLATE_SAMPLE = [
  'Acme Corp',
  'billing@acme.com',
  '555-0100',
  '1 Main St',
  'Springfield',
  'IL',
  '62701',
  'US',
  'Monthly hosting',
  '1',
  '49.00',
  '4100',
  'SUP-123',
  'INV-1001',
  '2026-08-01',
]