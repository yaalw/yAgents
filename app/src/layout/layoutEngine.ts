import type { AgentStatus, OfficeView } from '../types'
import type { Theme } from '../render/atlas'
import { themeFor, poseFor, loafs, type Pose } from '../render/theme'
import { hashString, det } from '../util/rng'
import { normDist, packCell, COAST_MAX } from './terrain'

export const TILE = 16

// ONE cohesive pannable world: each folder is an organic ISLAND (a seeded
// noise blob, see terrain.ts) placed on a golden-angle spiral around the
// world origin, with dark sea between islands and stepping-stone causeways
// connecting each new island to its nearest older neighbor.
//
// Stability invariants (tests pin all of these):
//  • anchors: region i's anchor depends only on regions 0..i-1 — adding a
//    folder never moves existing islands.
//  • shape: a blob is monotonic in its radius — adding sessions only ADDS
//    coastline cells, the interior never reshuffles.
//  • stations: session i's station is placed on the blob the island had when
//    that session arrived (radius R(i+1)) considering only stations 0..i-1 —
//    a new session never moves existing stations.
// All of it is a pure function of the view (no Math.random, no hidden state),
// so a given set of folders/sessions always yields the exact same world.

// ── island sizing ───────────────────────────────────────────────────────────
const R_BASE = 7
const R_GROW = 2.4
const R_CAP = 13
/** Island radius for a folder with `sessions` live sessions (monotonic, capped). */
export function regionRadius(sessions: number): number {
  return Math.min(R_CAP, R_BASE + R_GROW * Math.sqrt(Math.max(1, sessions)))
}

// ── spiral placement ────────────────────────────────────────────────────────
const GOLDEN = 2.399963229728653 // golden angle in radians
const SPIRAL_C = 11              // sunflower spacing (candidate density)
const SQUASH = 0.82              // slight vertical squash → wide-screen worlds
const ANCHOR_DIST = 32           // ≥ 2·R_CAP·COAST_MAX + sea gap

// ── station / lounge / landmark footprints ─────────────────────────────────
export const STATION_W = 7
export const STATION_H = 6
const WORK = { tx: 3, ty: 1 }                  // work-object anchor inside the station
const MAIN_DY = 2                               // main stands 2 below the anchor
const SUB_OFFSETS: [number, number][] = [[-1, 1], [2, 1], [-1, 3], [2, 3]]
const LOUNGE_W = 5
const LOUNGE_H = 3
const LOAF_SPOTS: [number, number][] = [[1, 1], [2, 1], [3, 1], [0, 1], [2, 2], [4, 1]]
// the theme landmark (tent / cave mouth / shade tree) sits just north of the
// anchor — within the smallest possible blob, so it always lands on grass
const LANDMARK = { dx: -2, dy: -5, tw: 4, th: 4 }

export interface Spot { tx: number; ty: number }
interface Rect { tx: number; ty: number; tw: number; th: number }

/** One session's place on the island: work object + main + sub cluster. */
export interface Station {
  theme: Theme
  tx: number; ty: number; tw: number; th: number  // absolute station rect, tiles
  workTx: number; workTy: number                  // work-object anchor (top-left)
  overflow: number                                // subagents beyond the 4 spots
  tableKey: string
}

/** One folder = one organic island. */
export interface Region {
  dirKey: string
  label: string
  theme: Theme
  anchorTx: number; anchorTy: number
  radius: number
  seed: number                                    // coastline seed (hash of dirKey)
  cells: Set<number>                              // packed world cells (terrain.packCell)
  tx: number; ty: number; tw: number; th: number  // cell bounding box
  stations: Station[]
  lounge: Rect                                    // ONE shared lounge per island
  landmark: Rect                                  // theme structure (tent/cave/tree)
  gateway: Spot                                   // coast cell facing the world; signpost + arrivals
}

/** A stepping-stone causeway across the sea between two islands. */
export interface PathSeg { from: string; to: string; cells: Spot[] }

export type SeatKind = 'main' | 'sub'

export interface Seat {
  agentKey: string
  kind: SeatKind
  status: AgentStatus
  pose: Pose
  theme: Theme
  tx: number
  ty: number
  tableKey: string
  /** tile to face once seated (the work object's center); absent → face the camera */
  faceTx?: number
  faceTy?: number
  /** where this character enters/leaves the world (the island's gateway) */
  enterTx?: number
  enterTy?: number
}

export interface WorldPlan {
  regions: Region[]
  paths: PathSeg[]
  seats: Seat[]
  tx: number; ty: number; tw: number; th: number  // world bounds, tiles
}

// ── internals ───────────────────────────────────────────────────────────────

