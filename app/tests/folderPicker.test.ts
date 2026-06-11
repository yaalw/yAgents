import { describe, it, expect, vi } from 'vitest'
import { FolderPickerAdapter } from '../src/adapters/folderPicker'
import type { FileEvent } from '../src/types'

function fakeFile(content: string, lastModified: number) {
  return {
    lastModified,
    size: content.length,
    slice: (start: number) => ({ text: async () => content.slice(start) }),
    text: async () => content,
  }
}
type FakeDir = {
  kind: 'directory'
  name: string
  values(): AsyncGenerator<unknown>
  getDirectoryHandle(n: string): Promise<FakeDir>
  getFileHandle(n: string): Promise<{ kind: 'file'; name: string; getFile: () => Promise<ReturnType<typeof fakeFile>> }>
}
function fakeDir(name: string, files: Record<string, ReturnType<typeof fakeFile>>, dirs: FakeDir[] = []): FakeDir {
  return {
    kind: 'directory', name,
    async *values() {
      for (const [fname, f] of Object.entries(files)) {
        yield { kind: 'file', name: fname, getFile: async () => f }
      }
      for (const d of dirs) yield d
    },
    async getDirectoryHandle(n: string) {
      const d = dirs.find(d => d.name === n)
      if (!d) throw new DOMException('not found', 'NotFoundError')
      return d
    },
    async getFileHandle(n: string) {
      const f = files[n]
      if (!f) throw new DOMException('not found', 'NotFoundError')
      return { kind: 'file' as const, name: n, getFile: async () => f }
    },
  }
}
function fakeRoot(dirs: ReturnType<typeof fakeDir>[]) {
  return {
    kind: 'directory', name: 'projects',
    async *values() { for (const d of dirs) yield d },
  } as unknown as FileSystemDirectoryHandle
}

describe('FolderPickerAdapter', () => {
  it('emits jsonl files on first poll and only changed files later', async () => {
    const f1 = fakeFile('{"a":1}\n', 100)
    const root = fakeRoot([fakeDir('-Users-y-webshop', { 'session.jsonl': f1, 'notes.txt': fakeFile('x', 1) })])
    const adapter = new FolderPickerAdapter(root, 0) // pollMs 0 = manual polling via pollOnce
    const events: FileEvent[] = []
    await adapter.pollOnce(e => events.push(e))
    expect(events).toHaveLength(1)
    expect(events[0]!.dirKey).toBe('-Users-y-webshop')
    expect(events[0]!.fileName).toBe('session.jsonl')
    expect(events[0]!.content).toBe('{"a":1}\n')
    await adapter.pollOnce(e => events.push(e))
    expect(events).toHaveLength(1) // unchanged → no re-emit
    f1.lastModified = 200
    await adapter.pollOnce(e => events.push(e))
    expect(events).toHaveLength(2)
  })
  it('reads only the tail of large files', async () => {
    const big = 'x'.repeat(300 * 1024) + 'TAIL'
    const root = fakeRoot([fakeDir('d', { 'big.jsonl': fakeFile(big, 1) })])
    const adapter = new FolderPickerAdapter(root, 0)
    const events: FileEvent[] = []
    await adapter.pollOnce(e => events.push(e))
    expect(events[0]!.content.length).toBeLessThanOrEqual(256 * 1024)
    expect(events[0]!.content.endsWith('TAIL')).toBe(true)
  })
  it('surfaces nested <sessionId>/subagents/agent-*.jsonl with meta join keys', async () => {
    const now = Date.now()
    const meta = fakeFile('{"agentType":"Explore","description":"find configs","toolUseId":"toolu_XYZ"}', now)
    const subagents = fakeDir('subagents', {
      'agent-a1.jsonl': fakeFile('{"x":1}\n', now),
      'agent-a1.meta.json': meta,
    })
    const sessionDir = fakeDir('sess-1', {}, [subagents])
    const root = fakeRoot([fakeDir('-Users-y-webshop', { 'sess-1.jsonl': fakeFile('{"m":1}\n', now) }, [sessionDir])])
    const adapter = new FolderPickerAdapter(root, 0)
    const events: FileEvent[] = []
    await adapter.pollOnce(e => events.push(e))
    expect(events).toHaveLength(2)
    const sub = events.find(e => e.kind === 'subagent')!
    expect(sub.dirKey).toBe('-Users-y-webshop')   // parent PROJECT dir, never "subagents"
    expect(sub.fileName).toBe('agent-a1.jsonl')
    expect(sub.sessionId).toBe('sess-1')
    expect(sub.toolUseId).toBe('toolu_XYZ')
    expect(sub.agentType).toBe('Explore')
    expect(sub.description).toBe('find configs')
    expect(sub.content).toBe('{"x":1}\n')
    // unchanged → no re-emit; meta files never emitted as events
    await adapter.pollOnce(e => events.push(e))
    expect(events).toHaveLength(2)
  })
  it('skips stale subagent files (older than the waiting window) but never stale sessions', async () => {
    const now = Date.now()
    const old = now - 31 * 60_000
    const subagents = fakeDir('subagents', { 'agent-old.jsonl': fakeFile('{"x":1}\n', old) })
    const sessionDir = fakeDir('sess-1', {}, [subagents])
    const root = fakeRoot([fakeDir('d', { 'sess-1.jsonl': fakeFile('{"m":1}\n', old) }, [sessionDir])])
    const adapter = new FolderPickerAdapter(root, 0)
    const events: FileEvent[] = []
    await adapter.pollOnce(e => events.push(e))
    expect(events).toHaveLength(1)
    expect(events[0]!.fileName).toBe('sess-1.jsonl') // store decides session expiry, adapter only prunes subagent floods
  })
})
