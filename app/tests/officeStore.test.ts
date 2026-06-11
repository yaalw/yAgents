import { describe, it, expect } from 'vitest'
import { OfficeStore } from '../src/state/officeStore'

const T0 = Date.parse('2026-06-04T01:00:00Z')
const line = (obj: object) => JSON.stringify(obj)
const asstTool = (ts: number, name: string, input: object = {}, extra: object = {}) => line({
  type: 'assistant', timestamp: new Date(ts).toISOString(), sessionId: 's1', cwd: '/Users/y/webshop',
  message: { role: 'assistant', content: [{ type: 'tool_use', id: 'id-' + name + '-' + ts, name, input }] }, ...extra,
})
const asstText = (ts: number) => line({
  type: 'assistant', timestamp: new Date(ts).toISOString(), sessionId: 's1', cwd: '/Users/y/webshop',
  message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
})

describe('OfficeStore', () => {
  it('builds rooms/tables from file events', () => {
    const store = new OfficeStore(() => T0 + 1000)
    store.ingest({ dirKey: '-Users-y-webshop', fileName: 'aaa.jsonl', content: asstTool(T0, 'Write', { file_path: 'a.ts' }), mtimeMs: T0 })
    const v = store.view()
    expect(v.rooms).toHaveLength(1)
    expect(v.rooms[0]!.label).toBe('webshop')
    expect(v.rooms[0]!.tables).toHaveLength(1)
    expect(v.rooms[0]!.tables[0]!.status).toBe('typing')
  })
  it('is idempotent across repeated snapshots', () => {
    const store = new OfficeStore(() => T0 + 1000)
    const c = asstTool(T0, 'Write')
    store.ingest({ dirKey: 'd', fileName: 'a.jsonl', content: c, mtimeMs: T0 })
    store.ingest({ dirKey: 'd', fileName: 'a.jsonl', content: c, mtimeMs: T0 })
    expect(store.view().rooms[0]!.tables).toHaveLength(1)
  })
  it('expires active sessions after 5 min and waiting sessions after a longer bounded window', () => {
    const now = { t: T0 + 1000 }
    const store = new OfficeStore(() => now.t)
    store.ingest({ dirKey: 'd1', fileName: 'busy.jsonl', content: asstTool(T0, 'Bash'), mtimeMs: T0 })
    store.ingest({ dirKey: 'd2', fileName: 'waiting.jsonl', content: asstText(T0), mtimeMs: T0 })
    expect(store.view().rooms).toHaveLength(2)
    now.t = T0 + 6 * 60_000          // 6 min: active session gone, waiting session still parked in the kitchen
    const v = store.view()
    expect(v.rooms).toHaveLength(1)
    expect(v.rooms[0]!.tables[0]!.status).toBe('waiting')
    now.t = T0 + 31 * 60_000         // 31 min untouched: a finished/abandoned waiting session expires too
    expect(store.view().rooms).toHaveLength(0)
  })
  it('uses mtime as activity floor (recent write keeps session alive even with old entry timestamps)', () => {
    const now = { t: T0 + 6 * 60_000 }
    const store = new OfficeStore(() => now.t)
    store.ingest({ dirKey: 'd', fileName: 'a.jsonl', content: asstTool(T0, 'Bash'), mtimeMs: now.t - 1000 })
    expect(store.view().rooms).toHaveLength(1)
  })
  it('keeps rooms in first-seen order and ignores non-jsonl files', () => {
    const store = new OfficeStore(() => T0 + 1)
    store.ingest({ dirKey: 'b-dir', fileName: 'x.jsonl', content: asstTool(T0, 'Read'), mtimeMs: T0 })
    store.ingest({ dirKey: 'a-dir', fileName: 'y.jsonl', content: asstTool(T0, 'Read'), mtimeMs: T0 })
    store.ingest({ dirKey: 'a-dir', fileName: 'notes.txt', content: 'hi', mtimeMs: T0 })
    const v = store.view()
    expect(v.rooms.map(r => r.dirKey)).toEqual(['b-dir', 'a-dir'])
  })
  it('routes agent-*.jsonl sidechain activity to the open subagent in same dir', () => {
    const store = new OfficeStore(() => T0 + 1000)
    store.ingest({ dirKey: 'd', fileName: 'main.jsonl', content: asstTool(T0, 'Task'), mtimeMs: T0 })
    store.ingest({
      dirKey: 'd', fileName: 'agent-001.jsonl',
      content: line({ type: 'assistant', timestamp: new Date(T0 + 500).toISOString(),
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'q', name: 'Grep', input: { pattern: 'x' } }] } }),
      mtimeMs: T0 + 500,
    })
    const table = store.view().rooms[0]!.tables[0]!
    expect(table.subagents).toHaveLength(1)
    expect(table.subagents[0]!.status).toBe('reading')
  })
  it('routes nested subagent events by sessionId + toolUseId (real Claude Code shape)', () => {
    const store = new OfficeStore(() => T0 + 5000)
    // main session: spawns two Agent subagents (like the real main transcript)
    const main = [
      line({ type: 'assistant', timestamp: new Date(T0).toISOString(), sessionId: 'sess-1', cwd: '/Users/y/webshop',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_AAA', name: 'Agent', input: { subagent_type: 'Explore', description: 'find configs', prompt: 'x' } }] } }),
      line({ type: 'assistant', timestamp: new Date(T0 + 100).toISOString(), sessionId: 'sess-1', cwd: '/Users/y/webshop',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_BBB', name: 'Agent', input: { subagent_type: 'general-purpose', description: 'run the build', prompt: 'y' } }] } }),
    ].join('\n')
    store.ingest({ dirKey: '-Users-y-webshop', fileName: 'sess-1.jsonl', content: main, mtimeMs: T0 + 100 })
    // subagent transcript for toolu_BBB: it is running Bash (isSidechain lines, like real agent-*.jsonl)
    const subContent = line({ type: 'assistant', isSidechain: true, timestamp: new Date(T0 + 2000).toISOString(),
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x1', name: 'Bash', input: { command: 'npm run build' } }] } })
    store.ingest({
      dirKey: '-Users-y-webshop', fileName: 'agent-bbb.jsonl', kind: 'subagent', sessionId: 'sess-1',
      toolUseId: 'toolu_BBB', agentType: 'general-purpose', description: 'run the build',
      content: subContent, mtimeMs: T0 + 2000,
    })
    const table = store.view().rooms[0]!.tables[0]!
    const bbb = table.subagents.find(s => s.id === 'toolu_BBB')!
    const aaa = table.subagents.find(s => s.id === 'toolu_AAA')!
    expect(bbb.status).toBe('running')         // from its OWN transcript, not generic
    expect(bbb.description).toBe('run the build')
    expect(bbb.agentType).toBe('general-purpose')
    expect(aaa.status).toBe('working')          // untouched sibling
    expect(aaa.description).toBe('find configs') // from the Agent tool_use input
  })
  it('subagent activity keeps the parent session alive and survives a main-file rebuild', () => {
    const now = { t: T0 + 1000 }
    const store = new OfficeStore(() => now.t)
    const main = line({ type: 'assistant', timestamp: new Date(T0).toISOString(), sessionId: 's9',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_C', name: 'Agent', input: { description: 'dig' } }] } })
    store.ingest({ dirKey: 'd', fileName: 's9.jsonl', content: main, mtimeMs: T0 })
    store.ingest({ dirKey: 'd', fileName: 'agent-c.jsonl', kind: 'subagent', sessionId: 's9', toolUseId: 'toolu_C',
      content: line({ type: 'assistant', isSidechain: true, timestamp: new Date(T0 + 6 * 60_000).toISOString(),
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'z', name: 'Grep', input: { pattern: 'q' } }] } }),
      mtimeMs: T0 + 6 * 60_000 })
    now.t = T0 + 7 * 60_000 // main file itself is 7 min stale, but the subagent worked 1 min ago
    expect(store.view().rooms).toHaveLength(1)
    expect(store.view().rooms[0]!.tables[0]!.subagents[0]!.status).toBe('reading')
    // main file rebuilt (e.g. a queue-operation appended) → subagent status must not reset to 'working'
    store.ingest({ dirKey: 'd', fileName: 's9.jsonl', content: main, mtimeMs: T0 + 7 * 60_000 })
    expect(store.view().rooms[0]!.tables[0]!.subagents[0]!.status).toBe('reading')
  })
  it('drops subagent events whose toolUseId matches no open subagent (stale files)', () => {
    const store = new OfficeStore(() => T0 + 1000)
    store.ingest({ dirKey: 'd', fileName: 's1.jsonl', content: asstTool(T0, 'Write'), mtimeMs: T0 })
    store.ingest({ dirKey: 'd', fileName: 'agent-old.jsonl', kind: 'subagent', sessionId: 's1', toolUseId: 'toolu_GONE',
      content: line({ type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'z', name: 'Bash', input: {} }] } }),
      mtimeMs: T0 + 1 })
    expect(store.view().rooms[0]!.tables[0]!.subagents).toHaveLength(0)
  })
  it('prunes sessions dead well past the waiting window (memory leak guard)', () => {
    const now = { t: T0 + 1000 }
    const store = new OfficeStore(() => now.t)
    store.ingest({ dirKey: 'd1', fileName: 'busy.jsonl', content: asstTool(T0, 'Bash'), mtimeMs: T0 })
    store.ingest({ dirKey: 'd2', fileName: 'waiting.jsonl', content: asstText(T0), mtimeMs: T0 })
    store.view()
    expect(store.trackedSessionCount).toBe(2)
    // 31 min: both invisible (active expired at 5, waiting at 30) but still within
    // the prune margin — kept in the Map, nothing dropped early
    now.t = T0 + 31 * 60_000
    expect(store.view().rooms).toHaveLength(0)
    expect(store.trackedSessionCount).toBe(2)
    // 36 min (> waiting window + margin): both entries dropped for good
    now.t = T0 + 36 * 60_000
    store.view()
    expect(store.trackedSessionCount).toBe(0)
  })
  it('never prunes a session that is still live or freshly active', () => {
    const now = { t: T0 + 36 * 60_000 }
    const store = new OfficeStore(() => now.t)
    store.ingest({ dirKey: 'old', fileName: 'old.jsonl', content: asstTool(T0, 'Bash'), mtimeMs: T0 })
    store.ingest({ dirKey: 'live', fileName: 'live.jsonl', content: asstTool(now.t - 1000, 'Bash'), mtimeMs: now.t - 1000 })
    const v = store.view()
    expect(v.rooms).toHaveLength(1)
    expect(v.rooms[0]!.dirKey).toBe('live')
    expect(store.trackedSessionCount).toBe(1) // old pruned, live untouched
    // a pruned folder that comes back gets a fresh room again
    store.ingest({ dirKey: 'old', fileName: 'new.jsonl', content: asstTool(now.t, 'Bash'), mtimeMs: now.t })
    expect(store.view().rooms.map(r => r.dirKey)).toEqual(['live', 'old'])
  })
  it('decodes dirKey when no cwd present', () => {
    const store = new OfficeStore(() => T0 + 1)
    store.ingest({ dirKey: '-Users-y-my-app', fileName: 'a.jsonl',
      content: line({ type: 'user', message: { role: 'user', content: 'hello' } }), mtimeMs: T0 })
    expect(store.view().rooms[0]!.label).toBe('my-app')
  })
})
