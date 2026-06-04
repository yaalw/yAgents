import { describe, it, expect } from 'vitest'
import { mulberry32, hashString } from '../src/util/rng'

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42), b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('produces values in [0,1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
  it('hashString is stable and differs across inputs', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).not.toBe(hashString('abd'))
  })
})