/** First golden-spiral point ≥ ANCHOR_DIST from every existing anchor.
 *  Depends only on the anchors placed BEFORE it — append-stable. */
function placeAnchor(prev: Spot[]): Spot {
  for (let k = 0; k < 8000; k++) {
    const r = SPIRAL_C * Math.sqrt(k)
    const th = k * GOLDEN
    const tx = Math.round(r * Math.cos(th))
    const ty = Math.round(r * Math.sin(th) * SQUASH)
    if (prev.every(p => Math.hypot(p.tx - tx, p.ty - ty) >= ANCHOR_DIST)) return { tx, ty }
  }
  return { tx: prev.length * ANCHOR_DIST, ty: 0 } // unreachable safety net
}

const rectsOverlap = (a: Rect, b: Rect, margin: number): boolean =>
  a.tx < b.tx + b.tw + margin && b.tx < a.tx + a.tw + margin &&
  a.ty < b.ty + b.th + margin && b.ty < a.ty + a.th + margin

/** Precomputed radial field of one island: normDist per cell of the max bbox.
 *  Turns every membership test into an array lookup. */
class RadialField {
  readonly ext: number
  private readonly d: Float32Array
  constructor(readonly ax: number, readonly ay: number, seed: number) {
    this.ext = Math.ceil(R_CAP * COAST_MAX) + 1
    const w = this.ext * 2 + 1
    this.d = new Float32Array(w * w)
    for (let dy = -this.ext; dy <= this.ext; dy++) {
      for (let dx = -this.ext; dx <= this.ext; dx++) {
        this.d[(dy + this.ext) * w + (dx + this.ext)] = normDist(dx, dy, seed)
      }
    }
  }
  /** normDist of WORLD cell (tx,ty); Infinity outside the field. */
  at(tx: number, ty: number): number {
    const dx = tx - this.ax + this.ext, dy = ty - this.ay + this.ext
    const w = this.ext * 2 + 1
    if (dx < 0 || dy < 0 || dx >= w || dy >= w) return Infinity
    return this.d[dy * w + dx]!
  }
  /** every tile of the rect inside the blob of radius r, eroded by `margin`? */
  rectInside(r: Rect, radius: number, margin: number): boolean {
    for (let j = 0; j < r.th; j++) {
      for (let i = 0; i < r.tw; i++) {
        if (this.at(r.tx + i, r.ty + j) >= radius - margin) return false
      }
    }
    return true
  }
}

/** Greedy deterministic placement of one w×h rect on the blob of radius `radius`,
 *  avoiding `blocked` rects (+1 tile margin) and scoring candidates via `score`
 *  (higher wins; det(cx,cy,seed) breaks ties). Returns null if nothing fits. */
function placeRect(
  field: RadialField, radius: number, w: number, h: number,
  blocked: Rect[], margin: number, seed: number,
  score: (cx: number, cy: number) => number,
): Rect | null {
  let best: Rect | null = null
  let bestScore = -Infinity
  let bestTie = Infinity
  const ext = field.ext
  for (let cy = field.ay - ext; cy <= field.ay + ext - h; cy++) {
    for (let cx = field.ax - ext; cx <= field.ax + ext - w; cx++) {
      const r: Rect = { tx: cx, ty: cy, tw: w, th: h }
      if (!field.rectInside(r, radius, margin)) continue
      // station rects already carry internal breathing room — touching is fine
      if (blocked.some(b => rectsOverlap(r, b, 0))) continue
      const sc = score(cx, cy)
      const tie = det(cx, cy, seed)
      if (sc > bestScore + 1e-9 || (Math.abs(sc - bestScore) <= 1e-9 && tie < bestTie)) {
        best = r; bestScore = sc; bestTie = tie
      }
    }
  }
  return best
}

/** Coast cell (≥1 sea 4-neighbor) of `cells` nearest to (tx,ty); ties → smaller pack. */
function coastCellNearest(cells: Set<number>, tx: number, ty: number): Spot {
  let best: Spot = { tx, ty }
  let bestD = Infinity
  let bestP = Infinity
  for (const p of cells) {
    const cx = (p % 4096) - 2048, cy = Math.floor(p / 4096) - 2048
    if (cells.has(packCell(cx, cy - 1)) && cells.has(packCell(cx, cy + 1)) &&
        cells.has(packCell(cx - 1, cy)) && cells.has(packCell(cx + 1, cy))) continue
    const d = Math.hypot(cx - tx, cy - ty)
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && p < bestP)) {
      best = { tx: cx, ty: cy }; bestD = d; bestP = p
    }
  }
  return best
}

/** Wobbled Bresenham between two coast cells; cells inside either island are
 *  dropped (stones live on the sea). Wobble is smooth value noise off det. */
