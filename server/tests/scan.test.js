import { test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyPath, fileEvent, snapshot, SUBAGENT_FRESH_MS } from '../src/scan.js'

function makeTree() {
  const root = mkdtempSync(join(tmpdir(), 'yag-scan-'))
  const proj = join(root, '-Users-y-webshop')
  const subDir = join(proj, 'sess-1', 'subagents')
  mkdirSync(subDir, { recursive: true })
  writeFileSync(join(proj, 'sess-1.jsonl'), '{"main":1}\n')
  writeFileSync(join(subDir, 'agent-a1.jsonl'), '{"sub":1}\n')
  writeFileSync(join(subDir, 'agent-a1.meta.json'),
    '{"agentType":"Explore","description":"find configs","toolUseId":"toolu_XYZ"}')
  return { root, proj, subDir }
}

test('classifyPath: session files, nested subagent files, junk', () => {
  const w = '/w'
  assert.deepEqual(classifyPath('/w/proj/s1.jsonl', w), { dirKey: 'proj', fileName: 's1.jsonl' })
  assert.deepEqual(classifyPath('/w/proj/s1/subagents/agent-a.jsonl', w),
    { dirKey: 'proj', fileName: 'agent-a.jsonl', kind: 'subagent', sessionId: 's1' })
  assert.equal(classifyPath('/w/proj/s1/subagents/agent-a.meta.json', w), null)
  assert.equal(classifyPath('/w/proj/s1/tool-results/x.jsonl', w), null)
  assert.equal(classifyPath('/w/top.jsonl', w), null)
  assert.equal(classifyPath('/elsewhere/proj/s1.jsonl', w), null)
})

test('fileEvent tags subagent files with parent dirKey + meta join keys', () => {
  const { root, subDir } = makeTree()
  const e = JSON.parse(fileEvent(join(subDir, 'agent-a1.jsonl'), root))
  assert.equal(e.dirKey, '-Users-y-webshop') // parent project dir, never "subagents"
  assert.equal(e.fileName, 'agent-a1.jsonl')
  assert.equal(e.kind, 'subagent')
  assert.equal(e.sessionId, 'sess-1')
  assert.equal(e.toolUseId, 'toolu_XYZ')
  assert.equal(e.agentType, 'Explore')
  assert.equal(e.description, 'find configs')
  assert.equal(e.content, '{"sub":1}\n')
})

test('fileEvent survives a missing meta file', () => {
  const { root, subDir } = makeTree()
  writeFileSync(join(subDir, 'agent-nometa.jsonl'), '{"sub":2}\n')
  const e = JSON.parse(fileEvent(join(subDir, 'agent-nometa.jsonl'), root))
  assert.equal(e.kind, 'subagent')
  assert.equal(e.toolUseId, undefined)
})

test('snapshot lists sessions first, then fresh nested subagents; stale subagents skipped', () => {
  const { root, subDir } = makeTree()
  const stale = join(subDir, 'agent-old.jsonl')
  writeFileSync(stale, '{"sub":3}\n')
  const old = (Date.now() - SUBAGENT_FRESH_MS - 60_000) / 1000
  utimesSync(stale, old, old)
  const events = snapshot(root).map(e => JSON.parse(e))
  assert.deepEqual(events.map(e => e.fileName), ['sess-1.jsonl', 'agent-a1.jsonl'])
  assert.equal(events[1].sessionId, 'sess-1')
})
