import { describe, it, expect } from 'vitest'
import { layout, STATION_W, STATION_H } from '../src/layout/layoutEngine'
import { themeFor, poseFor } from '../src/render/theme'
import type { OfficeView, TableView } from '../src/types'

const table = (key: string, overrides?: Partial<TableView>): TableView => ({
  key, status: 'typing', lastActivityMs: 0, subagents: [], ...overrides,
})

const view = (overrides?: Partial<OfficeView>): OfficeView => ({
  rooms: [{
    dirKey: 'd1', label: 'webshop', tables: [
      table('d1/a.jsonl', { subagents: [{ id: 'x', status: 'reading' }, { id: 'y', status: 'working' }] }),
    ],
  }],
  ...overrides,
})

const rectsOverlap = (a: { tx: number; ty: number; tw: number; th: number }, b: { tx: number; ty: number; tw: number; th: number }) =>
  a.tx < b.tx + b.tw && b.tx < a.tx + a.tw && a.ty < b.ty + b.th && b.ty < a.ty + a.th

describe('layout', () => {
  it('emits ONE room per folder with one station per session inside it', () => {
    const plan = layout(view())
    expect(plan.rooms).toHaveLength(1)
    const room = plan.rooms[0]!
    expect(room.tx).toBe(0)
    expect(room.label).toBe('webshop')
    expect(room.theme).toBe(themeFor('d1/a.jsonl', 'd1'))
    expect(room.stations).toHaveLength(1)
    const st = room.stations[0]!
    expect([st.tw, st.th]).toEqual([STATION_W, STATION_H])
    expect(st.tableKey).toBe('d1/a.jsonl')
    expect(st.theme).toBe(room.theme)
    // station fully inside the room, below the back-wall row
    expect(st.tx).toBeGreaterThanOrEqual(room.tx + 1)
    expect(st.ty).toBeGreaterThanOrEqual(room.ty + 1)
    expect(st.tx + st.tw).toBeLessThanOrEqual(room.tx + room.tw)
    expect(st.ty + st.th).toBeLessThanOrEqual(room.ty + room.th)
    // work anchor inside the station rect
    expect(st.workTx).toBe(st.tx + 3)
    expect(st.workTy).toBe(st.ty + 1)
  })

  it('a multi-session folder is one continuous room with ONE shared lounge', () => {
    const v = view()
    v.rooms[0]!.tables.push(table('d1/b.jsonl'))
    const plan = layout(v)
    expect(plan.rooms).toHaveLength(1)            // still one room — no stacked boxes
    const room = plan.rooms[0]!
    expect(room.stations).toHaveLength(2)
    // both stations inside the same room, not overlapping each other or the lounge
    const [s1, s2] = [room.stations[0]!, room.stations[1]!]
    for (const s of [s1, s2]) {
      expect(s.tx).toBeGreaterThanOrEqual(room.tx)
      expect(s.tx + s.tw).toBeLessThanOrEqual(room.tx + room.tw)
      expect(s.ty + s.th).toBeLessThanOrEqual(room.ty + room.th)
    }
    expect(rectsOverlap(s1, s2)).toBe(false)
    expect(rectsOverlap(s1, room.lounge)).toBe(false)
    expect(rectsOverlap(s2, room.lounge)).toBe(false)
    // the lounge sits inside the room
    expect(room.lounge.tx).toBeGreaterThanOrEqual(room.tx)
    expect(room.lounge.tx + room.lounge.tw).toBeLessThanOrEqual(room.tx + room.tw)
    expect(room.lounge.ty + room.lounge.th).toBeLessThanOrEqual(room.ty + room.th)
  })

  it('the room grows when sessions are added, without moving existing stations', () => {
    const v1 = view()
    const p1 = layout(v1)
    const v2 = view()
    v2.rooms[0]!.tables.push(table('d1/b.jsonl'))
    const p2 = layout(v2)
    // append-only: session a's station is exactly where it was
    const a1 = p1.rooms[0]!.stations.find(s => s.tableKey === 'd1/a.jsonl')!
    const a2 = p2.rooms[0]!.stations.find(s => s.tableKey === 'd1/a.jsonl')!
    expect([a2.tx, a2.ty]).toEqual([a1.tx, a1.ty])
    // and the room grew in area to make space
    const area = (r: { tw: number; th: number }) => r.tw * r.th
    expect(area(p2.rooms[0]!)).toBeGreaterThan(area(p1.rooms[0]!))
  })

  it('puts the working main in front of the object and subs clustered around it', () => {
    const plan = layout(view())
    const st = plan.rooms[0]!.stations[0]!
    const main = plan.seats.find(s => s.kind === 'main')!
    expect([main.tx, main.ty]).toEqual([st.workTx, st.workTy + 2])
    expect(main.pose).toBe(poseFor('typing'))
    expect(main.theme).toBe(st.theme)
    const subs = plan.seats.filter(s => s.kind === 'sub')
    expect(subs).toHaveLength(2)
    const cluster = [[-1, 1], [2, 1], [-1, 3], [2, 3]].map(([dx, dy]) => `${st.workTx + dx!},${st.workTy + dy!}`)
    for (const s of subs) {
      expect(cluster).toContain(`${s.tx},${s.ty}`)
      expect(s.agentKey).toBe('d1/a.jsonl#' + s.agentKey.split('#')[1])  // '#' separator preserved
    }
  })

  it('routes loafing agents from EVERY session into the one shared lounge', () => {
    const v = view()
    v.rooms[0]!.tables[0]!.status = 'waiting'
    v.rooms[0]!.tables[0]!.subagents = [{ id: 'x', status: 'working' }, { id: 'y', status: 'idle' }]
    v.rooms[0]!.tables.push(table('d1/b.jsonl', { status: 'waiting' }))
    const plan = layout(v)
    const room = plan.rooms[0]!
    const inLounge = (s: { tx: number; ty: number }) =>
      s.tx >= room.lounge.tx && s.tx < room.lounge.tx + room.lounge.tw &&
      s.ty >= room.lounge.ty && s.ty < room.lounge.ty + room.lounge.th
    const loafers = plan.seats.filter(s => s.pose === 'loaf')
    expect(loafers).toHaveLength(3) // both waiting mains + the idle sub, together
    for (const l of loafers) expect(inLounge(l)).toBe(true)
    // all on distinct loaf spots
    expect(new Set(loafers.map(l => `${l.tx},${l.ty}`)).size).toBe(3)
    const worker = plan.seats.find(s => s.agentKey === 'd1/a.jsonl#x')!
    expect(inLounge(worker)).toBe(false)
  })

  it('caps visible subagents at 4 and reports overflow on the station', () => {
    const v = view()
    v.rooms[0]!.tables[0]!.subagents = Array.from({ length: 6 }, (_, i) => ({ id: 'i' + i, status: 'working' as const }))
    const plan = layout(v)
    expect(plan.seats.filter(s => s.kind === 'sub')).toHaveLength(4)
    expect(plan.rooms[0]!.stations[0]!.overflow).toBe(2)
  })

  it('lays folders out side by side with a gap', () => {
    const v = view()
    v.rooms.push({ dirKey: 'd2', label: 'api', tables: [table('d2/c.jsonl', { status: 'running' })] })
    const plan = layout(v)
    const [r1, r2] = [plan.rooms[0]!, plan.rooms[1]!]
    expect(r2.tx).toBe(r1.tx + r1.tw + 2)
    expect(plan.tw).toBe(r1.tw + 2 + r2.tw)
    expect(plan.th).toBe(Math.max(r1.th, r2.th))
  })

  it('keeps stations apart in big folders (4 sessions, no overlaps)', () => {
    const v = view()
    for (const k of ['b', 'c', 'd']) v.rooms[0]!.tables.push(table(`d1/${k}.jsonl`))
    const plan = layout(v)
    const room = plan.rooms[0]!
    expect(room.stations).toHaveLength(4)
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        expect(rectsOverlap(room.stations[i]!, room.stations[j]!)).toBe(false)
      }
      expect(rectsOverlap(room.stations[i]!, room.lounge)).toBe(false)
    }
  })

  it('is deterministic', () => {
    expect(layout(view())).toEqual(layout(view()))
  })
})
