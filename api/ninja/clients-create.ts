import type { ApiHandler } from '../_lib/types.js'
import { mapNinjaError, ninjaApiCallWithRetry, parseNinjaData, readNinjaConfig } from '../_lib/ninja.js'
import { jsonError } from '../_lib/types.js'

interface CreateClientResponse {
  ok: boolean
  id?: string
  name?: string
  error?: string
}

const handler: ApiHandler = async (req, res) => {
  const config = readNinjaConfig(req)
  if (!config) {
    jsonError(res, 400, 'Invoice Ninja is not configured. Add the instance URL and API token on the Settings page.', 'CONFIG_MISSING', false)
    return
  }
  const body = (req.body || {}) as { name?: unknown; email?: unknown }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!name || !email) {
    jsonError(res, 400, 'Name and email are required.', 'BAD_REQUEST', false)
    return
  }
  try {
    const result = await ninjaApiCallWithRetry(config, '/clients', {
      method: 'POST',
      body: { name, contacts: [{ first_name: '', last_name: '', email }] },
    })
    if (result.status === 200) {
      const data = parseNinjaData<{ id?: string; name?: string }>(result) ?? {}
      const response: CreateClientResponse = { ok: true, id: data.id, name: data.name || name }
      res.json(response)
      return
    }
    const mapped = mapNinjaError(result.status, result.text)
    res.status(result.status >= 500 ? 502 : 400).json({ ok: false, error: mapped.error } satisfies CreateClientResponse)
  } catch {
    jsonError(res, 502, 'Unexpected error creating the client in Invoice Ninja.', 'UNEXPECTED', true)
  }
}

export default handler