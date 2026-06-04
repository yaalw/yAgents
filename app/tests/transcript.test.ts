import { describe, it, expect } from 'vitest'
import { parseLine } from '../src/parser/transcript'

const asst = (content: unknown[], extra = {}) => JSON.stringify({
  type: 'assistant', timestamp: '2026-06-04T01:00:00.000Z', sessionId: 's1',
  cwd: '/Users/y/webshop', isSidechain: false,
  message: { role: 'assistant', model: 'claude-opus-4-8', content }, ...extra,
})

describe('parseLine', () => {
  it('extracts tool_use with file target', () => {
    const p = parseLine(asst([{ type: 'tool_use', id: 't1', name: 'Write', input: { file_path: 'src/a.ts' } }]))!
    expect(p.role).toBe('assistant')
    expect(p.toolUses).toEqual([{ id: 't1', name: 'Write', target: 'src/a.ts' }])
    expect(p.sessionId).toBe('s1')
    expect(p.cwd).toBe('/Users/y/webshop')
    expect(p.model).toBe('claude-opus-4-8')
    expect(p.timestampMs).toBe(Date.parse('2026-06-04T01:00:00.000Z'))
  })
  it('uses command/pattern/url as fallback targets', () => {
    const p = parseLine(asst([
      { type: 'tool_use', id: 'a', name: 'Bash', input: { command: 'npm test' } },
      { type: 'tool_use', id: 'b', name: 'Grep', input: { pattern: 'foo' } },
      { type: 'tool_use', id: 'c', name: 'WebFetch', input: { url: 'https://x.y' } },
    ]))!
    expect(p.toolUses.map(t => t.target)).toEqual(['npm test', 'foo', 'https://x.y'])
  })
  it('detects text content', () => {
    const p = parseLine(asst([{ type: 'text', text: 'hello' }]))!
    expect(p.hasText).toBe(true)
    expect(p.toolUses).toEqual([])
  })
  it('extracts tool_result ids from user lines', () => {
    const p = parseLine(JSON.stringify({
      type: 'user', isSidechain: false,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1' }] },
    }))!
    expect(p.role).toBe('user')
    expect(p.toolResultIds).toEqual(['t1'])
  })
  it('flags sidechain entries', () => {
    const p = parseLine(asst([{ type: 'text', text: 'sub' }], { isSidechain: true }))!
    expect(p.isSidechain).toBe(true)
  })
  it('returns null on garbage and non-message lines', () => {
    expect(parseLine('not json {')).toBeNull()
    expect(parseLine(JSON.stringify({ type: 'summary', summary: 'x' }))).toBeNull()
    expect(parseLine('')).toBeNull()
  })
  it('handles string message content', () => {
    const p = parseLine(JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }))!
    expect(p.hasText).toBe(true)
  })
})
