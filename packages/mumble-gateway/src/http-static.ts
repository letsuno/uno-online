import fs from 'node:fs'
import path from 'node:path'
import type http from 'node:http'
import { debugError } from './debug.js'

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

function isProbablyImmutableAsset(urlPathname: string): boolean {
  return urlPathname.startsWith('/_next/static/') || urlPathname.startsWith('/assets/')
}

function safeDecodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return null
  }
}

function buildCandidates(urlPathname: string): string[] {
  // Next export can emit either:
  // - /route/index.html (when trailingSlash)
  // - /route.html (when not)
  // Support both, plus "/".
  const pathname = urlPathname.startsWith('/') ? urlPathname : `/${urlPathname}`
  const out: string[] = []

  if (pathname === '/') {
    out.push('/index.html')
    return out
  }

  out.push(pathname)

  const hasExt = path.posix.basename(pathname).includes('.')
  if (!hasExt) {
    out.push(`${pathname}.html`)
    out.push(`${pathname}/index.html`)
  }

  if (pathname.endsWith('/')) {
    out.push(`${pathname}index.html`)
  }

  return [...new Set(out)]
}

function isInsideRoot(rootDir: string, filePath: string): boolean {
  const root = path.resolve(rootDir) + path.sep
  const resolved = path.resolve(filePath) + (filePath.endsWith(path.sep) ? path.sep : '')
  return resolved.startsWith(root)
}

export function serveStaticFromDir(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  rootDir: string
): boolean {
  const method = req.method?.toUpperCase() ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') return false
  if (!req.url) return false

  const url = new URL(req.url, 'http://localhost')
  const decoded = safeDecodePathname(url.pathname)
  if (decoded == null) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Bad Request')
    return true
  }

  const candidates = buildCandidates(decoded)

  const tryNext = (idx: number) => {
    if (idx >= candidates.length) {
      res.writeHead(404)
      res.end()
      return
    }

    const candidate = candidates[idx]!
    const filePath = path.resolve(rootDir, `.${candidate}`)
    if (!isInsideRoot(rootDir, filePath)) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Bad Request')
      return
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        tryNext(idx + 1)
        return
      }

      const headers: Record<string, string> = {
        'content-type': contentTypeFor(filePath),
        ...(isProbablyImmutableAsset(decoded)
          ? { 'cache-control': 'public, max-age=31536000, immutable' }
          : { 'cache-control': 'public, max-age=0, must-revalidate' })
      }

      if (process.env.COOP_COEP === '1' || process.env.COOP_COEP === 'true') {
        headers['Cross-Origin-Opener-Policy'] = 'same-origin'
        headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
      }

      res.writeHead(200, headers)
      if (method === 'HEAD') {
        res.end()
        return
      }

      const stream = fs.createReadStream(filePath)
      stream.on('error', (e) => {
        debugError('[gateway] static read error', e)
        try {
          res.writeHead(500)
        } catch {}
        try {
          res.end()
        } catch {}
      })
      stream.pipe(res)
    })
  }

  tryNext(0)
  return true
}
