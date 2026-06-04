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
  it('decodes dirKey when no cwd present', () => {
    const store = new OfficeStore(() => T0 + 1)
    store.ingest({ dirKey: '-Users-y-my-app', fileName: 'a.jsonl',
      content: line({ type: 'user', message: { role: 'user', content: 'hello' } }), mtimeMs: T0 })
    expect(store.view().rooms[0]!.label).toBe('my-app')
  })
})
