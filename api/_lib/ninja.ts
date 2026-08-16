import type { ApiRequest, ApiResponse } from './types.js'
import type { ApiError } from '../../shared/types.js'
import { parseCookies, setCookie } from './cookies.js'
import { isProd } from './types.js'

export const NINJA_COOKIE = 'mailflow_ninja'

export interface NinjaConfig {
  baseUrl: string
  token: string
}

export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '••••'
  return '••••••••' + value.slice(-4)
}

export function readNinjaConfig(req: ApiRequest): NinjaConfig | null {
  const raw = parseCookies(req)[NINJA_COOKIE]
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { baseUrl?: unknown; token?: unknown }
      const baseUrl = typeof parsed.baseUrl === 'string' ? parsed.baseUrl.trim() : ''
      const token = typeof parsed.token === 'string' ? parsed.token.trim() : ''
      if (baseUrl && token) return { baseUrl, token }
    } catch {
      // fall through to env vars
    }
  }
  const baseUrl = (process.env.NINJA_API_URL || '').trim()
  const token = (process.env.NINJA_API_TOKEN || '').trim()
  if (baseUrl && token) return { baseUrl, token }
  return null
}

export function writeNinjaConfig(res: ApiResponse, config: NinjaConfig): void {
  setCookie(res, NINJA_COOKIE, JSON.stringify(config), {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'Lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  })
}

export function clearNinjaConfig(res: ApiResponse): void {
  setCookie(res, NINJA_COOKIE, '', { path: '/', maxAge: 0 })
}

export interface NinjaResult {
  status: number
  json: unknown
  text: string
}

export async function ninjaApiCall(config: NinjaConfig, path: string, options: { method?: string; body?: unknown } = {}): Promise<NinjaResult> {
  const base = config.baseUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-API-TOKEN': config.token,
    'X-Requested-With': 'XMLHttpRequest',
  }
  let body: string | undefined
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  let response: Response
  try {
    response = await fetch(`${base}/api/v1${path}`, { method: options.method || 'GET', headers, body })
  } catch {
    return { status: 0, json: null, text: '' }
  }
  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: response.status, json, text }
}

export async function ninjaApiCallWithRetry(config: NinjaConfig, path: string, options: { method?: string; body?: unknown } = {}): Promise<NinjaResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await ninjaApiCall(config, path, options)
    if (result.status === 429 || (result.status >= 500 && result.status <= 599)) {
      await new Promise((r) => setTimeout(r, 1500))
      continue
    }
    return result
  }
  return ninjaApiCall(config, path, options)
}

export function mapNinjaError(status: number, text: string): ApiError {
  if (status === 0 || !status) return { error: 'Network error reaching Invoice Ninja. Please check the instance URL and your connection.', errorCode: 'NETWORK', retryable: true }
  if (status === 429) return { error: 'Invoice Ninja rate limit hit. Please wait a moment and try again.', errorCode: 'RATE_LIMIT', retryable: true }
  if (status === 401 || status === 403) {
    return { error: 'Invoice Ninja rejected the API token. Check Settings → Account Management → Integrations → API Tokens.', errorCode: 'NINJA_UNAUTHORIZED', retryable: false }
  }
  if (status === 404) {
    return { error: 'Invoice Ninja returned 404 — check the instance URL (it must point at your Invoice Ninja installation).', errorCode: 'NINJA_NOT_FOUND', retryable: false }
  }
  if (status === 422) {
    const message = friendlyBody(text)
    return { error: message ? `Invoice Ninja rejected the request: ${message}` : 'Invoice Ninja rejected the request — the data is invalid.', errorCode: 'VALIDATION', retryable: false }
  }
  if (status >= 500) {
    const message = friendlyBody(text)
    return { error: message ? `Invoice Ninja had a server error: ${message}` : 'Invoice Ninja had a server error. Please try again.', errorCode: `HTTP_${status}`, retryable: true }
  }
  return { error: friendlyBody(text) || `Invoice Ninja returned HTTP ${status}.`, errorCode: `HTTP_${status}`, retryable: false }
}

export function friendlyBody(bodyText: string): string {
  const trimmed = bodyText.trim()
  if (!trimmed) return ''
  try {
    const parsed = JSON.parse(trimmed) as { message?: string; Message?: string; error?: string; errors?: unknown }
    if (parsed.message) return parsed.message
    if (parsed.Message) return parsed.Message
    if (parsed.error) return parsed.error
    if (parsed.errors) {
      const messages = Object.values(parsed.errors as Record<string, unknown>)
        .flat()
        .filter((v): v is string => typeof v === 'string')
      if (messages.length > 0) return messages.join('; ')
    }
  } catch {
    if (trimmed.length <= 200) return trimmed
  }
  return ''
}
