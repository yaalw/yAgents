import { describe, it, expect } from 'vitest'
import { Camera } from '../src/render/camera'

describe('Camera', () => {
  it('round-trips screen↔world', () => {
    const c = new Camera()
    c.scale = 3; c.x = 100; c.y = 50
    const w = c.screenToWorld(300, 200)
    const s = c.worldToScreen(w.x, w.y)
    expect(s.x).toBeCloseTo(300)
    expect(s.y).toBeCloseTo(200)
  })
  it('zoomAt keeps the anchor point fixed and scales multiplicatively', () => {
    const c = new Camera()
    c.scale = 2
    const before = c.screenToWorld(400, 300)
    c.zoomAt(400, 300, 1.5)
    const after = c.screenToWorld(400, 300)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(c.scale).toBe(3) // 2 * 1.5
  })
  it('clamps scale to [0.75, 8]', () => {
    const c = new Camera()
    for (let i = 0; i < 60; i++) c.zoomAt(0, 0, 1.1)
    expect(c.scale).toBe(8)
    for (let i = 0; i < 80; i++) c.zoomAt(0, 0, 0.9)
    expect(c.scale).toBe(0.75)
  })
  it('many small steps give fine-grained zoom (no big jumps)', () => {
    const c = new Camera()
    c.scale = 2
    c.zoomAt(0, 0, 1.02) // a single fine tick
    expect(c.scale).toBeCloseTo(2.04)
    expect(c.scale).toBeLessThan(2.1) // not a whole-level jump
  })
})
