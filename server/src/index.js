#!/usr/bin/env node
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { WebSocketServer } from 'ws'
import chokidar from 'chokidar'
import { fileEvent, snapshot } from './scan.js'

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

wss.on('connection', ws => { for (const e of snapshot(WATCH_DIR)) ws.send(e) })

// depth 4 reaches <projectDir>/<sessionId>/subagents/agent-*.jsonl (nested subagent transcripts)
chokidar.watch(WATCH_DIR, { ignoreInitial: true, depth: 4 })
  .on('add', p => broadcast(p))
  .on('change', p => broadcast(p))

function broadcast(filePath) {
  const msg = fileEvent(filePath, WATCH_DIR) // null for meta/unknown paths
  if (!msg) return
  for (const c of wss.clients) { if (c.readyState === 1) c.send(msg) }
}

server.listen(PORT, () => {
  console.log(`yAgents office: http://localhost:${PORT}`)
  console.log(`watching: ${WATCH_DIR}`)
})
