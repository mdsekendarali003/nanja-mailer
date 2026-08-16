import type { ApiHandler } from '../_lib/types.js'
import type { NinjaClientInfo } from '../../shared/types.js'
import { mapNinjaError, ninjaApiCallWithRetry, readNinjaConfig } from '../_lib/ninja.js'
import { jsonError } from '../_lib/types.js'

const PER_PAGE = 500

interface RawContact {
  email?: string
  first_name?: string
  last_name?: string
}

interface RawClient {
  id?: string
  name?: string
  contacts?: RawContact[]
}

const handler: ApiHandler = async (req, res) => {
  const config = readNinjaConfig(req)
  if (!config) {
    jsonError(res, 400, 'Invoice Ninja is not configured. Add the instance URL and API token on the Settings page.', 'CONFIG_MISSING', false)
    return
  }
  const clients: NinjaClientInfo[] = []
  try {
    for (let page = 1; ; page++) {
      const result = await ninjaApiCallWithRetry(config, `/clients?per_page=${PER_PAGE}&page=${page}&include=contacts`)
      if (result.status !== 200) {
        const mapped = mapNinjaError(result.status, result.text)
        jsonError(res, result.status >= 500 ? 502 : 400, mapped.error, mapped.errorCode, mapped.retryable)
        return
      }
      const raw = (result.json as RawClient[] | undefined) || []
      for (const client of raw) {
        const contact = client.contacts?.[0]
        clients.push({ id: client.id || '', name: client.name || '', email: contact?.email?.trim() || undefined })
      }
      if (raw.length < PER_PAGE) break
    }
    res.json({ clients })
  } catch {
    jsonError(res, 502, 'Unexpected error fetching clients from Invoice Ninja.', 'UNEXPECTED', true)
  }
}

export default handler