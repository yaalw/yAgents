import { describe, it, expect } from 'vitest'
import {
  coastFactor, inBlob, normDist, blobCells, packCell, unpackCell,
  quadrantSources, isInterior, COAST_MIN, COAST_MAX,
} from '../src/layout/terrain'

describe('coastFactor', () => {
  it('stays inside the documented band and is deterministic', () => {
    for (let i = 0; i < 200; i++) {
      const th = (i / 200) * Math.PI * 4 - Math.PI * 2
      const f = coastFactor(th, 1234)
      expect(f).toBeGreaterThanOrEqual(COAST_MIN)
      expect(f).toBeLessThanOrEqual(COAST_MAX)
      expect(coastFactor(th, 1234)).toBe(f)
    }
  })
  it('is periodic over the full circle', () => {
    for (const th of [0, 0.7, 2.1, -1.3]) {
      expect(coastFactor(th + Math.PI * 2, 99)).toBeCloseTo(coastFactor(th, 99), 6)
    }
  })
  it('differs across seeds (different islands get different coastlines)', () => {
    const a = [...Array(32)].map((_, i) => coastFactor(i / 5, 1))
    const b = [...Array(32)].map((_, i) => coastFactor(i / 5, 2))
    expect(a).not.toEqual(b)
  })
})

describe('blob', () => {
  it('membership is monotonic in the radius (islands only grow)', () => {
    for (const seed of [7, 555, 90210]) {
      for (let dy = -16; dy <= 16; dy += 2) {
        for (let dx = -16; dx <= 16; dx += 2) {
          if (inBlob(dx, dy, 9, seed)) expect(inBlob(dx, dy, 12, seed)).toBe(true)
        }
      }
    }
  })
  it('blobCells(R1) ⊆ blobCells(R2) for R1 < R2', () => {
    const small = blobCells(0, 0, 9, 42)
    const big = blobCells(0, 0, 12.5, 42)
    for (const p of small) expect(big.has(p)).toBe(true)
    expect(big.size).toBeGreaterThan(small.size)
  })
  it('the blob is connected (star-convex shape, no stranded cells)', () => {
    for (const seed of [3, 1717, 424242]) {
      const cells = blobCells(0, 0, 11, seed)
      // flood fill from the anchor
      const seen = new Set<number>([packCell(0, 0)])
      const queue = [{ tx: 0, ty: 0 }]
      while (queue.length > 0) {
        const { tx, ty } = queue.pop()!
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
          const p = packCell(tx + dx, ty + dy)
          if (cells.has(p) && !seen.has(p)) { seen.add(p); queue.push({ tx: tx + dx, ty: ty + dy }) }
        }
      }
      expect(seen.size).toBe(cells.size)
    }
  })
  it('contains the anchor and respects normDist as the membership oracle', () => {
    expect(inBlob(0, 0, 1, 5)).toBe(true)
    expect(normDist(0, 0, 5)).toBe(0)
    expect(inBlob(3, 4, 8, 5)).toBe(normDist(3, 4, 5) < 8)
  })
})

describe('cell packing', () => {
  it('round-trips negative and positive world coords', () => {
    for (const [tx, ty] of [[0, 0], [-31, 17], [200, -45], [-1, -1]] as const) {
      expect(unpackCell(packCell(tx, ty))).toEqual({ tx, ty })
    }
  })
})

describe('quadrant autotiling', () => {
  it('a fully interior cell uses the center tile for all four quadrants', () => {
    const q = quadrantSources(true, true, true, true, true, true, true, true)
    for (const s of q) expect([s.c, s.r]).toEqual([1, 1])
  })
  it('an isolated cell uses the four outer corners', () => {
    const q = quadrantSources(false, false, false, false, false, false, false, false)
    expect(q.map(s => [s.c, s.r])).toEqual([[0, 0], [2, 0], [0, 2], [2, 2]])
  })
  it('a missing diagonal yields the matching inner-corner tile', () => {
    // all cardinals present, NW sea → TL quadrant takes the (3,0) inner corner
    const q = quadrantSources(true, true, true, true, false, true, true, true)
    expect([q[0].c, q[0].r]).toEqual([3, 0])
    // the other three quadrants stay center
    for (const s of q.slice(1)) expect([s.c, s.r]).toEqual([1, 1])
  })
  it('a straight north coast uses the top-edge tile for both top quadrants', () => {
    const q = quadrantSources(false, true, true, true, false, false, true, true)
    expect([q[0].c, q[0].r]).toEqual([1, 0])
    expect([q[1].c, q[1].r]).toEqual([1, 0])
    expect([q[2].c, q[2].r]).toEqual([1, 1])
    expect([q[3].c, q[3].r]).toEqual([1, 1])
  })
  it('isInterior demands all eight neighbors', () => {
    const cells = new Set([packCell(0, 0), packCell(1, 0), packCell(-1, 0), packCell(0, 1), packCell(0, -1),
      packCell(1, 1), packCell(-1, -1), packCell(1, -1), packCell(-1, 1)])
    const has = (tx: number, ty: number) => cells.has(packCell(tx, ty))
    expect(isInterior(has, 0, 0)).toBe(true)
    expect(isInterior(has, 1, 0)).toBe(false)
  })
})
