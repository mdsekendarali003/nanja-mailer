import type { ApiHandler } from '../_lib/types.js'
import { jsonError } from '../_lib/types.js'
import { fetchClientInvoices, readNinjaConfig } from '../_lib/ninja.js'

interface CheckItem {
  key: string
  clientId: string
  number: string
}

interface CheckResult {
  key: string
  found: boolean
  checked: boolean
  invoiceId?: string
}

const MAX_ITEMS = 100
const CONCURRENCY = 3

function isCheckItem(x: unknown): x is CheckItem {
  if (!x || typeof x !== 'object') return false
  const item = x as Record<string, unknown>
  return typeof item.key === 'string' && typeof item.clientId === 'string' && typeof item.number === 'string'
}

const handler: ApiHandler = async (req, res) => {
  const config = readNinjaConfig(req)
  if (!config) {
    jsonError(res, 400, 'Invoice Ninja is not configured. Add the instance URL and API token on the Settings page.', 'CONFIG_MISSING', false)
    return
  }
  const body = (req.body || {}) as { items?: unknown }
  const items = Array.isArray(body.items) ? body.items.filter(isCheckItem).slice(0, MAX_ITEMS) : []
  if (items.length === 0) {
    res.json({ results: [] })
    return
  }
  const byClient = new Map<string, CheckItem[]>()
  for (const item of items) {
    const list = byClient.get(item.clientId) ?? []
    list.push(item)
    byClient.set(item.clientId, list)
  }
  const results: CheckResult[] = []
  const clientEntries = [...byClient.entries()]
  for (let i = 0; i < clientEntries.length; i += CONCURRENCY) {
    await Promise.all(
      clientEntries.slice(i, i + CONCURRENCY).map(async ([clientId, checks]) => {
        const { invoices, ok } = await fetchClientInvoices(config, clientId)
        const byNumber = new Map<string, string>()
        for (const inv of invoices) {
          const num = inv.number?.trim().toLowerCase()
          if (num && !byNumber.has(num)) byNumber.set(num, inv.id)
        }
        for (const check of checks) {
          const match = byNumber.get(check.number.trim().toLowerCase())
          if (ok && match) results.push({ key: check.key, found: true, checked: true, invoiceId: match })
          else results.push({ key: check.key, found: false, checked: ok })
        }
      }),
    )
  }
  res.json({ results })
}

export default handler