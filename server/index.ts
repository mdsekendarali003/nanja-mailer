import http from 'node:http'
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import type { ApiHandler, ApiRequest, ApiResponse } from '../api/_lib/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_DIR = path.resolve(__dirname, '../api')
const DIST_DIR = path.resolve(__dirname, '../dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

function serveStatic(reqPath: string, res: http.ServerResponse): void {
  let filePath = path.normalize(path.join(DIST_DIR, reqPath === '/' ? 'index.html' : reqPath))
  if (!filePath.startsWith(DIST_DIR) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
  }
  if (!existsSync(filePath)) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not found')
    return
  }
  res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream')
  createReadStream(filePath).pipe(res)
}

function walk(dir: string, base: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, base))
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

const routes = walk(API_DIR, API_DIR).map((file) => {
  const rel = path.relative(API_DIR, file).replace(/\\/g, '/').replace(/\.ts$/, '')
  return { route: `/api/${rel}`, file }
})

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header || '').split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (key) {
      try {
        out[key] = decodeURIComponent(part.slice(idx + 1).trim())
      } catch {
        out[key] = part.slice(idx + 1).trim()
      }
    }
  }
  return out
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 1_000_000) throw new Error('BODY_TOO_LARGE')
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const query: Record<string, string> = {}
  for (const [k, v] of url.searchParams.entries()) query[k] = v

  const route = routes.find((r) => r.route === url.pathname)
  if (!route) {
    if (!url.pathname.startsWith('/api/') && existsSync(DIST_DIR)) {
      serveStatic(url.pathname, res)
      return
    }
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: `No handler for ${url.pathname}`, errorCode: 'NOT_FOUND', retryable: false }))
    return
  }

  const apiReq = {
    method: req.method || 'GET',
    url: req.url || '',
    headers: req.headers,
    query,
    cookies: parseCookies(req.headers.cookie),
    body: {},
  } as ApiRequest

  type ResShim = {
    statusCode: number
    headers: Record<string, string | string[]>
    status: (this: ResShim, code: number) => ResShim
    setHeader: (this: ResShim, name: string, value: string | string[]) => ResShim
    getHeader: (this: ResShim, name: string) => string | string[] | undefined
    json: (this: ResShim, payload: unknown) => void
    send: (this: ResShim, payload: string) => void
    redirect: (this: ResShim, target: string) => void
  }

  const shim: ResShim = {
    statusCode: 200,
    headers: {},
    status(code: number) {
      this.statusCode = code
      return this
    },
    setHeader(name: string, value: string | string[]) {
      this.headers[name.toLowerCase()] = value
      return this
    },
    getHeader(name: string): string | string[] | undefined {
      return this.headers[name.toLowerCase()]
    },
    json(payload: unknown) {
      res.statusCode = this.statusCode
      for (const [name, value] of Object.entries(this.headers)) res.setHeader(name, value)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))
    },
    send(payload: string) {
      res.statusCode = this.statusCode
      for (const [name, value] of Object.entries(this.headers)) res.setHeader(name, value)
      res.end(payload)
    },
    redirect(target: string) {
      res.statusCode = this.statusCode || 302
      res.setHeader('Location', target)
      res.end()
    },
  }
  const apiRes = shim as unknown as ApiResponse

  try {
    if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
      apiReq.body = await readBody(req)
    }
    const mod = await import(pathToFileURL(route.file).href)
    const handler = mod.default as ApiHandler
    const started = Date.now()
    await handler(apiReq, apiRes)
    const elapsed = Date.now() - started
    console.log(`${req.method} ${url.pathname} -> ${res.statusCode} (${elapsed}ms)`)
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Internal server error.', errorCode: 'INTERNAL', retryable: true }))
    console.error(`${req.method} ${url.pathname} failed:`, err instanceof Error ? err.message : err)
  }
})

const port = Number(process.env.PORT || 3001)
server.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`)
  for (const r of routes) console.log(`  ${r.route}`)
  if (existsSync(DIST_DIR)) console.log('  + serving built frontend from dist/')
})