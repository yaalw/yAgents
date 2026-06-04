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
function fakeDir(name: string, files: Record<string, ReturnType<typeof fakeFile>>) {
  return {
    kind: 'directory', name,
    async *values() {
      for (const [fname, f] of Object.entries(files)) {
        yield { kind: 'file', name: fname, getFile: async () => f }
      }
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
})