function pathBetween(a: Spot, b: Spot, skip: (tx: number, ty: number) => boolean, seed: number): Spot[] {
  const cells: Spot[] = []
  const dx = b.tx - a.tx, dy = b.ty - a.ty
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  if (steps === 0) return cells
  const horiz = Math.abs(dx) >= Math.abs(dy)
  let last = ''
  for (let s = 0; s <= steps; s++) {
    const u = s / steps
    // smooth ±1 wobble on the minor axis, eased to 0 at both ends
    const li = Math.floor(s / 3), lf = (s / 3) - li
    const n0 = det(li, 7, seed), n1 = det(li + 1, 7, seed)
    const noise = n0 + (n1 - n0) * (lf * lf * (3 - 2 * lf))
    const wob = Math.round((noise - 0.5) * 2.4 * Math.sin(Math.PI * u))
    let tx = Math.round(a.tx + dx * u)
    let ty = Math.round(a.ty + dy * u)
    if (horiz) ty += wob
    else tx += wob
    const key = tx + ',' + ty
    if (key === last || skip(tx, ty)) continue
    last = key
    cells.push({ tx, ty })
  }
  return cells
}

// ── the layout ──────────────────────────────────────────────────────────────

export function layout(view: OfficeView): WorldPlan {
  const regions: Region[] = []
  const paths: PathSeg[] = []
  const seats: Seat[] = []
  const anchors: Spot[] = []

  for (const room of view.rooms) {
    const theme = themeFor(room.tables[0]?.key ?? room.dirKey, room.dirKey)
    const seed = hashString(room.dirKey)
    const anchor = placeAnchor(anchors)
    anchors.push(anchor)
    const field = new RadialField(anchor.tx, anchor.ty, seed)

    const landmark: Rect = {
      tx: anchor.tx + LANDMARK.dx, ty: anchor.ty + LANDMARK.dy,
      tw: LANDMARK.tw, th: LANDMARK.th,
    }

    // the lounge is placed once, on the 1-session blob, at the south coast —
    // it never moves as the island grows
    const r1 = regionRadius(1)
    const lounge = placeRect(field, r1, LOUNGE_W, LOUNGE_H, [landmark], 0.6, seed + 5,
      (cx, cy) => cy * 100 - Math.abs(cx + LOUNGE_W / 2 - anchor.tx)) ??
      { tx: anchor.tx - 2, ty: anchor.ty + 3, tw: LOUNGE_W, th: LOUNGE_H }

    // stations: session i lands on the blob the island had at its arrival
    // (radius R(i+1)), avoiding everything placed before it — append-only
    const stations: Station[] = []
    const placed: Rect[] = [landmark, lounge]
    let radius = regionRadius(Math.max(1, room.tables.length))
    room.tables.forEach((table, i) => {
      const target = regionRadius(i + 1)
      let rect: Rect | null = null
      for (let r = target; r <= R_CAP + 0.7 && !rect; r += 0.7) {
        rect = placeRect(field, Math.min(r, R_CAP), STATION_W, STATION_H, placed, 0.5, seed + 11 + i,
          i === 0
            // the first station sits near the island's heart (just south of the landmark)
            ? (cx, cy) => -Math.hypot(cx + STATION_W / 2 - anchor.tx, cy + STATION_H / 2 - (anchor.ty + 1))
            // later stations spread out: maximize the min distance to everything placed
            : (cx, cy) => Math.min(...placed.map(b =>
                Math.hypot(cx + STATION_W / 2 - (b.tx + b.tw / 2), cy + STATION_H / 2 - (b.ty + b.th / 2)))))
        if (rect) radius = Math.max(radius, Math.min(r, R_CAP))
      }
      // crowded-island fallback: stack near the anchor (overlap accepted)
      rect ??= { tx: anchor.tx - WORK.tx + ((i % 3) - 1) * 2, ty: anchor.ty - WORK.ty + (i % 2) * 2, tw: STATION_W, th: STATION_H }
      placed.push(rect)
      stations.push({
        theme,
        tx: rect.tx, ty: rect.ty, tw: STATION_W, th: STATION_H,
        workTx: rect.tx + WORK.tx, workTy: rect.ty + WORK.ty,
        overflow: Math.max(0, table.subagents.length - SUB_OFFSETS.length),
        tableKey: table.key,
      })
    })

    // the island's cells at its final radius + bounding box
    const cells = new Set<number>()
    let minX = anchor.tx, maxX = anchor.tx, minY = anchor.ty, maxY = anchor.ty
    const ext = field.ext
    for (let dy = -ext; dy <= ext; dy++) {
      for (let dx = -ext; dx <= ext; dx++) {
        if (field.at(anchor.tx + dx, anchor.ty + dy) < radius) {
          const tx = anchor.tx + dx, ty = anchor.ty + dy
          cells.add(packCell(tx, ty))
          if (tx < minX) minX = tx; if (tx > maxX) maxX = tx
          if (ty < minY) minY = ty; if (ty > maxY) maxY = ty
        }
      }
    }

    // gateway: the coast cell facing the rest of the world (or south if alone)
    const others = regions.map(r => ({ tx: r.anchorTx, ty: r.anchorTy }))
    const facing = others.length > 0
      ? others.reduce((m, p) => Math.hypot(p.tx - anchor.tx, p.ty - anchor.ty) < Math.hypot(m.tx - anchor.tx, m.ty - anchor.ty) ? p : m)
      : { tx: anchor.tx, ty: anchor.ty + 100 }
    const gateway = coastCellNearest(cells, facing.tx, facing.ty)

    regions.push({
      dirKey: room.dirKey, label: room.label, theme,
      anchorTx: anchor.tx, anchorTy: anchor.ty, radius, seed, cells,
      tx: minX, ty: minY, tw: maxX - minX + 1, th: maxY - minY + 1,
      stations, lounge, landmark, gateway,
    })

    // ── seats: mains + subs at their station, loafers in the shared lounge ──
    let loafIdx = 0
    stations.forEach((st, i) => {
      const table = room.tables[i]!
      let subIdx = 0
      const place = (agentKey: string, kind: SeatKind, status: AgentStatus): void => {
        const pose = poseFor(status)
        let tx: number, ty: number
        let face: { faceTx: number; faceTy: number } | undefined
        if (loafs(status)) {
          const [lx, ly] = LOAF_SPOTS[loafIdx++ % LOAF_SPOTS.length]!
          tx = lounge.tx + lx; ty = lounge.ty + ly
        } else if (kind === 'main') {
          tx = st.workTx; ty = st.workTy + MAIN_DY
          face = { faceTx: st.workTx + 1, faceTy: st.workTy + 1 }
        } else {
          const [dx, dy] = SUB_OFFSETS[subIdx++ % SUB_OFFSETS.length]!
          tx = st.workTx + dx; ty = st.workTy + dy
          face = { faceTx: st.workTx + 1, faceTy: st.workTy + 1 }
        }
        seats.push({
          agentKey, kind, status, pose, theme, tx, ty, tableKey: st.tableKey,
          enterTx: gateway.tx, enterTy: gateway.ty, ...face,
        })
      }

      place(st.tableKey, 'main', table.status)
      // NOTE: '#' separator is load-bearing — the detail panel splits agentKey on it
      table.subagents.slice(0, SUB_OFFSETS.length).forEach(sub => place(st.tableKey + '#' + sub.id, 'sub', sub.status))
    })
  }

  // ── causeways: each island links to its nearest OLDER island ──────────────
  for (let i = 1; i < regions.length; i++) {
    const r = regions[i]!
    let j = 0, bd = Infinity
    for (let k = 0; k < i; k++) {
      const d = Math.hypot(regions[k]!.anchorTx - r.anchorTx, regions[k]!.anchorTy - r.anchorTy)
      if (d < bd) { bd = d; j = k }
    }
    const o = regions[j]!
    const a = coastCellNearest(r.cells, o.anchorTx, o.anchorTy)
    const b = coastCellNearest(o.cells, r.anchorTx, r.anchorTy)
    const skip = (tx: number, ty: number) => r.cells.has(packCell(tx, ty)) || o.cells.has(packCell(tx, ty))
    const cells = pathBetween(a, b, skip, r.seed)
    if (cells.length > 0) paths.push({ from: r.dirKey, to: o.dirKey, cells })
  }

  // ── world bounds (islands + causeways + margin) ────────────────────────────
  if (regions.length === 0) return { regions, paths, seats, tx: 0, ty: 0, tw: 0, th: 0 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const r of regions) {
    minX = Math.min(minX, r.tx); maxX = Math.max(maxX, r.tx + r.tw - 1)
    minY = Math.min(minY, r.ty); maxY = Math.max(maxY, r.ty + r.th - 1)
  }
  for (const p of paths) {
    for (const c of p.cells) {
      minX = Math.min(minX, c.tx); maxX = Math.max(maxX, c.tx)
      minY = Math.min(minY, c.ty); maxY = Math.max(maxY, c.ty)
    }
  }
  const M = 2
  return {
    regions, paths, seats,
    tx: minX - M, ty: minY - M,
    tw: maxX - minX + 1 + 2 * M, th: maxY - minY + 1 + 2 * M,
  }
}
