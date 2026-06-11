import { describe, it, expect } from 'vitest'
import { layout, STATION_W, STATION_H, regionRadius, type Region } from '../src/layout/layoutEngine'
import { packCell } from '../src/layout/terrain'
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

const rectOnLand = (r: { tx: number; ty: number; tw: number; th: number }, region: Region) => {
  for (let j = 0; j < r.th; j++) {
    for (let i = 0; i < r.tw; i++) {
      if (!region.cells.has(packCell(r.tx + i, r.ty + j))) return false
    }
  }
  return true
}

describe('layout (organic world)', () => {
  it('emits ONE island region per folder with one station per session on it', () => {
    const plan = layout(view())
    expect(plan.regions).toHaveLength(1)
    const region = plan.regions[0]!
    expect(region.label).toBe('webshop')
    expect(region.theme).toBe(themeFor('d1/a.jsonl', 'd1'))
    expect(region.stations).toHaveLength(1)
    const st = region.stations[0]!
    expect([st.tw, st.th]).toEqual([STATION_W, STATION_H])
    expect(st.tableKey).toBe('d1/a.jsonl')
    expect(st.theme).toBe(region.theme)
    // the station rect sits entirely on the island's land cells
    expect(rectOnLand(st, region)).toBe(true)
    // work anchor inside the station rect
    expect(st.workTx).toBe(st.tx + 3)
    expect(st.workTy).toBe(st.ty + 1)
    // first folder anchors the world origin
    expect([region.anchorTx, region.anchorTy]).toEqual([0, 0])
  })

  it('the region is an organic blob, not a rectangle', () => {
    const region = layout(view()).regions[0]!
    // a rectangle would fill its bounding box; the blob must not
    expect(region.cells.size).toBeLessThan(region.tw * region.th)
    // ...but it should still fill a good chunk of it (it's a blob, not a sliver)
    expect(region.cells.size).toBeGreaterThan(region.tw * region.th * 0.5)
  })

  it('a multi-session folder is one island with ONE shared lounge, all on land', () => {
    const v = view()
    v.rooms[0]!.tables.push(table('d1/b.jsonl'))
    const plan = layout(v)
    expect(plan.regions).toHaveLength(1)
    const region = plan.regions[0]!
    expect(region.stations).toHaveLength(2)
    const [s1, s2] = [region.stations[0]!, region.stations[1]!]
    expect(rectsOverlap(s1, s2)).toBe(false)
    expect(rectsOverlap(s1, region.lounge)).toBe(false)
    expect(rectsOverlap(s2, region.lounge)).toBe(false)
    expect(rectOnLand(s1, region)).toBe(true)
    expect(rectOnLand(s2, region)).toBe(true)
    expect(rectOnLand(region.lounge, region)).toBe(true)
    expect(rectOnLand(region.landmark, region)).toBe(true)
  })

  it('adding a session GROWS the island without moving anything that exists', () => {
    const v1 = view()
    const p1 = layout(v1)
    const v2 = view()
    v2.rooms[0]!.tables.push(table('d1/b.jsonl'))
    const p2 = layout(v2)
    const r1 = p1.regions[0]!, r2 = p2.regions[0]!
    // anchor and existing station are exactly where they were
    expect([r2.anchorTx, r2.anchorTy]).toEqual([r1.anchorTx, r1.anchorTy])
    const a1 = r1.stations.find(s => s.tableKey === 'd1/a.jsonl')!
    const a2 = r2.stations.find(s => s.tableKey === 'd1/a.jsonl')!
    expect([a2.tx, a2.ty]).toEqual([a1.tx, a1.ty])
    // the lounge never moves either
    expect(r2.lounge).toEqual(r1.lounge)
    // the island grew monotonically: every old cell is still land
    expect(r2.radius).toBeGreaterThanOrEqual(r1.radius)
    for (const p of r1.cells) expect(r2.cells.has(p)).toBe(true)
  })

  it('adding a folder never moves existing islands (spiral placement is append-only)', () => {
    const v1 = view()
    v1.rooms.push({ dirKey: 'd2', label: 'api', tables: [table('d2/c.jsonl')] })
    const p1 = layout(v1)
    const v2 = view()
    v2.rooms.push({ dirKey: 'd2', label: 'api', tables: [table('d2/c.jsonl')] })
    v2.rooms.push({ dirKey: 'd3', label: 'infra', tables: [table('d3/d.jsonl')] })
    const p2 = layout(v2)
    for (let i = 0; i < 2; i++) {
      expect([p2.regions[i]!.anchorTx, p2.regions[i]!.anchorTy])
        .toEqual([p1.regions[i]!.anchorTx, p1.regions[i]!.anchorTy])
    }
  })

  it('islands never overlap and keep open sea between them', () => {
    const v = view()
    for (const [k, label] of [['d2', 'api'], ['d3', 'infra'], ['d4', 'docs'], ['d5', 'ml']] as const) {
      v.rooms.push({ dirKey: k, label, tables: [table(`${k}/s.jsonl`), table(`${k}/t.jsonl`)] })
    }
    const plan = layout(v)
    expect(plan.regions).toHaveLength(5)
    for (let i = 0; i < plan.regions.length; i++) {
      for (let j = i + 1; j < plan.regions.length; j++) {
        const a = plan.regions[i]!, b = plan.regions[j]!
        for (const p of a.cells) expect(b.cells.has(p)).toBe(false)
        // anchors keep real distance (sea, not just a 1px gap)
        expect(Math.hypot(a.anchorTx - b.anchorTx, a.anchorTy - b.anchorTy)).toBeGreaterThanOrEqual(30)
      }
    }
  })

  it('connects every new island to an older one with a causeway across the sea', () => {
    const v = view()
    v.rooms.push({ dirKey: 'd2', label: 'api', tables: [table('d2/c.jsonl')] })
    v.rooms.push({ dirKey: 'd3', label: 'infra', tables: [table('d3/d.jsonl')] })
    const plan = layout(v)
    expect(plan.paths).toHaveLength(2) // n islands → n-1 causeways
    for (const path of plan.paths) {
      expect(path.cells.length).toBeGreaterThan(0)
      // stones live on the open sea, never on land
      for (const c of path.cells) {
        for (const r of plan.regions) expect(r.cells.has(packCell(c.tx, c.ty))).toBe(false)
      }
    }
  })

  it('the gateway is a coast cell of its island', () => {
    const v = view()
    v.rooms.push({ dirKey: 'd2', label: 'api', tables: [table('d2/c.jsonl')] })
    const plan = layout(v)
    for (const r of plan.regions) {
      expect(r.cells.has(packCell(r.gateway.tx, r.gateway.ty))).toBe(true)
      const sea = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) =>
        !r.cells.has(packCell(r.gateway.tx + dx!, r.gateway.ty + dy!)))
      expect(sea).toBe(true)
    }
  })

  it('puts the working main in front of the object and subs clustered around it', () => {
    const plan = layout(view())
    const st = plan.regions[0]!.stations[0]!
    const main = plan.seats.find(s => s.kind === 'main')!
    expect([main.tx, main.ty]).toEqual([st.workTx, st.workTy + 2])
    expect(main.pose).toBe(poseFor('typing'))
    expect(main.theme).toBe(st.theme)
    // seats carry the island gateway as their enter/exit point
    expect([main.enterTx, main.enterTy]).toEqual([plan.regions[0]!.gateway.tx, plan.regions[0]!.gateway.ty])
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
    const region = plan.regions[0]!
    const inLounge = (s: { tx: number; ty: number }) =>
      s.tx >= region.lounge.tx && s.tx < region.lounge.tx + region.lounge.tw &&
      s.ty >= region.lounge.ty && s.ty < region.lounge.ty + region.lounge.th
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
    expect(plan.regions[0]!.stations[0]!.overflow).toBe(2)
  })

  it('keeps stations apart in big folders (4 sessions, no overlaps)', () => {
    const v = view()
    for (const k of ['b', 'c', 'd']) v.rooms[0]!.tables.push(table(`d1/${k}.jsonl`))
    const plan = layout(v)
    const region = plan.regions[0]!
    expect(region.stations).toHaveLength(4)
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        expect(rectsOverlap(region.stations[i]!, region.stations[j]!)).toBe(false)
      }
      expect(rectsOverlap(region.stations[i]!, region.lounge)).toBe(false)
    }
  })

  it('world bounds cover every island and causeway', () => {
    const v = view()
    v.rooms.push({ dirKey: 'd2', label: 'api', tables: [table('d2/c.jsonl')] })
    const plan = layout(v)
    for (const r of plan.regions) {
      expect(r.tx).toBeGreaterThanOrEqual(plan.tx)
      expect(r.ty).toBeGreaterThanOrEqual(plan.ty)
      expect(r.tx + r.tw).toBeLessThanOrEqual(plan.tx + plan.tw)
      expect(r.ty + r.th).toBeLessThanOrEqual(plan.ty + plan.th)
    }
    for (const p of plan.paths) {
      for (const c of p.cells) {
        expect(c.tx).toBeGreaterThanOrEqual(plan.tx)
        expect(c.ty).toBeGreaterThanOrEqual(plan.ty)
      }
    }
  })

  it('radius grows with session count, monotonically and capped', () => {
    expect(regionRadius(2)).toBeGreaterThan(regionRadius(1))
    expect(regionRadius(50)).toBe(regionRadius(60)) // capped
  })

  it('is deterministic: the same view always yields the exact same world', () => {
    const v = view()
    v.rooms.push({ dirKey: 'd2', label: 'api', tables: [table('d2/c.jsonl', { status: 'running' })] })
    expect(layout(v)).toEqual(layout(v))
  })

  it('an empty view yields an empty world', () => {
    const plan = layout({ rooms: [] })
    expect(plan.regions).toHaveLength(0)
    expect(plan.tw).toBe(0)
  })
})
