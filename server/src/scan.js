import { readFileSync, statSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { readTail } from './tail.js'

/** Subagent transcripts accumulate forever (dozens per session); only snapshot ones
 *  touched within the app's longest liveness window. Live watch events are always sent. */
export const SUBAGENT_FRESH_MS = 30 * 60_000

/** Classify a path under the watch dir. Real Claude Code layout:
 *    <watchDir>/<projectDir>/<sessionId>.jsonl                       → main session transcript
 *    <watchDir>/<projectDir>/<sessionId>/subagents/agent-*.jsonl     → one subagent's transcript
 *    <watchDir>/<projectDir>/<sessionId>/subagents/agent-*.meta.json → { agentType, description, toolUseId }
 *  Returns null for anything else (meta files ride along on their .jsonl's event). */
export function classifyPath(filePath, watchDir) {
  if (!filePath.endsWith('.jsonl')) return null
  const parts = relative(watchDir, filePath).split(sep)
  if (parts.some(p => p === '..' || p === '')) return null
  if (parts.length === 2) {
    return { dirKey: parts[0], fileName: parts[1] }
  }
  if (parts.length === 4 && parts[2] === 'subagents' && parts[3].startsWith('agent-')) {
    return { dirKey: parts[0], fileName: parts[3], kind: 'subagent', sessionId: parts[1] }
  }
  return null
}

function readMeta(jsonlPath) {
  try {
    const parsed = JSON.parse(readFileSync(jsonlPath.replace(/\.jsonl$/, '.meta.json'), 'utf8'))
    return {
      toolUseId: typeof parsed?.toolUseId === 'string' ? parsed.toolUseId : undefined,
      agentType: typeof parsed?.agentType === 'string' ? parsed.agentType : undefined,
      description: typeof parsed?.description === 'string' ? parsed.description : undefined,
    }
  } catch { return {} }
}

/** Build the FileEvent JSON for a watched .jsonl, or null if the path isn't one we serve. */
export function fileEvent(filePath, watchDir) {
  const id = classifyPath(filePath, watchDir)
  if (!id) return null
  const meta = id.kind === 'subagent' ? readMeta(filePath) : {}
  return JSON.stringify({
    ...id,
    ...meta,
    content: readTail(filePath),
    mtimeMs: (() => { try { return statSync(filePath).mtimeMs } catch { return Date.now() } })(),
  })
}

/** Initial snapshot for a new client: every session transcript, plus recently-touched
 *  nested subagent transcripts. Sessions go FIRST so the store knows the open subagents
 *  (toolUseId join targets) before their activity events arrive. */
export function snapshot(watchDir, nowMs = Date.now()) {
  const sessions = []
  const subagents = []
  try {
    for (const dir of readdirSync(watchDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      const dirPath = join(watchDir, dir.name)
      for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const e = fileEvent(join(dirPath, entry.name), watchDir)
          if (e) sessions.push(e)
        } else if (entry.isDirectory()) {
          const subDir = join(dirPath, entry.name, 'subagents')
          let files
          try { files = readdirSync(subDir) } catch { continue } // no subagents/ (e.g. memory/)
          for (const f of files) {
            if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue
            const p = join(subDir, f)
            try { if (nowMs - statSync(p).mtimeMs > SUBAGENT_FRESH_MS) continue } catch { continue }
            const e = fileEvent(p, watchDir)
            if (e) subagents.push(e)
          }
        }
      }
    }
  } catch { /* watch dir missing — empty office */ }
  return [...sessions, ...subagents]
}
