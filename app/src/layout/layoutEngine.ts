import type { AgentStatus, OfficeView } from '../types'
import type { Theme } from '../render/atlas'
import { themeFor, poseFor, loafs, type Pose } from '../render/theme'
import { hashString } from '../util/rng'

export const TILE = 16

// A folder is ONE continuous room: a single themed floor that grows with the
// number of sessions. Each session gets a STATION (the work object with the
// crowned main in front of it and subagents clustered around), placed on a
// loose 2-column grid with a per-station seeded jitter/stagger so the room
// reads organic rather than stacked. Idle/waiting agents from ANY session in
// the folder loaf together in the room's single shared lounge.
//
// Stability: a session's station slot is its arrival index in the room (the
// store appends sessions in arrival order), and its jitter hashes off the
// session key — so adding a session appends a new station without moving the
// existing ones, and the same folder + session set always lays out the same.

// station footprint (local tile coords inside the station rect)
export const STATION_W = 8
export const STATION_H = 6
const WORK = { tx: 3, ty: 1 }                 // work-object anchor (2×2 object)
const MAIN_DY = 2                              // main stands 2 below the anchor
// helpers huddle snugly around the shared work object, offsets from the anchor
const SUB_OFFSETS: [number, number][] = [[-1, 1], [2, 1], [-1, 3], [2, 3]]

// loose grid the stations land on (pitch > footprint + max jitter ⇒ no overlap)
const PITCH_X = 10
const PITCH_Y = 8
const COL_STAGGER = 2                          // 2nd column sits a bit lower

// the one shared lounge per room, parked under the stations at bottom-left
const LOUNGE_W = 5
const LOUNGE_H = 3
const LOAF_SPOTS: [number, number][] = [[1, 1], [2, 1], [3, 1], [0, 1], [2, 2], [4, 1]]

const ROOM_GAP = 2

export interface Spot { tx: number; ty: number }

/** One session's place in the room: work object + main + sub cluster. */
export interface Station {
  theme: Theme
  tx: number; ty: number; tw: number; th: number  // absolute station rect, tiles
  workTx: number; workTy: number                  // work-object anchor (top-left)
  overflow: number                                // subagents beyond the 4 spots
  tableKey: string
}

export interface RoomBox {
  tx: number; ty: number; tw: number; th: number
  label: string
  dirKey: string
  theme: Theme
  stations: Station[]
  lounge: { tx: number; ty: number; tw: number; th: number }  // ONE per room
}

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
}

export interface FloorPlan { rooms: RoomBox[]; seats: Seat[]; tw: number; th: number }

export function layout(view: OfficeView): FloorPlan {
  const rooms: RoomBox[] = []
  const seats: Seat[] = []
  let cursor = 0
  let maxH = 0

  for (const room of view.rooms) {
    const theme = themeFor(room.tables[0]?.key ?? room.dirKey, room.dirKey)
    const cols = Math.min(2, Math.max(1, room.tables.length))

    // place every station first (append-only slots), then size the room around them
    const stations: Station[] = []
    const gridTop = 2 // one breathing row between the back-wall decor and the first stations
    let stationsBottom = gridTop + STATION_H // room never collapses below one station row
    room.tables.forEach((table, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const h = hashString(table.key)
      const jx = h % 2                            // 0..1 tile of organic wobble
      const jy = (h >> 2) % 2
      const sx = cursor + 1 + col * PITCH_X + jx
      const sy = gridTop + row * PITCH_Y + (col === 1 ? COL_STAGGER : 0) + jy
      stationsBottom = Math.max(stationsBottom, sy + STATION_H)
      stations.push({
        theme,
        tx: sx, ty: sy, tw: STATION_W, th: STATION_H,
        workTx: sx + WORK.tx, workTy: sy + WORK.ty,
        overflow: Math.max(0, table.subagents.length - SUB_OFFSETS.length),
        tableKey: table.key,
      })
    })

    const lounge = { tx: cursor + 1, ty: stationsBottom, tw: LOUNGE_W, th: LOUNGE_H }
    const tw = cols * PITCH_X + 2
    const th = stationsBottom + LOUNGE_H + 1

    // seats: mains + subs at their station, loafers in the SHARED room lounge
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
        seats.push({ agentKey, kind, status, pose, theme, tx, ty, tableKey: st.tableKey, ...face })
      }

      place(st.tableKey, 'main', table.status)
      // NOTE: '#' separator is load-bearing — the detail panel splits agentKey on it
      table.subagents.slice(0, SUB_OFFSETS.length).forEach(sub => place(st.tableKey + '#' + sub.id, 'sub', sub.status))
    })

    maxH = Math.max(maxH, th)
    rooms.push({ tx: cursor, ty: 0, tw, th, label: room.label, dirKey: room.dirKey, theme, stations, lounge })
    cursor += tw + ROOM_GAP
  }

  return { rooms, seats, tw: Math.max(0, cursor - ROOM_GAP), th: maxH }
}
