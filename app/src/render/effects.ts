// Work-target effects: the cheap, deterministic flair that makes zones feel alive.
// Everything derives from (time, seed, index) — NO Math.random — so frames are
// reproducible and tests can pin exact outputs.
import type { Theme } from './atlas'
import { TILE } from '../layout/layoutEngine'

export const SWING_MS = 560        // one full 2-frame work swing (2 × FRAME_MS)
export const CROP_STAGE_MS = 2600  // how long a crop spends in each growth stage

/** Deterministic hash → [0,1) from a few integers. */
export function det(a: number, b: number, c: number): number {
  let h = 2166136261
  h = Math.imul(h ^ (a | 0), 16777619)
  h = Math.imul(h ^ (b | 0), 16777619)
  h = Math.imul(h ^ (c | 0), 16777619)
  h ^= h >>> 13
  return ((h >>> 0) % 4096) / 4096
}

export interface Particle { x: number; y: number; alpha: number; size: number }

/** Particles bursting from an origin once per swing cycle: fly out, arc down, fade.
 *  Positions are relative to the origin, in px. */
export function burstParticles(t: number, seed: number, count: number, spread: number): Particle[] {
  const cycle = Math.floor(t / SWING_MS)
  const u = (t % SWING_MS) / SWING_MS // progress through this swing, 0..1
  const out: Particle[] = []
  for (let i = 0; i < count; i++) {
    const side = (det(seed, i, cycle) - 0.5) * 2          // -1..1 horizontal direction
    const lift = 0.6 + det(seed, i * 7 + 1, cycle) * 0.9  // launch strength
    out.push({
      x: side * spread * u,
      y: -lift * spread * u + spread * 1.1 * u * u,       // up, then gravity wins
      alpha: Math.max(0, 1 - u * 1.2),
      size: det(seed, i * 13 + 5, cycle) > 0.5 ? 2 : 1,
    })
  }
  return out
}

/** Crop growth clock: -1 = bare tilled dirt, 0..nStages-1 = growth stage.
 *  Cycles bare → sprout → ... → ripe → (harvest) bare again. */
export function cropStageIndex(t: number, seed: number, nStages: number): number {
  const phases = nStages + 1
  const idx = (Math.floor(t / CROP_STAGE_MS) + seed) % phases
  return ((idx + phases) % phases) - 1
}

/** Scrolling code lines for the office terminal: deterministic x/y/width per line. */
export function codeLines(t: number, seed: number, count: number, w: number, h: number): { x: number; y: number; w: number }[] {
  const out: { x: number; y: number; w: number }[] = []
  const scroll = Math.floor(t / 180)
  for (let i = 0; i < count; i++) {
    const row = (scroll + i * 2 + seed) % h
    const lineW = 2 + Math.floor(det(seed, i, Math.floor((scroll + i * 2) / h)) * (w - 3))
    out.push({ x: 1, y: row, w: lineW })
  }
  return out
}

/** Draw the per-theme work effect at a zone's work anchor (px). Call only while
 *  someone in the zone is actually in the `work` pose. */
export function drawWorkEffects(ctx: CanvasRenderingContext2D, theme: Theme, wx: number, wy: number, t: number, seed: number): void {
  if (theme === 'office') {
    // green-phosphor flicker on the terminal (standing on the desk, see renderer)
    const sx = wx + 8 + 3, sy = wy - 6 + 2, sw = 10, sh = 9
    const flick = 0.08 + 0.05 * ((Math.floor(t / 120) + seed) % 3)
    ctx.fillStyle = `rgba(125, 255, 154, ${flick.toFixed(3)})`
    ctx.fillRect(sx, sy, sw, sh)
    ctx.fillStyle = 'rgba(125, 255, 154, 0.8)'
    for (const ln of codeLines(t, seed, 3, sw - 2, sh - 2)) {
      ctx.fillRect(sx + ln.x, sy + 1 + ln.y, ln.w, 1)
    }
  } else if (theme === 'mine') {
    // rock chips off the boulder on every swing
    const ox = wx + TILE / 2, oy = wy + TILE / 2
    for (const p of burstParticles(t, seed, 4, 9)) {
      ctx.fillStyle = `rgba(201, 204, 212, ${p.alpha.toFixed(3)})`
      ctx.fillRect(Math.round(ox + p.x), Math.round(oy + p.y - 3), p.size, p.size)
    }
    // every few swings, a gold "+1" floats up off the ore pile
    const cycle = Math.floor(t / SWING_MS)
    if (cycle % 5 === 0) {
      const u = (t % SWING_MS) / SWING_MS
      ctx.fillStyle = `rgba(255, 215, 64, ${(1 - u).toFixed(3)})`
      ctx.font = '6px monospace'
      ctx.fillText('+1', wx + TILE + 4, wy - u * 7)
    }
  } else {
    // farm: dirt puffs where the hoe lands (front-center of the 2x2 plot)
    const ox = wx + TILE, oy = wy + TILE * 2 - 3
    for (const p of burstParticles(t, seed, 3, 7)) {
      ctx.fillStyle = `rgba(122, 82, 48, ${p.alpha.toFixed(3)})`
      ctx.fillRect(Math.round(ox + p.x), Math.round(oy + p.y), p.size, p.size)
    }
  }
}
