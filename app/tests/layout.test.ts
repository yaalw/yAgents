import { describe, it, expect } from 'vitest'
import { layout, KITCHEN_W } from '../src/layout/layoutEngine'
import type { OfficeView } from '../src/types'

const view = (overrides?: Partial<OfficeView>): OfficeView => ({
  rooms: [{
    dirKey: 'd1', label: 'webshop', tables: [{
      key: 'd1/a.jsonl', status: 'typing', lastActivityMs: 0,
      subagents: [{ id: 'x', status: 'reading' }, { id: 'y', status: 'working' }],
    }],
  }],
  ...overrides,
})

describe('layout', () => {
  it('places kitchen leftmost and rooms rightward', () => {
    const plan = layout(view())
    expect(plan.kitchen.tx).toBe(0)
    expect(plan.rooms[0]!.tx).toBe(KITCHEN_W)
    expect(plan.rooms[0]!.label).toBe('webshop')
  })
  it('seats main agent at head and subagents below', () => {
    const plan = layout(view())
    const main = plan.seats.find(s => s.kind === 'main')!
    const subs = plan.seats.filter(s => s.kind === 'sub')
    expect(subs).toHaveLength(2)
    const table = plan.rooms[0]!.tables[0]!
    expect(main.ty).toBe(table.ty - 1)          // head: above the table
    for (const s of subs) expect(s.ty).toBe(table.ty + table.th) // below
  })
  it('caps visible subagents at 4 and reports overflow', () => {
    const v = view()
    v.rooms[0]!.tables[0]!.subagents = Array.from({ length: 6 }, (_, i) => ({ id: 'i' + i, status: 'working' as const }))
    const plan = layout(v)
    expect(plan.seats.filter(s => s.kind === 'sub')).toHaveLength(4)
    expect(plan.rooms[0]!.tables[0]!.overflow).toBe(2)
  })
  it('rooms grow with table count', () => {
    const v = view()
    v.rooms[0]!.tables.push({ key: 'd1/b.jsonl', status: 'reading', lastActivityMs: 0, subagents: [] })
    v.rooms[0]!.tables.push({ key: 'd1/c.jsonl', status: 'reading', lastActivityMs: 0, subagents: [] })
    const plan = layout(v)
    expect(plan.rooms[0]!.th).toBeGreaterThan(12)
    expect(plan.rooms[0]!.tables).toHaveLength(3)
  })
  it('waiting main agents sit in the kitchen', () => {
    const v = view()
    v.rooms[0]!.tables[0]!.status = 'waiting'
    const plan = layout(v)
    const main = plan.seats.find(s => s.kind === 'main')!
    expect(main.tx).toBeLessThan(KITCHEN_W)
    expect(main.status).toBe('waiting')
  })
  it('is deterministic', () => {
    expect(layout(view())).toEqual(layout(view()))
  })
})
