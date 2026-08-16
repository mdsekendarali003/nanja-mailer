import type { ApiHandler } from '../_lib/types.js'
import type { NinjaConnectionState } from '../../shared/types.js'
import { mapNinjaError, ninjaApiCallWithRetry, parseNinjaList, readNinjaConfig } from '../_lib/ninja.js'

const handler: ApiHandler = async (req, res) => {
  const config = readNinjaConfig(req)
  if (!config) {
    const result: NinjaConnectionState = { ok: false, error: 'Invoice Ninja is not configured. Add the instance URL and API token on the Settings page.' }
    res.json(result)
    return
  }
  const result = await ninjaApiCallWithRetry(config, '/companies')
  if (result.status === 200) {
    const { items } = parseNinjaList<{ name?: string; settings?: { name?: string } }>(result)
    const company = items[0]
    const companyName = company?.settings?.name || company?.name || 'Invoice Ninja'
    const state: NinjaConnectionState = { ok: true, companyName }
    res.json(state)
    return
  }
  const mapped = mapNinjaError(result.status, result.text)
  res.status(result.status >= 500 ? 502 : 400).json({ ok: false, error: mapped.error } satisfies NinjaConnectionState)
}

export default handler