import type { ApiHandler } from '../_lib/types.js'
import { mapNinjaError, ninjaApiCallWithRetry, readNinjaConfig } from '../_lib/ninja.js'
import { jsonError } from '../_lib/types.js'
import type { ApiError } from '../../shared/types.js'

type Action = 'mark_sent' | 'email'

interface ActionItem {
  id: string
  invoiceId: string
}

interface ActionResult {
  id: string
  ok: boolean
  error?: ApiError
}

const handler: ApiHandler = async (req, res) => {
  const config = readNinjaConfig(req)
  if (!config) {
    jsonError(res, 400, 'Invoice Ninja is not configured. Add the instance URL and API token on the Settings page.', 'CONFIG_MISSING', false)
    return
  }
  const body = (req.body || {}) as { action?: Action; items?: ActionItem[] }
  const action = body.action
  const items = Array.isArray(body.items) ? body.items.slice(0, 10) : []
  if (action !== 'mark_sent' && action !== 'email') {
    jsonError(res, 400, 'Invalid action.', 'BAD_REQUEST', false)
    return
  }
  if (items.length === 0) {
    jsonError(res, 400, 'No invoices provided.', 'BAD_REQUEST', false)
    return
  }
  const results: ActionResult[] = []
  for (const item of items) {
    try {
      let result
      if (action === 'mark_sent') {
        result = await ninjaApiCallWithRetry(config, '/invoices/bulk', {
          method: 'POST',
          body: { ids: [item.invoiceId], action: 'mark_sent' },
        })
      } else {
        result = await ninjaApiCallWithRetry(config, '/emails', {
          method: 'POST',
          body: { entity: 'invoice', entity_id: item.invoiceId, template: 'email_template_invoice' },
        })
      }
      if (result.status === 200) {
        results.push({ id: item.id, ok: true })
      } else {
        const mapped = mapNinjaError(result.status, result.text)
        results.push({ id: item.id, ok: false, error: mapped })
      }
    } catch {
      results.push({ id: item.id, ok: false, error: { error: 'Unexpected error running the invoice action.', errorCode: 'UNEXPECTED', retryable: true } })
    }
  }
  res.json({ results })
}

export default handler