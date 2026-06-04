import type { AgentStatus, OfficeView, TableView } from '../types'

export const TILE = 16
export const KITCHEN_W = 10
export const ROOM_W = 12
const TABLE_W = 4, TABLE_H = 2, TABLE_X = 4, FIRST_TABLE_Y = 3, TABLE_PITCH = 6
const KITCHEN_SPOTS: [number, number][] = [[2, 4], [4, 6], [6, 4], [3, 8]]

export interface Seat {
  agentKey: string
  kind: 'main' | 'sub'
  status: AgentStatus
  tx: number
  ty: number
  tableKey: string
}
export interface TableBox { tx: number; ty: number; tw: number; th: number; table: TableView; overflow: number }
export interface RoomBox { tx: number; ty: number; tw: number; th: number; label: string; dirKey: string; tables: TableBox[] }
export interface FloorPlan { kitchen: { tx: number; ty: number; tw: number; th: number }; rooms: RoomBox[]; seats: Seat[]; tw: number; th: number }

export function layout(view: OfficeView): FloorPlan {
  const seats: Seat[] = []
  const rooms: RoomBox[] = []
  let cursor = KITCHEN_W
  let kitchenSpot = 0
  let maxH = 12

  for (const room of view.rooms) {
    const n = room.tables.length
    const h = Math.max(12, FIRST_TABLE_Y + n * TABLE_PITCH + 1)
    maxH = Math.max(maxH, h)
    const tables: TableBox[] = []
    room.tables.forEach((table, i) => {
      const tx = cursor + TABLE_X
      const ty = FIRST_TABLE_Y + i * TABLE_PITCH + 1
      const overflow = Math.max(0, table.subagents.length - 4)
      tables.push({ tx, ty, tw: TABLE_W, th: TABLE_H, table, overflow })

      if (table.status === 'waiting') {
        const [kx, ky] = KITCHEN_SPOTS[kitchenSpot % KITCHEN_SPOTS.length]!
        kitchenSpot++
        seats.push({ agentKey: table.key, kind: 'main', status: 'waiting', tx: kx, ty: ky, tableKey: table.key })
      } else {
        seats.push({ agentKey: table.key, kind: 'main', status: table.status, tx: tx + 1, ty: ty - 1, tableKey: table.key })
      }
      table.subagents.slice(0, 4).forEach((sub, j) => {
        seats.push({ agentKey: table.key + '#' + sub.id, kind: 'sub', status: sub.status, tx: tx + j, ty: ty + TABLE_H, tableKey: table.key })
      })
    })
    rooms.push({ tx: cursor, ty: 0, tw: ROOM_W, th: h, label: room.label, dirKey: room.dirKey, tables })
    cursor += ROOM_W
  }

  return { kitchen: { tx: 0, ty: 0, tw: KITCHEN_W, th: 12 }, rooms, seats, tw: Math.max(cursor, KITCHEN_W), th: maxH }
}
