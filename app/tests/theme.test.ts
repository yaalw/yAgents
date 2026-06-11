import { describe, it, expect } from 'vitest'
import { themeFor, poseFor, loafs, THEME_SCOPE } from '../src/render/theme'
import type { AgentStatus } from '../src/types'

const ALL_STATUSES: AgentStatus[] = [
  'typing', 'reading', 'running', 'browsing',
  'thinking', 'waiting', 'delegating', 'working', 'idle',
]

describe('themeFor', () => {
  it('is deterministic and returns a known theme', () => {
    for (const key of ['a/1.jsonl', 'b/2.jsonl', 'c/3.jsonl', '']) {
      const t = themeFor(key, 'dir')
      expect(['office', 'mine', 'farm']).toContain(t)
      expect(themeFor(key, 'dir')).toBe(t)
    }
  })
  it('seeds by zone key under zone scope', () => {
    if (THEME_SCOPE === 'zone') {
      expect(themeFor('same', 'd1')).toBe(themeFor('same', 'd2'))
    }
  })
})

describe('poseFor', () => {
  it('maps every status to a pose (total)', () => {
    for (const s of ALL_STATUSES) {
      expect(['work', 'inspect', 'gesture', 'idle', 'loaf']).toContain(poseFor(s))
    }
  })
  it('only waiting/idle loaf', () => {
    for (const s of ALL_STATUSES) {
      expect(loafs(s)).toBe(s === 'waiting' || s === 'idle')
    }
  })
})
