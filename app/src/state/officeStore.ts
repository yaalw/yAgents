import type { FileEvent, OfficeView, RoomView, TableView } from '../types'
import { parseLine } from '../parser/transcript'
import { SessionTracker } from '../parser/session'

const EXPIRY_MS = 5 * 60_000
// A genuinely-waiting agent (parked in the kitchen waiting on you) gets a longer grace
// window than an actively-working one — but NOT forever. Finished sessions also end in
// `waiting`, so an unbounded rule would resurrect every historical project as a permanent room.
const WAITING_EXPIRY_MS = 30 * 60_000

interface Entry { tracker: SessionTracker; mtimeMs: number; dirKey: string; fileName: string }

/** Best-effort label from an encoded dir key like "-Users-y-my-app" → "my-app" is impossible
 *  to recover perfectly (dashes are ambiguous); we use cwd when available. Fallback: take the
 *  trailing segments after the last segment that looks like a path boundary — pragmatically,
 *  everything after the last single-char segment, joined back with dashes. */
function labelFromDirKey(dirKey: string): string {
  const parts = dirKey.replace(/^-/, '').split('-')
  let cut = 0
  for (let i = parts.length - 1; i >= 0; i--) {
    if ((parts[i] ?? '').length <= 1) { cut = i + 1; break }
  }
  return parts.slice(cut).join('-') || dirKey
}

export class OfficeStore {
  private sessions = new Map<string, Entry>()
  private dirOrder: string[] = []

  constructor(private now: () => number = () => Date.now()) {}

  ingest(e: FileEvent): void {
    if (!e.fileName.endsWith('.jsonl')) return
    if (!this.dirOrder.includes(e.dirKey)) this.dirOrder.push(e.dirKey)

    if (e.fileName.startsWith('agent-')) {
      // Sidechain file: feed lines (forced sidechain) to the newest tracker in this dir with open subagents.
      const candidates = [...this.sessions.values()]
        .filter(s => s.dirKey === e.dirKey && s.tracker.subagents.length > 0)
        .sort((a, b) => b.tracker.lastActivityMs - a.tracker.lastActivityMs)
      const target = candidates[0]
      if (!target) return
      for (const raw of e.content.split('\n')) {
        const p = parseLine(raw)
        if (p) target.tracker.feed({ ...p, isSidechain: true })
      }
      target.mtimeMs = Math.max(target.mtimeMs, e.mtimeMs)
      return
    }

    const key = e.dirKey + '/' + e.fileName
    const tracker = new SessionTracker() // rebuild from scratch: snapshots are full content, append-only
    for (const raw of e.content.split('\n')) {
      const p = parseLine(raw)
      if (p) tracker.feed(p)
    }
    this.sessions.set(key, { tracker, mtimeMs: e.mtimeMs, dirKey: e.dirKey, fileName: e.fileName })
  }

  view(): OfficeView {
    const now = this.now()
    const rooms: RoomView[] = []
    for (const dirKey of this.dirOrder) {
      const tables: TableView[] = []
      let cwd: string | undefined
      for (const [key, s] of this.sessions) {
        if (s.dirKey !== dirKey) continue
        const t = s.tracker
        const lastActivity = Math.max(t.lastActivityMs, s.mtimeMs)
        const window = t.status === 'waiting' ? WAITING_EXPIRY_MS : EXPIRY_MS
        if (now - lastActivity >= window) continue
        cwd ??= t.cwd
        tables.push({
          key, sessionId: t.sessionId, status: t.status,
          lastTool: t.lastTool, lastToolTarget: t.lastToolTarget, model: t.model,
          lastActivityMs: lastActivity, subagents: t.subagents,
        })
      }
      if (tables.length > 0) {
        const label = cwd ? (cwd.split('/').filter(Boolean).pop() ?? cwd) : labelFromDirKey(dirKey)
        rooms.push({ dirKey, label, cwd, tables })
      }
    }
    return { rooms }
  }
}
