import { describe, it, expect } from 'vitest'
import { layout, ZONE_W, ZONE_H } from '../src/layout/layoutEngine'
import { themeFor, poseFor } from '../src/render/theme'
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
  it('emits one zone per session with the locked geometry', () => {
    const plan = layout(view())
    const room = plan.rooms[0]!
    expect(room.tx).toBe(0)
    expect(room.label).toBe('webshop')
    expect(room.zones).toHaveLength(1)
    const z = room.zones[0]!
    expect([z.tw, z.th]).toEqual([ZONE_W, ZONE_H])
    // zone inside room bounds
    expect(z.tx).toBeGreaterThanOrEqual(room.tx)
    expect(z.ty).toBeGreaterThanOrEqual(room.ty)
    expect(z.tx + z.tw).toBeLessThanOrEqual(room.tx + room.tw)
    expect(z.ty + z.th).toBeLessThanOrEqual(room.ty + room.th)
    // work anchor and lounge nook at the contract offsets
    expect([z.workTx, z.workTy]).toEqual([z.tx + 5, z.ty + 2])
    expect(z.lounge).toEqual({ tx: z.tx + 1, ty: z.ty + 6, tw: 4, th: 3 })
    expect(z.tableKey).toBe('d1/a.jsonl')
    expect(z.theme).toBe(themeFor('d1/a.jsonl', 'd1'))
  })

  it('puts the working main in front of the object and subs clustered around it', () => {
    const plan = layout(view())
    const z = plan.rooms[0]!.zones[0]!
    const main = plan.seats.find(s => s.kind === 'main')!
    expect([main.tx, main.ty]).toEqual([z.tx + 5, z.ty + 4])
    expect(main.pose).toBe(poseFor('typing'))
    expect(main.theme).toBe(z.theme)
    const subs = plan.seats.filter(s => s.kind === 'sub')
    expect(subs).toHaveLength(2)
    const cluster = [[4, 3], [7, 3], [4, 5], [7, 5]].map(([dx, dy]) => `${z.tx + dx!},${z.ty + dy!}`)
    for (const s of subs) {
      expect(cluster).toContain(`${s.tx},${s.ty}`)
      expect(s.agentKey).toBe('d1/a.jsonl#' + s.agentKey.split('#')[1])  // '#' separator preserved
    }
  })

  it('routes loafing agents (waiting/idle) into the lounge nook', () => {
    const v = view()
    v.rooms[0]!.tables[0]!.status = 'waiting'
    v.rooms[0]!.tables[0]!.subagents = [{ id: 'x', status: 'working' }, { id: 'y', status: 'idle' }]
    const plan = layout(v)
    const z = plan.rooms[0]!.zones[0]!
    const inNook = (s: { tx: number; ty: number }) =>
      s.tx >= z.lounge.tx && s.tx < z.lounge.tx + z.lounge.tw &&
      s.ty >= z.lounge.ty && s.ty < z.lounge.ty + z.lounge.th
    const main = plan.seats.find(s => s.kind === 'main')!
    expect(main.pose).toBe('loaf')
    expect(inNook(main)).toBe(true)
    const loafer = plan.seats.find(s => s.agentKey === 'd1/a.jsonl#y')!
    expect(loafer.pose).toBe('loaf')
    expect(inNook(loafer)).toBe(true)
    expect([main.tx, main.ty]).not.toEqual([loafer.tx, loafer.ty]) // distinct loaf spots
    const worker = plan.seats.find(s => s.agentKey === 'd1/a.jsonl#x')!
    expect(inNook(worker)).toBe(false)
  })

  it('caps visible subagents at 4 and reports overflow on the zone', () => {
    const v = view()
    v.rooms[0]!.tables[0]!.subagents = Array.from({ length: 6 }, (_, i) => ({ id: 'i' + i, status: 'working' as const }))
    const plan = layout(v)
    expect(plan.seats.filter(s => s.kind === 'sub')).toHaveLength(4)
    expect(plan.rooms[0]!.zones[0]!.overflow).toBe(2)
  })

  it('stacks zones vertically and attaches rooms left-to-right with a gap', () => {
    const v = view()
    v.rooms[0]!.tables.push({ key: 'd1/b.jsonl', status: 'reading', lastActivityMs: 0, subagents: [] })
    v.rooms.push({ dirKey: 'd2', label: 'api', tables: [{ key: 'd2/c.jsonl', status: 'running', lastActivityMs: 0, subagents: [] }] })
    const plan = layout(v)
    const [r1, r2] = [plan.rooms[0]!, plan.rooms[1]!]
    expect(r1.zones[0]!.ty).toBe(0)
    expect(r1.zones[1]!.ty).toBe(ZONE_H)
    expect(r1.th).toBe(2 * ZONE_H)
    expect(r2.tx).toBe(ZONE_W + 1) // 1-tile gap
    expect(plan.tw).toBe(2 * ZONE_W + 1)
    expect(plan.th).toBe(2 * ZONE_H)
  })

  it('is deterministic', () => {
    expect(layout(view())).toEqual(layout(view()))
  })
})
