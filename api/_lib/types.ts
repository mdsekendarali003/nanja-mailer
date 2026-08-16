import type { VercelRequest, VercelResponse } from '@vercel/node'

export type ApiRequest = VercelRequest
export type ApiResponse = VercelResponse
export type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void

export function isProd(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

export function jsonError(res: ApiResponse, status: number, error: string, errorCode: string, retryable = false): void {
  res.status(status).json({ error, errorCode, retryable })
}