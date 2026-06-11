import type { AgentStatus } from '../types'
import type { Seat, SeatKind } from '../layout/layoutEngine'
import type { Pose } from './theme'
import type { Theme } from './atlas'
import { hashString } from '../util/rng'

const SPEED = 6 // tiles per second

/** Which way a character's sprite points. Derived from movement while
 *  walking; from the seat's face target (the work object) when still. */
export type Facing = 'down' | 'up' | 'left' | 'right'

/** Dominant-axis facing for a delta; vertical wins ties (work objects sit above seats). */
export function facingFor(dx: number, dy: number, fallback: Facing = 'down'): Facing {
  if (dx === 0 && dy === 0) return fallback
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'up' : 'down'
  return dx < 0 ? 'left' : 'right'
}

// 2-frame animation clocks. Everything derives from time — no Math.random,
// so frames are deterministic and characters desync only via their phase.
export const FRAME_MS = 280      // work swings, walk cycle, gestures
export const IDLE_FRAME_MS = 900 // slow breathing

/** Frame index (0|1) for a 2-frame loop; phase staggers characters apart. */
export function animFrame(t: number, periodMs: number, phase = 0): 0 | 1 {
  return ((Math.floor(t / periodMs) + phase) % 2) as 0 | 1
}

/** Body pixel offset for a pose at a given frame. Walking overrides poses. */
export function poseBodyOffset(pose: Pose, frame: 0 | 1, walking: boolean): { dx: number; dy: number } {
  if (walking) return { dx: 0, dy: frame ? -1 : 0 }
  switch (pose) {
    case 'work': return { dx: 0, dy: frame ? -1 : 0 }      // action bob
    case 'inspect': return { dx: 0, dy: frame ? -2 : -1 }  // leaning in toward the object
    case 'gesture': return { dx: frame ? 1 : 0, dy: 0 }    // animated pointing
    case 'idle': return { dx: 0, dy: frame ? -1 : 0 }      // slow breathe (slow clock)
    case 'loaf': return { dx: 0, dy: 2 }                   // sitting low, relaxed
  }
}

/** Tiny procedurally-drawn tool overlay for the work pose, per theme.
 *  Drawn on top of the 16px body sprite at (x, y); pixel-crisp fillRects only. */
export function drawToolOverlay(ctx: CanvasRenderingContext2D, theme: Theme, frame: 0 | 1, x: number, y: number): void {
  if (theme === 'mine') {
    // pickaxe in the right hand: raised diagonal → struck down
    ctx.fillStyle = '#8a5a2b' // wooden handle
    if (frame === 0) {
      ctx.fillRect(x + 12, y + 6, 2, 2)
      ctx.fillRect(x + 13, y + 4, 2, 2)
      ctx.fillRect(x + 14, y + 2, 2, 2)
      ctx.fillStyle = '#b8bcc8' // steel head, perpendicular at the top
      ctx.fillRect(x + 12, y + 1, 4, 2)
    } else {
      ctx.fillRect(x + 12, y + 8, 2, 2)
      ctx.fillRect(x + 14, y + 9, 2, 2)
      ctx.fillStyle = '#b8bcc8'
      ctx.fillRect(x + 14, y + 11, 3, 2)
    }
  } else if (theme === 'farm') {
    // hoe: lifted → chopped into the dirt
    ctx.fillStyle = '#8a5a2b'
    if (frame === 0) {
      ctx.fillRect(x + 12, y + 3, 2, 6)
      ctx.fillStyle = '#5a6470' // iron blade
      ctx.fillRect(x + 11, y + 2, 3, 2)
    } else {
      ctx.fillRect(x + 12, y + 7, 2, 5)
      ctx.fillStyle = '#5a6470'
      ctx.fillRect(x + 11, y + 12, 3, 2)
    }
  } else {
    // office: hands tapping on a tiny slab keyboard in front of the body
    ctx.fillStyle = '#2a2438'
    ctx.fillRect(x + 3, y + 13, 10, 3)
    ctx.fillStyle = '#e8c39e' // hands alternate keys
    if (frame === 0) { ctx.fillRect(x + 4, y + 12, 2, 2); ctx.fillRect(x + 10, y + 13, 2, 2) }
    else { ctx.fillRect(x + 5, y + 13, 2, 2); ctx.fillRect(x + 9, y + 12, 2, 2) }
    ctx.fillStyle = '#7dff9a' // a lit key
    ctx.fillRect(x + (frame === 0 ? 7 : 8), y + 14, 1, 1)
  }
}

