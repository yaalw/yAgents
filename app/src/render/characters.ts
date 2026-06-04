import type { AgentStatus } from '../types'
import type { Seat } from '../layout/layoutEngine'
import { hashString } from '../util/rng'

const SPEED = 6 // tiles per second

export class Character {
  x: number
  y: number
  targetX: number
  targetY: number
  walking = false
  leaving = false
  constructor(public key: string, public kind: 'main' | 'sub', public status: AgentStatus, tx: number, ty: number) {
    this.x = tx; this.y = ty; this.targetX = tx; this.targetY = ty
  }
  get palette(): number { return hashString(this.key) }
  update(dt: number): void {
    const dx = this.targetX - this.x, dy = this.targetY - this.y
    const dist = Math.hypot(dx, dy)
    if (dist < 0.01) { this.x = this.targetX; this.y = this.targetY; this.walking = false; return }
    this.walking = true
    const step = Math.min(dist, SPEED * dt)
    this.x += (dx / dist) * step
    this.y += (dy / dist) * step
    // Check if we've arrived after this move
    const newDx = this.targetX - this.x, newDy = this.targetY - this.y
    const newDist = Math.hypot(newDx, newDy)
    if (newDist < 0.01) { this.x = this.targetX; this.y = this.targetY; this.walking = false }
  }
}

export class CharacterSet {
  private chars = new Map<string, Character>()

  sync(seats: Seat[]): void {
    const seen = new Set<string>()
    for (const s of seats) {
      seen.add(s.agentKey)
      const existing = this.chars.get(s.agentKey)
      if (existing) {
        existing.targetX = s.tx; existing.targetY = s.ty
        existing.status = s.status; existing.leaving = false
      } else {
        // new characters walk in from the top-left door area of their seat's column
        const c = new Character(s.agentKey, s.kind, s.status, s.tx, -2)
        c.targetX = s.tx; c.targetY = s.ty
        this.chars.set(s.agentKey, c)
      }
    }
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
