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
  it('scopes themes per folder: every zone sharing a dirKey gets the same theme', () => {
    expect(THEME_SCOPE).toBe('room')
    for (const dir of ['-demo-webshop', '-demo-api', '-demo-infra', 'x']) {
      const themes = new Set(['s1', 's2', 's3', 's4', 's5'].map(k => themeFor(dir + '/' + k, dir)))
      expect(themes.size).toBe(1)
    }
  })
  it('different folders can land different themes (all three reachable)', () => {
    const themes = new Set(['-demo-api', '-demo-infra', '-demo-webshop'].map(d => themeFor('zone', d)))
    expect(themes).toEqual(new Set(['office', 'mine', 'farm']))
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
