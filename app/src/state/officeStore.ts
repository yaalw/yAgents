import type { AgentStatus, FileEvent, OfficeView, RoomView, TableView } from '../types'
import { parseLine } from '../parser/transcript'
import { SessionTracker, statusForTool } from '../parser/session'

const EXPIRY_MS = 5 * 60_000
// A genuinely-waiting agent (parked in the kitchen waiting on you) gets a longer grace
// window than an actively-working one — but NOT forever. Finished sessions also end in
// `waiting`, so an unbounded rule would resurrect every historical project as a permanent room.
const WAITING_EXPIRY_MS = 30 * 60_000
// Entries dead well past every liveness window get dropped from the Map entirely —
// otherwise a long-running tab accumulates every session ever seen (memory leak).
// Margin = one active window beyond the longest (waiting) window, so nothing that
// could still re-enter the view is ever pruned.
const PRUNE_AFTER_MS = WAITING_EXPIRY_MS + EXPIRY_MS

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

    if (e.kind === 'subagent' || e.fileName.startsWith('agent-')) {
      this.ingestSubagent(e)
      return
    }

    const key = e.dirKey + '/' + e.fileName
    const prev = this.sessions.get(key)
    const tracker = new SessionTracker() // rebuild from scratch: snapshots are full content, append-only
    for (const raw of e.content.split('\n')) {
      const p = parseLine(raw)
      if (p) tracker.feed(p)
    }
    // a rebuild resets open subagents to 'working'; re-adopt live state driven by nested agent files
    if (prev) tracker.adoptSubagentState(prev.tracker)
    this.sessions.set(key, { tracker, mtimeMs: e.mtimeMs, dirKey: e.dirKey, fileName: e.fileName })
  }

  /** A subagent's OWN transcript (<sessionId>/subagents/agent-*.jsonl, or a legacy/demo
   *  top-level agent-*.jsonl). Derive its live status from its latest tool_use and route
   *  it to the matching open subagent in the parent session via the toolUseId join key. */
  private ingestSubagent(e: FileEvent): void {
    const target = this.findSubagentTarget(e)
    if (!target) return // parent session unknown, or subagent already closed (stale file)

    let status: AgentStatus | undefined
    let lastTs = 0
    for (const raw of e.content.split('\n')) {
      const p = parseLine(raw)
      if (!p) continue
      if (p.timestampMs) lastTs = Math.max(lastTs, p.timestampMs)
      const tu = p.toolUses[p.toolUses.length - 1]
      if (p.role === 'assistant' && tu) status = statusForTool(tu.name)
    }
    const applied = target.tracker.updateSubagent(e.toolUseId, {
      status, description: e.description, agentType: e.agentType,
    })
    if (!applied) return
    // subagent work counts as session activity: keep the parent room alive while helpers dig
    target.tracker.lastActivityMs = Math.max(target.tracker.lastActivityMs, lastTs)
    target.mtimeMs = Math.max(target.mtimeMs, e.mtimeMs)
  }

  private findSubagentTarget(e: FileEvent): Entry | undefined {
    // exact: the <sessionId> path segment names the parent transcript file
    if (e.sessionId) {
      const exact = this.sessions.get(e.dirKey + '/' + e.sessionId + '.jsonl')
      if (exact) return exact
    }
    // by join key: any session in this project with that Agent tool_use still open
    if (e.toolUseId) {
      for (const s of this.sessions.values()) {
        if (s.dirKey === e.dirKey && s.tracker.subagents.some(sub => sub.id === e.toolUseId)) return s
      }
      return undefined
    }
    // legacy/demo fallback: newest tracker in this dir with open subagents
    return [...this.sessions.values()]
      .filter(s => s.dirKey === e.dirKey && s.tracker.subagents.length > 0)
      .sort((a, b) => b.tracker.lastActivityMs - a.tracker.lastActivityMs)[0]
  }

  /** Sessions currently tracked (incl. expired-but-not-yet-pruned). For tests/diagnostics. */
  get trackedSessionCount(): number { return this.sessions.size }

  /** Drop sessions not seen as live for well past the longest liveness window.
   *  Anything still live or merely expired-within-margin is kept untouched. */
  private prune(now: number): void {
    let dropped = false
    for (const [key, s] of this.sessions) {
      const lastActivity = Math.max(s.tracker.lastActivityMs, s.mtimeMs)
      if (now - lastActivity >= PRUNE_AFTER_MS) { this.sessions.delete(key); dropped = true }
    }
    if (!dropped) return
    // folders with no tracked sessions left don't need their order slot either
    const liveDirs = new Set([...this.sessions.values()].map(s => s.dirKey))
    this.dirOrder = this.dirOrder.filter(d => liveDirs.has(d))
  }

  view(): OfficeView {
    const now = this.now()
    this.prune(now) // view() runs every second — piggyback the leak guard on it
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
