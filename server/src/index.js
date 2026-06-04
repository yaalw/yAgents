#!/usr/bin/env node
import http from 'node:http'
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, extname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { WebSocketServer } from 'ws'
import chokidar from 'chokidar'
import { readTail } from './tail.js'

const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const PORT = Number(flag('port', '4017'))
const WATCH_DIR = resolve(flag('dir', join(homedir(), '.claude', 'projects')))
const APP_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'dist')

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }

const server = http.createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0]
  let file = resolve(APP_DIST, '.' + (urlPath === '/' ? '/index.html' : urlPath))
  // containment guard: anything resolving outside APP_DIST (e.g. ../ traversal) falls back to index.html
  if (!file.startsWith(APP_DIST + '/') || !existsSync(file)) file = join(APP_DIST, 'index.html')
  try {
    const body = readFileSync(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(500)
    res.end('Build the app first: npm run build')
  }
})

const wss = new WebSocketServer({ server, path: '/ws' })

function fileEvent(filePath) {
  return JSON.stringify({
    dirKey: basename(dirname(filePath)),
    fileName: basename(filePath),
    content: readTail(filePath),
    mtimeMs: (() => { try { return statSync(filePath).mtimeMs } catch { return Date.now() } })(),
  })
}

function snapshot() {
  const events = []
  try {
    for (const dir of readdirSync(WATCH_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      const dirPath = join(WATCH_DIR, dir.name)
      for (const f of readdirSync(dirPath)) {
        if (f.endsWith('.jsonl')) events.push(fileEvent(join(dirPath, f)))
      }
    }
  } catch { /* watch dir missing — empty office */ }
  return events
}

wss.on('connection', ws => { for (const e of snapshot()) ws.send(e) })

chokidar.watch(WATCH_DIR, { ignoreInitial: true, depth: 2 })
  .on('add', p => broadcast(p))
  .on('change', p => broadcast(p))

function broadcast(filePath) {
  if (!filePath.endsWith('.jsonl')) return
  const msg = fileEvent(filePath)
  for (const c of wss.clients) { if (c.readyState === 1) c.send(msg) }
}

server.listen(PORT, () => {
  console.log(`yAgents office: http://localhost:${PORT}`)
  console.log(`watching: ${WATCH_DIR}`)
})
