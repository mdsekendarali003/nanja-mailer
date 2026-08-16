import type { ApiHandler } from '../_lib/types.js'
import type { NinjaConfig } from '../_lib/ninja.js'
import { maskSecret, readNinjaConfig, writeNinjaConfig } from '../_lib/ninja.js'

interface SettingsResponse {
  baseUrl: string
  tokenMasked: string
  configured: boolean
}

const handler: ApiHandler = async (req, res) => {
  if (req.method === 'POST') {
    const body = (req.body || {}) as { baseUrl?: unknown; token?: unknown }
    const current = readNinjaConfig(req)
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : ''
    let token = typeof body.token === 'string' ? body.token.trim() : ''
    if (current && (token === '' || token.startsWith('••'))) token = current.token
    if (!baseUrl || !token) {
      res.status(400).json({ error: 'Instance URL and API token are required.', errorCode: 'BAD_REQUEST', retryable: false })
      return
    }
    const config: NinjaConfig = { baseUrl, token }
    writeNinjaConfig(res, config)
    const response: SettingsResponse = { baseUrl: config.baseUrl, tokenMasked: maskSecret(config.token), configured: true }
    res.json(response)
    return
  }
  const config = readNinjaConfig(req)
  if (!config) {
    const response: SettingsResponse = { baseUrl: '', tokenMasked: '', configured: false }
    res.json(response)
    return
  }
  const response: SettingsResponse = { baseUrl: config.baseUrl, tokenMasked: maskSecret(config.token), configured: true }
  res.json(response)
}

export default handler