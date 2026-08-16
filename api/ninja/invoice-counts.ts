import type { ApiHandler } from '../_lib/types.js'
import { jsonError } from '../_lib/types.js'
import { fetchClientInvoices, readNinjaConfig } from '../_lib/ninja.js'

const MAX_CLIENTS = 100
const CONCURRENCY = 3

const handler: ApiHandler = async (req, res) => {
  const config = readNinjaConfig(req)
  if (!config) {
    jsonError(res, 400, 'Invoice Ninja is not configured. Add the instance URL and API token on the Settings page.', 'CONFIG_MISSING', false)
    return
  }
  const body = (req.body || {}) as { clientIds?: unknown }
  const ids = Array.isArray(body.clientIds)
    ? body.clientIds.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, MAX_CLIENTS)
    : []
  if (ids.length === 0) {
    res.json({ counts: {}, failed: [] })
    return
  }
  const counts: Record<string, number> = {}
  const failed: string[] = []
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (id) => {
        const { invoices, ok } = await fetchClientInvoices(config, id)
        if (ok) counts[id] = invoices.length
        else failed.push(id)
      }),
    )
  }
  res.json({ counts, failed })
}

export default handler