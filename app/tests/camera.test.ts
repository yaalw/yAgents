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
  it('zoomAt keeps the anchor point fixed', () => {
    const c = new Camera()
    c.scale = 2
    const before = c.screenToWorld(400, 300)
    c.zoomAt(400, 300, 1)
    const after = c.screenToWorld(400, 300)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(c.scale).toBe(3)
  })
  it('clamps scale to [1,6]', () => {
    const c = new Camera()
    for (let i = 0; i < 20; i++) c.zoomAt(0, 0, 1)
    expect(c.scale).toBe(6)
    for (let i = 0; i < 20; i++) c.zoomAt(0, 0, -1)
    expect(c.scale).toBe(1)
  })
})
