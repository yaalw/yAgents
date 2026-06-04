import type { FloorPlan } from '../layout/layoutEngine'
import { TILE } from '../layout/layoutEngine'
import { Camera } from './camera'
import { CharacterSet, Character } from './characters'
import type { AgentStatus } from '../types'

const STATUS_GLYPH: Record<AgentStatus, string> = {
  typing: '⌨️', reading: '📄', running: '💻', browsing: '🌐',
  thinking: '💭', waiting: '☕', delegating: '📣', working: '🔧', idle: '·',
}
const SHIRTS = ['#c0504e', '#4e79c0', '#4ec07a', '#c0a04e', '#9a4ec0', '#4ebdc0']

export class Renderer {
  readonly camera = new Camera()
  readonly characters = new CharacterSet()
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private last = 0

  constructor(private canvas: HTMLCanvasElement, private getPlan: () => FloorPlan) {
    this.ctx = canvas.getContext('2d')!
    const resize = () => {
      canvas.width = window.innerWidth * devicePixelRatio
      canvas.height = window.innerHeight * devicePixelRatio
    }
    resize()
    window.addEventListener('resize', resize)
  }

  start(): void {
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - this.last) / 1000)
      this.last = t
      const plan = this.getPlan()
      this.characters.sync(plan.seats)
      this.characters.update(dt)
      this.draw(plan, t)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void { cancelAnimationFrame(this.raf) }

  /** Hit test in screen px; returns the character key or null. */
  hitTest(sx: number, sy: number): string | null {
    // sx/sy are CSS px; the draw transform is scale(camera.scale * dpr) so CSS→world needs no dpr factor
    const w = this.camera.screenToWorld(sx, sy)
    for (const c of this.characters.all()) {
      const px = c.x * TILE, py = c.y * TILE
      if (w.x >= px - 2 && w.x <= px + TILE + 2 && w.y >= py - 6 && w.y <= py + TILE + 2) return c.key
    }
    return null
  }

  private draw(plan: FloorPlan, t: number): void {
    const { ctx, canvas, camera } = this
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#1d1830'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(camera.scale * devicePixelRatio, camera.scale * devicePixelRatio)
    ctx.translate(-camera.x, -camera.y)

    this.drawRoom(plan.kitchen.tx, plan.kitchen.ty, plan.kitchen.tw, plan.kitchen.th, '#4a3d54', '☕ kitchen')
    this.drawKitchenFurniture(plan.kitchen.tx, plan.kitchen.ty)
    for (const room of plan.rooms) {
      this.drawRoom(room.tx, room.ty, room.tw, room.th, '#3d3654', '📁 ' + room.label)
      for (const tb of room.tables) {
        this.drawTable(tb.tx, tb.ty, tb.tw, tb.th)
        if (tb.overflow > 0) {
          ctx.fillStyle = '#d4a017'
          ctx.font = '6px monospace'
          ctx.fillText('+' + tb.overflow, (tb.tx + tb.tw) * TILE - 8, (tb.ty + tb.th) * TILE - 2)
        }
      }
    }
    for (const c of this.characters.all()) this.drawCharacter(c, t)
    ctx.restore()
  }

  private drawRoom(tx: number, ty: number, tw: number, th: number, floor: string, label: string): void {
    const { ctx } = this
    const x = tx * TILE, y = ty * TILE, w = tw * TILE, h = th * TILE
    ctx.fillStyle = floor
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.03)' // checker pattern
    for (let i = 0; i < tw; i++) for (let j = 0; j < th; j++) {
      if ((i + j) % 2 === 0) ctx.fillRect(x + i * TILE, y + j * TILE, TILE, TILE)
    }
    ctx.strokeStyle = '#6b5b8a'
    ctx.lineWidth = 3
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3)
    // doorway gap on the left wall so agents "can" reach the kitchen
    ctx.fillStyle = floor
    ctx.fillRect(x - 2, y + h / 2 - TILE, 5, TILE * 2)
    ctx.fillStyle = '#b8a8d8'
    ctx.font = '7px monospace'
    ctx.fillText(label, x + 6, y + 10)
  }

  private drawTable(tx: number, ty: number, tw: number, th: number): void {
    const { ctx } = this
    const x = tx * TILE, y = ty * TILE
    ctx.fillStyle = '#5e4a30'
    ctx.fillRect(x + 2, y + 2, tw * TILE - 2, th * TILE - 2) // shadow
    ctx.fillStyle = '#8a6f4d'
    ctx.fillRect(x, y, tw * TILE - 2, th * TILE - 2)
  }

  private drawKitchenFurniture(tx: number, ty: number): void {
    const { ctx } = this
    // coffee machine
    ctx.fillStyle = '#222'
    ctx.fillRect((tx + 7) * TILE, (ty + 2) * TILE, TILE, TILE * 1.5)
    ctx.fillStyle = '#d4a017'
    ctx.fillRect((tx + 7) * TILE + 4, (ty + 2) * TILE + 4, 8, 4)
    // couch
    ctx.fillStyle = '#a06b8a'
    ctx.fillRect((tx + 1) * TILE, (ty + 9) * TILE, TILE * 4, TILE)
    ctx.fillRect((tx + 1) * TILE, (ty + 8) * TILE + 8, TILE * 4, 8)
    // plant
    ctx.fillStyle = '#5a8f5a'
    ctx.fillRect((tx + 8) * TILE + 4, (ty + 9) * TILE, 8, 8)
    ctx.fillStyle = '#8a6f4d'
    ctx.fillRect((tx + 8) * TILE + 5, (ty + 9) * TILE + 8, 6, 5)
  }

  private drawCharacter(c: Character, t: number): void {
    const { ctx } = this
    const x = c.x * TILE, y = c.y * TILE
    const bob = (c.walking || c.status === 'typing') ? (Math.floor(t / 150) % 2) : 0
    const body = c.kind === 'main' ? '#d4a017' : SHIRTS[c.palette % SHIRTS.length]!
    // body
    ctx.fillStyle = body
    ctx.fillRect(x + 3, y + 6 - bob, 10, 8)
    // head
    ctx.fillStyle = '#e8c39e'
    ctx.fillRect(x + 4, y - bob, 8, 7)
    // hair (palette variation)
    ctx.fillStyle = ['#3a2a1a', '#1a1a2a', '#5a3a1a', '#2a2a2a'][c.palette % 4]!
    ctx.fillRect(x + 4, y - bob, 8, 3)
    // legs
    ctx.fillStyle = '#2a2438'
    ctx.fillRect(x + 4 + bob, y + 14, 3, 2)
    ctx.fillRect(x + 9 - bob, y + 14, 3, 2)
    // crown for main agents
    if (c.kind === 'main') {
      ctx.fillStyle = '#ffd700'
      ctx.fillRect(x + 5, y - 3 - bob, 2, 3); ctx.fillRect(x + 7, y - 4 - bob, 2, 4); ctx.fillRect(x + 9, y - 3 - bob, 2, 3)
    }
    // status glyph
    const glyph = STATUS_GLYPH[c.status]
    if (glyph && glyph !== '·') {
      ctx.font = '8px sans-serif'
      ctx.fillText(glyph, x + 3, y - 6)
    }
  }
}
