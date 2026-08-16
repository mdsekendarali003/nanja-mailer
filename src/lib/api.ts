import type { ApiError } from '../../shared/types.js'

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public apiError: ApiError,
  ) {
    super(apiError.error)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      ...init,
    })
  } catch {
    throw new ApiRequestError(0, { error: 'Network error. Please check your connection and try again.', errorCode: 'NETWORK', retryable: true })
  }
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (!res.ok) {
    const err = (payload as Partial<ApiError> | null) || null
    const apiError: ApiError = {
      error: err?.error || `Request failed with HTTP ${res.status}.`,
      errorCode: err?.errorCode || `HTTP_${res.status}`,
      retryable: err?.retryable ?? false,
    }
    throw new ApiRequestError(res.status, apiError)
  }
  return payload as T
}

export function apiGet<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'GET' })
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function money(n: number | undefined): string {
  if (n === undefined) return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export function shortDate(iso: string | undefined): string {
  if (!iso) return '—'
  return iso.slice(0, 10)
}