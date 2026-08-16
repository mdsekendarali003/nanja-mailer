import type { ApiHandler } from '../_lib/types.js'
import { mapNinjaError, ninjaApiCallWithRetry, parseNinjaData, readNinjaConfig } from '../_lib/ninja.js'
import { jsonError } from '../_lib/types.js'
import type { ApiError, NinjaInvoicePayload } from '../../shared/types.js'

interface CreateItem {
  id: string
  clientId: string
  payload: NinjaInvoicePayload
}

interface InvoiceActionResult {
  id: string
  ok: boolean
  invoiceId?: string
  invoiceNumber?: string
  error?: ApiError
}

const handler: ApiHandler = async (req, res) => {
  const config = readNinjaConfig(req)
  if (!config) {
    jsonError(res, 400, 'Invoice Ninja is not configured. Add the instance URL and API token on the Settings page.', 'CONFIG_MISSING', false)
    return
  }
  const body = (req.body || {}) as { items?: CreateItem[] }
  const items = Array.isArray(body.items) ? body.items.slice(0, 10) : []
  if (items.length === 0) {
    jsonError(res, 400, 'No invoices to create.', 'BAD_REQUEST', false)
    return
  }
  const results: InvoiceActionResult[] = []
  for (const item of items) {
    if (!item.clientId) {
      results.push({ id: item.id, ok: false, error: { error: 'No client assigned to this record.', errorCode: 'NO_CLIENT', retryable: false } })
      continue
    }
    try {
      const result = await ninjaApiCallWithRetry(config, '/invoices', { method: 'POST', body: item.payload })
      if (result.status === 200) {
        const data = parseNinjaData<{ id?: string; number?: string }>(result) ?? {}
        results.push({ id: item.id, ok: true, invoiceId: data.id, invoiceNumber: data.number })
      } else {
        const mapped = mapNinjaError(result.status, result.text)
        results.push({ id: item.id, ok: false, error: mapped })
      }
    } catch {
      results.push({ id: item.id, ok: false, error: { error: 'Unexpected error creating the invoice.', errorCode: 'UNEXPECTED', retryable: true } })
    }
  }
  res.json({ results })
}

export default handler