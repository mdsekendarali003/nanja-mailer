import type { ApiHandler } from '../_lib/types.js'
import { jsonError } from '../_lib/types.js'
import { mapNinjaError, ninjaApiCallWithRetry, readNinjaConfig } from '../_lib/ninja.js'

const PER_PAGE = 500
const MAX_PAGES = 20
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
        let total = 0
        try {
          for (let page = 1; page <= MAX_PAGES; page++) {
            const result = await ninjaApiCallWithRetry(config, `/invoices?client_id=${encodeURIComponent(id)}&per_page=${PER_PAGE}&page=${page}`)
            if (result.status !== 200) {
              const mapped = mapNinjaError(result.status, result.text)
              console.warn(`invoice-counts client=${id}: ${mapped.errorCode} ${mapped.error}`)
              failed.push(id)
              return
            }
            const raw = (result.json as unknown[] | undefined) || []
            total += raw.length
            if (raw.length < PER_PAGE) break
          }
          counts[id] = total
        } catch {
          failed.push(id)
        }
      }),
    )
  }
  res.json({ counts, failed })
}

export default handler
