import { describe, it, expect } from 'vitest'
import { burstParticles, cropStageIndex, codeLines, scatterAt, SWING_MS, CROP_STAGE_MS } from '../src/render/effects'
import { animFrame, poseBodyOffset } from '../src/render/characters'

describe('burstParticles', () => {
  it('is deterministic for the same time and seed', () => {
    expect(burstParticles(1234, 7, 4, 9)).toEqual(burstParticles(1234, 7, 4, 9))
  })
  it('fades out over a swing cycle', () => {
    const early = burstParticles(10, 7, 4, 9)
    const late = burstParticles(SWING_MS - 10, 7, 4, 9)
    for (const p of [...early, ...late]) {
      expect(p.alpha).toBeGreaterThanOrEqual(0)
      expect(p.alpha).toBeLessThanOrEqual(1)
    }
    expect(late[0]!.alpha).toBeLessThan(early[0]!.alpha)
  })
})

describe('cropStageIndex', () => {
  it('cycles bare → stages → bare, always in range', () => {
    const seen = new Set<number>()
    for (let t = 0; t < CROP_STAGE_MS * 8; t += CROP_STAGE_MS / 2) {
      const s = cropStageIndex(t, 0, 3)
      expect(s).toBeGreaterThanOrEqual(-1)
      expect(s).toBeLessThanOrEqual(2)
      seen.add(s)
    }
    expect(seen).toEqual(new Set([-1, 0, 1, 2])) // grows through every stage and resets
  })
  it('is deterministic and staggered by seed', () => {
    expect(cropStageIndex(5000, 3, 3)).toBe(cropStageIndex(5000, 3, 3))
    expect(cropStageIndex(5000, 0, 3)).not.toBe(cropStageIndex(5000, 1, 3))
  })
})

describe('codeLines', () => {
  it('stays inside the screen and scrolls deterministically', () => {
    for (const t of [0, 500, 1000]) {
      const lines = codeLines(t, 5, 3, 8, 7)
      expect(lines).toHaveLength(3)
      for (const ln of lines) {
        expect(ln.y).toBeGreaterThanOrEqual(0)
        expect(ln.y).toBeLessThan(7)
        expect(ln.x + ln.w).toBeLessThanOrEqual(8)
      }
      expect(codeLines(t, 5, 3, 8, 7)).toEqual(lines)
    }
  })
})

describe('ground scatter', () => {
  it('is deterministic per tile and differs across themes', () => {
    expect(scatterAt('mine', 12, 7)).toEqual(scatterAt('mine', 12, 7))
    const a = [...Array(64)].map((_, i) => scatterAt('office', i, 3))
    const b = [...Array(64)].map((_, i) => scatterAt('farm', i, 3))
    expect(a).not.toEqual(b) // themes get their own scatter pattern
  })
  it('stays sparse and inside the tile', () => {
    let n = 0
    for (let tx = 0; tx < 40; tx++) {
      for (let ty = 0; ty < 40; ty++) {
        const s = scatterAt('farm', tx, ty)
        if (!s) continue
        n++
        expect(s.ox).toBeGreaterThanOrEqual(2)
        expect(s.ox).toBeLessThanOrEqual(10)
        expect(s.oy).toBeGreaterThanOrEqual(2)
        expect(s.oy).toBeLessThanOrEqual(10)
      }
    }
    expect(n).toBeGreaterThan(40)   // present: the floor feels lived-in
    expect(n).toBeLessThan(400)     // sparse: texture, not clutter
  })
})

describe('pose animation helpers', () => {
  it('animFrame flips every period and never uses randomness', () => {
    expect(animFrame(0, 280)).toBe(0)
    expect(animFrame(280, 280)).toBe(1)
    expect(animFrame(560, 280)).toBe(0)
    expect(animFrame(0, 280, 1)).toBe(1) // phase staggers characters
  })
  it('poseBodyOffset gives every pose a distinct stance', () => {
    expect(poseBodyOffset('work', 1, false).dy).toBe(-1)
    expect(poseBodyOffset('loaf', 0, false).dy).toBe(2)   // sitting low
    expect(poseBodyOffset('inspect', 1, false).dy).toBeLessThan(0) // leaning in
    expect(poseBodyOffset('idle', 0, false)).toEqual({ dx: 0, dy: 0 })
    expect(poseBodyOffset('loaf', 1, true).dy).toBe(-1)   // walking overrides pose
  })
})
