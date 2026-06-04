import { test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTail } from '../src/tail.js'

test('reads small files whole', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yag-'))
  const f = join(dir, 'a.jsonl')
  writeFileSync(f, 'hello\n')
  assert.equal(readTail(f), 'hello\n')
})

test('reads only last 256KB of big files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yag-'))
  const f = join(dir, 'big.jsonl')
  writeFileSync(f, 'x'.repeat(300 * 1024) + 'TAIL')
  const out = readTail(f)
  assert.ok(out.length <= 256 * 1024)
  assert.ok(out.endsWith('TAIL'))
})

test('returns empty string on missing file', () => {
  assert.equal(readTail('/nonexistent/nope.jsonl'), '')
})
