// Organic-island terrain math. Every function here is pure and deterministic
// (all randomness via det() from util/rng) — the same seed always yields the
// same coastline, and a blob only ever GROWS as its radius grows.
//
// The shape model is a star-convex blob: a cell belongs to the island iff its
// distance from the anchor is below R · coastFactor(angle). Because the coast
// factor depends on the ANGLE only, the blob is always connected, has no
// holes, and increasing R strictly adds cells at the coastline — the three
// stability properties the world layout builds on.
import { det } from '../util/rng'

/** coastFactor range: the blob's radius swings between these multiples of R. */
export const COAST_MIN = 0.74
export const COAST_MAX = 1.12
const COAST_VAR = COAST_MAX - COAST_MIN
const ANGLE_POINTS = 14 // base angular lattice — ~6 tiles per bump at R≈13
const ANGLE_POINTS2 = 31 // second octave — small coves and spits

/** Smooth periodic value noise over the angle on a k-point lattice. */
function angleNoise(theta: number, k: number, seed: number): number {
  let u = (theta / (Math.PI * 2)) * k
  u = ((u % k) + k) % k
  const i = Math.floor(u)
  const f = u - i
  const s = f * f * (3 - 2 * f) // smoothstep between lattice points
  const a = det(i % k, 1, seed)
  const b = det((i + 1) % k, 1, seed)
  return a + (b - a) * s
}

/** Two-octave periodic noise over the angle: the island's coastline profile. */
export function coastFactor(theta: number, seed: number): number {
  const n = 0.68 * angleNoise(theta, ANGLE_POINTS, seed) +
    0.32 * angleNoise(theta, ANGLE_POINTS2, seed ^ 0x9e37)
  return COAST_MIN + COAST_VAR * n
}

/** Normalized radial distance of a cell offset: the blob contains the cell iff
 *  normDist < R. Monotonic-growth and membership tests both reduce to this. */
export function normDist(dx: number, dy: number, seed: number): number {
  const d = Math.hypot(dx, dy)
  if (d === 0) return 0
  return d / coastFactor(Math.atan2(dy, dx), seed)
}

/** Is the cell at offset (dx,dy) from the anchor inside the blob of radius r? */
export function inBlob(dx: number, dy: number, r: number, seed: number): boolean {
  return r > 0 && normDist(dx, dy, seed) < r
}

// ── cell set packing ────────────────────────────────────────────────────────
// World tile coords live within ±2048 of the origin (the spiral never gets
// remotely close); pack them into one integer for cheap Set membership.
export function packCell(tx: number, ty: number): number {
  return (ty + 2048) * 4096 + (tx + 2048)
}
export function unpackCell(p: number): { tx: number; ty: number } {
  return { tx: (p % 4096) - 2048, ty: Math.floor(p / 4096) - 2048 }
}

/** All world cells of the blob anchored at (ax,ay) with radius r. */
export function blobCells(ax: number, ay: number, r: number, seed: number): Set<number> {
  const out = new Set<number>()
  const ext = Math.ceil(r * COAST_MAX) + 1
  for (let dy = -ext; dy <= ext; dy++) {
    for (let dx = -ext; dx <= ext; dx++) {
      if (inBlob(dx, dy, r, seed)) out.add(packCell(ax + dx, ay + dy))
    }
  }
  return out
}

// ── marching-squares autotiling (quadrant flavor) ───────────────────────────
// The Ninja Adventure field tileset ships each terrain as a 5×3 autotile
// block: a 3×3 rounded blob (outer corners/edges/center) plus a 2×2 of inner
// (concave) corners whose notches sit at the 2×2's outer corners. Rendering
// each land cell as four 8×8 quadrants — each picked from that block by the
// three neighbors that touch the quadrant — covers every marching-squares
// case with no extra art.

/** One quadrant's source pick: tile (c,r) within the 5×3 block, quadrant (qx,qy). */
export interface QuadSrc { c: number; r: number; qx: 0 | 1; qy: 0 | 1 }

/** Quadrant sources for a land cell given its 8 neighbors' membership. */
export function quadrantSources(
  n: boolean, s: boolean, e: boolean, w: boolean,
  nw: boolean, ne: boolean, sw: boolean, se: boolean,
): [QuadSrc, QuadSrc, QuadSrc, QuadSrc] {
  const tl: [number, number] = !n && !w ? [0, 0] : !n ? [1, 0] : !w ? [0, 1] : !nw ? [3, 0] : [1, 1]
  const tr: [number, number] = !n && !e ? [2, 0] : !n ? [1, 0] : !e ? [2, 1] : !ne ? [4, 0] : [1, 1]
  const bl: [number, number] = !s && !w ? [0, 2] : !s ? [1, 2] : !w ? [0, 1] : !sw ? [3, 1] : [1, 1]
  const br: [number, number] = !s && !e ? [2, 2] : !s ? [1, 2] : !e ? [2, 1] : !se ? [4, 1] : [1, 1]
  return [
    { c: tl[0], r: tl[1], qx: 0, qy: 0 },
    { c: tr[0], r: tr[1], qx: 1, qy: 0 },
    { c: bl[0], r: bl[1], qx: 0, qy: 1 },
    { c: br[0], r: br[1], qx: 1, qy: 1 },
  ]
}

/** Is the cell fully interior (all 8 neighbors present)? Fast path: one 16px blit. */
export function isInterior(has: (tx: number, ty: number) => boolean, tx: number, ty: number): boolean {
  return has(tx, ty - 1) && has(tx, ty + 1) && has(tx + 1, ty) && has(tx - 1, ty) &&
    has(tx - 1, ty - 1) && has(tx + 1, ty - 1) && has(tx - 1, ty + 1) && has(tx + 1, ty + 1)
}
