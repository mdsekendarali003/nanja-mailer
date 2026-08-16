import type { ApiRequest, ApiResponse } from './types.js'

export interface CookieOptions {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Lax' | 'Strict' | 'None'
  path?: string
  maxAge?: number
}

export function parseCookies(req: ApiRequest): Record<string, string> {
  const header = req.headers.cookie || ''
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

export function setCookie(res: ApiResponse, name: string, value: string, options: CookieOptions): void {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.path) parts.push(`Path=${options.path}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
  if (options.secure) parts.push('Secure')
  const existing = res.getHeader('Set-Cookie')
  const prev = Array.isArray(existing) ? (existing as string[]) : existing ? [existing as string] : []
  res.setHeader('Set-Cookie', [...prev, parts.join('; ')])
}

export function clearCookie(res: ApiResponse, name: string, path = '/'): void {
  setCookie(res, name, '', { path, maxAge: 0 })
}