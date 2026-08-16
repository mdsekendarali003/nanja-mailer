export interface InvoiceNumbering {
  enabled: boolean
  prefix: string
}

const NUMBERING_KEY = 'mailflow_numbering'
const COUNTS_KEY = 'mailflow_invoice_counts'

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readNumbering(): InvoiceNumbering {
  try {
    const raw = storage()?.getItem(NUMBERING_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<InvoiceNumbering>
      return { enabled: parsed.enabled !== false, prefix: typeof parsed.prefix === 'string' ? parsed.prefix : 'INV' }
    }
  } catch {
    // fall through to default
  }
  return { enabled: true, prefix: 'INV' }
}

export function saveNumbering(numbering: InvoiceNumbering): void {
  storage()?.setItem(NUMBERING_KEY, JSON.stringify(numbering))
}

export function readCounts(): Record<string, number> {
  try {
    const raw = storage()?.getItem(COUNTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const out: Record<string, number> = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
      }
      return out
    }
  } catch {
    // fall through
  }
  return {}
}

export function writeCounts(counts: Record<string, number>): void {
  storage()?.setItem(COUNTS_KEY, JSON.stringify(counts))
}

export function mergeCounts(fetched: Record<string, number>): Record<string, number> {
  const counts = readCounts()
  for (const [key, value] of Object.entries(fetched)) {
    if (Number.isFinite(value)) counts[key] = Math.max(counts[key] ?? 0, value)
  }
  writeCounts(counts)
  return counts
}

export function bumpCount(clientId: string): number {
  const counts = readCounts()
  const next = (counts[clientId] ?? 0) + 1
  counts[clientId] = next
  writeCounts(counts)
  return next
}

export function formatInvoiceNumber(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(4, '0')}`
}

export function nextInvoiceNumber(clientId: string, prefix: string): string {
  return formatInvoiceNumber(prefix, (readCounts()[clientId] ?? 0) + 1)
}

export function randomInvoiceNumber(prefix: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint32Array(8)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  }
  let out = ''
  for (let i = 0; i < 8; i++) {
    const value = bytes[i] ?? Math.floor(Math.random() * 0x100000000)
    out += alphabet[value % alphabet.length]
  }
  return `${prefix}-${out}`
}
