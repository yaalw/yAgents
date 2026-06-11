import { describe, it, expect } from 'vitest'
import { CharacterSet } from '../src/render/characters'
import type { Seat } from '../src/layout/layoutEngine'

const seat = (key: string, tx: number, ty: number): Seat =>
  ({ agentKey: key, kind: 'main', status: 'typing', pose: 'work', theme: 'office', tx, ty, tableKey: key })

describe('CharacterSet', () => {
  it('spawns characters at their seat and removes departed ones', () => {
    const set = new CharacterSet()
    set.sync([seat('a', 5, 5)])
    expect(set.all()).toHaveLength(1)
    expect(set.all()[0]!.x).toBe(5)
    set.sync([])
    set.update(10) // give leave animation time
    expect(set.all()).toHaveLength(0)
  })
  it('walks toward a new target instead of teleporting', () => {
    const set = new CharacterSet()
    set.sync([seat('a', 0, 0)])
    set.sync([seat('a', 10, 0)])
    set.update(0.5)
    const c = set.all()[0]!
    expect(c.x).toBeGreaterThan(0)
    expect(c.x).toBeLessThan(10)
    expect(c.walking).toBe(true)
    set.update(10)
    expect(set.all()[0]!.x).toBe(10)
    expect(set.all()[0]!.walking).toBe(false)
  })
})
