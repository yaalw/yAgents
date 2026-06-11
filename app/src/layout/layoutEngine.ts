import type { AgentStatus, OfficeView } from '../types'
import type { Theme } from '../render/atlas'
import { themeFor, poseFor, loafs, type Pose } from '../render/theme'

export const TILE = 16

// A work zone is one session: a themed stage with the work object up top,
// the main agent in front of it, subagents clustered around it, and a small
// lounge nook (bottom-left) where idle/waiting agents loaf.
export const ZONE_W = 13
export const ZONE_H = 9
const ROOM_GAP = 1

// offsets from a zone's top-left corner (row 0 is the back wall)
const WORK_ANCHOR = { tx: 5, ty: 2 }
const MAIN_SPOT = { tx: 5, ty: 4 }
// helpers huddle snugly around the shared work object (cols 5-6, rows 2-3)
// and the main agent at (5,4) — same rock, same desk, same plot
const SUB_SPOTS: [number, number][] = [[4, 3], [7, 3], [4, 5], [7, 5]]
const LOUNGE = { tx: 1, ty: 6, tw: 4, th: 3 }
const LOAF_SPOTS: [number, number][] = [[1, 7], [2, 7], [3, 7], [2, 8]]

export interface Spot { tx: number; ty: number }

export interface ZoneBox {
  theme: Theme
  tx: number; ty: number; tw: number; th: number       // absolute zone rect, tiles
  workTx: number; workTy: number                        // work-object anchor (top-left)
  lounge: { tx: number; ty: number; tw: number; th: number }  // loaf nook rect
  overflow: number                                      // subagents beyond 4
  tableKey: string
}

export interface RoomBox { tx: number; ty: number; tw: number; th: number; label: string; dirKey: string; zones: ZoneBox[] }

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
    const zones: ZoneBox[] = []
    room.tables.forEach((table, i) => {
      const ztx = cursor
      const zty = i * ZONE_H
      const theme = themeFor(table.key, room.dirKey)
      const overflow = Math.max(0, table.subagents.length - SUB_SPOTS.length)
      const zone: ZoneBox = {
        theme,
        tx: ztx, ty: zty, tw: ZONE_W, th: ZONE_H,
        workTx: ztx + WORK_ANCHOR.tx, workTy: zty + WORK_ANCHOR.ty,
        lounge: { tx: ztx + LOUNGE.tx, ty: zty + LOUNGE.ty, tw: LOUNGE.tw, th: LOUNGE.th },
        overflow,
        tableKey: table.key,
      }
      zones.push(zone)

      let loafIdx = 0
      let subIdx = 0
      const place = (agentKey: string, kind: SeatKind, status: AgentStatus): void => {
        const pose = poseFor(status)
        let tx: number, ty: number
        let face: { faceTx: number; faceTy: number } | undefined
        if (loafs(status)) {
          const [lx, ly] = LOAF_SPOTS[loafIdx++ % LOAF_SPOTS.length]!
          tx = ztx + lx; ty = zty + ly
        } else if (kind === 'main') {
          tx = ztx + MAIN_SPOT.tx; ty = zty + MAIN_SPOT.ty
          face = { faceTx: ztx + WORK_ANCHOR.tx + 1, faceTy: zty + WORK_ANCHOR.ty + 1 }
        } else {
          const [sx, sy] = SUB_SPOTS[subIdx++ % SUB_SPOTS.length]!
          tx = ztx + sx; ty = zty + sy
          face = { faceTx: ztx + WORK_ANCHOR.tx + 1, faceTy: zty + WORK_ANCHOR.ty + 1 }
        }
        seats.push({ agentKey, kind, status, pose, theme, tx, ty, tableKey: table.key, ...face })
      }

      place(table.key, 'main', table.status)
      // NOTE: '#' separator is load-bearing — the detail panel splits agentKey on it
      table.subagents.slice(0, SUB_SPOTS.length).forEach(sub => place(table.key + '#' + sub.id, 'sub', sub.status))
    })

    const th = Math.max(1, zones.length) * ZONE_H
    maxH = Math.max(maxH, th)
    rooms.push({ tx: cursor, ty: 0, tw: ZONE_W, th, label: room.label, dirKey: room.dirKey, zones })
    cursor += ZONE_W + ROOM_GAP
  }

  return { rooms, seats, tw: Math.max(0, cursor - ROOM_GAP), th: maxH }
}