export class Character {
  x: number
  y: number
  targetX: number
  targetY: number
  walking = false
  leaving = false
  pose: Pose = 'idle'
  theme: Theme = 'office'
  facing: Facing = 'down'
  /** tile the character turns toward once it stops walking (e.g. the work object) */
  faceTx?: number
  faceTy?: number
  constructor(public key: string, public kind: SeatKind, public status: AgentStatus, tx: number, ty: number) {
    this.x = tx; this.y = ty; this.targetX = tx; this.targetY = ty
  }
  get palette(): number { return hashString(this.key) }
  /** Re-derive facing from the face target; no-op mid-walk (movement owns facing then). */
  refreshFacing(): void { if (!this.walking) this.settleFacing() }
  private settleFacing(): void {
    if (this.faceTx !== undefined && this.faceTy !== undefined) {
      this.facing = facingFor(this.faceTx - this.x, this.faceTy - this.y, this.facing)
    } else {
      this.facing = 'down'
    }
  }
  update(dt: number): void {
    const dx = this.targetX - this.x, dy = this.targetY - this.y
    const dist = Math.hypot(dx, dy)
    if (dist < 0.01) {
      this.x = this.targetX; this.y = this.targetY
      if (this.walking) { this.walking = false; this.settleFacing() }
      return
    }
    if (!this.walking) this.walking = true
    this.facing = facingFor(dx, dy, this.facing)
    const step = Math.min(dist, SPEED * dt)
    this.x += (dx / dist) * step
    this.y += (dy / dist) * step
    // Check if we've arrived after this move
    const newDx = this.targetX - this.x, newDy = this.targetY - this.y
    const newDist = Math.hypot(newDx, newDy)
    if (newDist < 0.01) { this.x = this.targetX; this.y = this.targetY; this.walking = false; this.settleFacing() }
  }
}

export class CharacterSet {
  private chars = new Map<string, Character>()
  private booted = false

  sync(seats: Seat[]): void {
    const seen = new Set<string>()
    for (const s of seats) {
      seen.add(s.agentKey)
      const existing = this.chars.get(s.agentKey)
      if (existing) {
        existing.targetX = s.tx; existing.targetY = s.ty
        existing.status = s.status; existing.pose = s.pose; existing.theme = s.theme
        existing.faceTx = s.faceTx; existing.faceTy = s.faceTy
        existing.refreshFacing()
        existing.leaving = false
      } else {
        // the very first sync places everyone at their seat (the office was already
        // running before we looked); later arrivals walk in from the top of their column
        const c = new Character(s.agentKey, s.kind, s.status, s.tx, this.booted ? -2 : s.ty)
        c.targetX = s.tx; c.targetY = s.ty
        c.pose = s.pose; c.theme = s.theme
        c.faceTx = s.faceTx; c.faceTy = s.faceTy
        c.refreshFacing() // already-seated characters turn toward their work right away
        this.chars.set(s.agentKey, c)
      }
    }
    if (seats.length > 0) this.booted = true
    for (const [key, c] of this.chars) {
      if (!seen.has(key) && !c.leaving) { c.leaving = true; c.targetY = -2 }
    }
  }

  update(dt: number): void {
    for (const [key, c] of this.chars) {
      c.update(dt)
      if (c.leaving && !c.walking) this.chars.delete(key)
    }
  }

  all(): Character[] { return [...this.chars.values()] }
}
