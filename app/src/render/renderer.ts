import type { FloorPlan } from '../layout/layoutEngine'
import { TILE } from '../layout/layoutEngine'
import { Camera } from './camera'
import { CharacterSet, Character } from './characters'
import { Atlas, TILES, CHAR_TILES, MAIN_CHAR } from './atlas'
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
  private atlas: Atlas | undefined

  constructor(private canvas: HTMLCanvasElement, private getPlan: () => FloorPlan) {
    this.ctx = canvas.getContext('2d')!
    const resize = () => {
      canvas.width = window.innerWidth * devicePixelRatio
      canvas.height = window.innerHeight * devicePixelRatio
    }
    resize()
    window.addEventListener('resize', resize)
  }

  /** Sprites are optional: until the atlas loads (or if it 404s) we fall back to flat-color drawing. */
  setAtlas(atlas: Atlas): void { this.atlas = atlas }

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

    this.drawRoom(plan.kitchen.tx, plan.kitchen.ty, plan.kitchen.tw, plan.kitchen.th, true, '☕ kitchen')
    this.drawKitchenFurniture(plan.kitchen.tx, plan.kitchen.ty, plan.kitchen.th)
    for (const room of plan.rooms) {
      this.drawRoom(room.tx, room.ty, room.tw, room.th, false, '📁 ' + room.label)
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

  private drawRoom(tx: number, ty: number, tw: number, th: number, isKitchen: boolean, label: string): void {
    const { ctx, atlas } = this
    const x = tx * TILE, y = ty * TILE, w = tw * TILE, h = th * TILE
    if (atlas) {
      const floor = isKitchen ? TILES.floorKitchen : TILES.floorWood
      const wall = isKitchen ? TILES.wallGray : TILES.wallTan
      for (let i = 0; i < tw; i++) {
        for (let j = 0; j < th; j++) atlas.draw(ctx, j === 0 ? wall : floor, x + i * TILE, y + j * TILE)
      }
      ctx.strokeStyle = '#1d1830'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
    } else {
      ctx.fillStyle = isKitchen ? '#4a3d54' : '#3d3654'
      ctx.fillRect(x, y, w, h)
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      for (let i = 0; i < tw; i++) for (let j = 0; j < th; j++) {
        if ((i + j) % 2 === 0) ctx.fillRect(x + i * TILE, y + j * TILE, TILE, TILE)
      }
      ctx.strokeStyle = '#6b5b8a'
      ctx.lineWidth = 3
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3)
      // doorway gap on the left wall so agents "can" reach the kitchen
      ctx.fillStyle = isKitchen ? '#4a3d54' : '#3d3654'
      ctx.fillRect(x - 2, y + h / 2 - TILE, 5, TILE * 2)
    }
    ctx.fillStyle = atlas ? '#fff8ec' : '#b8a8d8'
    ctx.font = '7px monospace'
    ctx.fillText(label, x + 6, y + 10)
  }

  private drawTable(tx: number, ty: number, tw: number, th: number): void {
    const { ctx, atlas } = this
    const x = tx * TILE, y = ty * TILE
    if (atlas) {
      for (let i = 0; i < tw; i++) {
        const top = i === 0 ? TILES.tableTopL : i === tw - 1 ? TILES.tableTopR : TILES.tableTopM
        const bot = i === 0 ? TILES.tableBotL : i === tw - 1 ? TILES.tableBotR : TILES.tableBotM
        atlas.draw(ctx, top, x + i * TILE, y)
        if (th > 1) atlas.draw(ctx, bot, x + i * TILE, y + TILE)
      }
      // chairs at the seat positions (head above facing down, subs below facing up)
      atlas.draw(ctx, TILES.chairDown, x + TILE, y - TILE)
      for (let j = 0; j < 4; j++) atlas.draw(ctx, TILES.chairUp, x + j * TILE, y + th * TILE)
    } else {
      ctx.fillStyle = '#5e4a30'
      ctx.fillRect(x + 2, y + 2, tw * TILE - 2, th * TILE - 2)
      ctx.fillStyle = '#8a6f4d'
      ctx.fillRect(x, y, tw * TILE - 2, th * TILE - 2)
    }
  }

  private drawKitchenFurniture(tx: number, ty: number, th: number): void {
    const { ctx, atlas } = this
    if (atlas) {
      // counter line under the top wall: sink, drawers, stove
      atlas.draw(ctx, TILES.counterSink, (tx + 1) * TILE, (ty + 1) * TILE)
      atlas.draw(ctx, TILES.counterDrawers, (tx + 2) * TILE, (ty + 1) * TILE)
      atlas.draw(ctx, TILES.counterDrawers, (tx + 3) * TILE, (ty + 1) * TILE)
      atlas.draw(ctx, TILES.stove, (tx + 5) * TILE, (ty + 1) * TILE)
      // couch along the bottom
      atlas.draw(ctx, TILES.couchL, (tx + 1) * TILE, (ty + th - 3) * TILE)
      atlas.draw(ctx, TILES.couchM, (tx + 2) * TILE, (ty + th - 3) * TILE)
      atlas.draw(ctx, TILES.couchR, (tx + 3) * TILE, (ty + th - 3) * TILE)
      // plants in the corners
      atlas.draw(ctx, TILES.plant, (tx + 8) * TILE, (ty + 1) * TILE)
      atlas.draw(ctx, TILES.plant, (tx + 8) * TILE, (ty + th - 3) * TILE)
    } else {
      ctx.fillStyle = '#222'
      ctx.fillRect((tx + 7) * TILE, (ty + 2) * TILE, TILE, TILE * 1.5)
      ctx.fillStyle = '#d4a017'
      ctx.fillRect((tx + 7) * TILE + 4, (ty + 2) * TILE + 4, 8, 4)
      ctx.fillStyle = '#a06b8a'
      ctx.fillRect((tx + 1) * TILE, (ty + 9) * TILE, TILE * 4, TILE)
      ctx.fillRect((tx + 1) * TILE, (ty + 8) * TILE + 8, TILE * 4, 8)
      ctx.fillStyle = '#5a8f5a'
      ctx.fillRect((tx + 8) * TILE + 4, (ty + 9) * TILE, 8, 8)
      ctx.fillStyle = '#8a6f4d'
      ctx.fillRect((tx + 8) * TILE + 5, (ty + 9) * TILE + 8, 6, 5)
    }
  }

  private drawCharacter(c: Character, t: number): void {
    const { ctx, atlas } = this
    const x = c.x * TILE, y = c.y * TILE
    const bob = (c.walking || c.status === 'typing') ? (Math.floor(t / 150) % 2) : 0
    if (atlas) {
      const tile = c.kind === 'main' ? MAIN_CHAR : CHAR_TILES[c.palette % CHAR_TILES.length]!
      atlas.draw(ctx, tile, x, y - bob)
    } else {
      const body = c.kind === 'main' ? '#d4a017' : SHIRTS[c.palette % SHIRTS.length]!
      ctx.fillStyle = body
      ctx.fillRect(x + 3, y + 6 - bob, 10, 8)
      ctx.fillStyle = '#e8c39e'
      ctx.fillRect(x + 4, y - bob, 8, 7)
      ctx.fillStyle = ['#3a2a1a', '#1a1a2a', '#5a3a1a', '#2a2a2a'][c.palette % 4]!
      ctx.fillRect(x + 4, y - bob, 8, 3)
      ctx.fillStyle = '#2a2438'
      ctx.fillRect(x + 4 + bob, y + 14, 3, 2)
      ctx.fillRect(x + 9 - bob, y + 14, 3, 2)
    }
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
