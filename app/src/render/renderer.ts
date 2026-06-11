import type { FloorPlan, RoomBox, ZoneBox } from '../layout/layoutEngine'
import { TILE } from '../layout/layoutEngine'
import { Camera } from './camera'
import { CharacterSet, Character, animFrame, poseBodyOffset, drawToolOverlay, FRAME_MS, IDLE_FRAME_MS } from './characters'
import { Atlas, CHAR_TILES, MAIN_CHAR, THEME_TILES, type Theme } from './atlas'
import { drawWorkEffects, cropStageIndex } from './effects'
import { hashString } from '../util/rng'

const SHIRTS = ['#c0504e', '#4e79c0', '#4ec07a', '#c0a04e', '#9a4ec0', '#4ebdc0']

// flat-color fallback used until the sprite atlas loads (or forever if it 404s)
const FALLBACK_TINT: Record<Theme, { floor: string; wall: string; nook: string }> = {
  office: { floor: '#3d3654', wall: '#52486e', nook: '#352f4a' },
  mine: { floor: '#3a3a46', wall: '#2c2c36', nook: '#32323c' },
  farm: { floor: '#2f4a2c', wall: '#4a3a22', nook: '#294026' },
}

export class Renderer {
  readonly camera = new Camera()
  readonly characters = new CharacterSet()
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private last = 0
  private atlas: Atlas | undefined
  private lastFit = ''

  constructor(private canvas: HTMLCanvasElement, private getPlan: () => FloorPlan) {
    this.ctx = canvas.getContext('2d')!
    const resize = () => {
      canvas.width = window.innerWidth * devicePixelRatio
      canvas.height = window.innerHeight * devicePixelRatio
      this.lastFit = '' // refit on resize unless the user has taken the camera
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

  /** Frame the whole office on first layout (and on growth) until the user pans/zooms. */
  private maybeFit(plan: FloorPlan): void {
    if (this.camera.userMoved || plan.tw === 0) return
    const key = plan.tw + 'x' + plan.th
    if (key === this.lastFit) return
    this.lastFit = key
    const cssW = this.canvas.width / devicePixelRatio
    const cssH = this.canvas.height / devicePixelRatio
    const pw = plan.tw * TILE, ph = plan.th * TILE
    const s = Math.max(1, Math.min(5, Math.floor(Math.min(cssW / (pw + 2 * TILE), cssH / (ph + 2 * TILE)))))
    this.camera.scale = s
    this.camera.x = -(cssW / s - pw) / 2
    this.camera.y = -(cssH / s - ph) / 2
  }

  private draw(plan: FloorPlan, t: number): void {
    const { ctx, canvas, camera } = this
    this.maybeFit(plan)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#1d1830'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(camera.scale * devicePixelRatio, camera.scale * devicePixelRatio)
    ctx.translate(-camera.x, -camera.y)

    // which zones have someone actually doing the work right now?
    const working = new Set<string>()
    for (const s of plan.seats) if (s.pose === 'work') working.add(s.tableKey)

    for (const room of plan.rooms) {
      for (const zone of room.zones) this.drawZone(zone, t)
      this.drawRoomChrome(room)
    }
    // painter's order: lower characters draw over higher ones
    const chars = this.characters.all().sort((a, b) => a.y - b.y)
    for (const c of chars) this.drawCharacter(c, t)
    // effects float above everything in their zone
    for (const room of plan.rooms) {
      for (const zone of room.zones) {
        if (working.has(zone.tableKey)) {
          drawWorkEffects(ctx, zone.theme, zone.workTx * TILE, zone.workTy * TILE, t, hashString(zone.tableKey) % 4096)
        }
        if (zone.overflow > 0) {
          ctx.fillStyle = '#d4a017'
          ctx.font = '6px monospace'
          ctx.fillText('+' + zone.overflow + ' more', (zone.tx + zone.tw - 4) * TILE, (zone.ty + zone.th) * TILE - 4)
        }
      }
    }
    ctx.restore()
  }

  private drawZone(zone: ZoneBox, t: number): void {
    const { ctx, atlas } = this
    const x = zone.tx * TILE, y = zone.ty * TILE
    const tiles = THEME_TILES[zone.theme]
    if (atlas) {
      // floor everywhere (also under the wall row: the farm fence is transparent)
      for (let i = 0; i < zone.tw; i++) {
        for (let j = 0; j < zone.th; j++) atlas.draw(ctx, tiles.floor, x + i * TILE, y + j * TILE)
        atlas.draw(ctx, tiles.wall, x + i * TILE, y)
      }
      this.drawWorkObject(zone, t)
      // lounge nook: themed props lined up along the nook's back edge
      tiles.lounge.forEach((prop, i) => {
        atlas.draw(ctx, prop, (zone.lounge.tx + i) * TILE, zone.lounge.ty * TILE)
      })
      // ambient set dressing on the zone's quieter right side
      const deco = tiles.deco ?? []
      if (deco[0]) atlas.draw(ctx, deco[0], (zone.tx + 10) * TILE, (zone.ty + 1) * TILE)
      if (deco[1]) atlas.draw(ctx, deco[1], (zone.tx + 11) * TILE, (zone.ty + 6) * TILE)
    } else {
      const tint = FALLBACK_TINT[zone.theme]
      ctx.fillStyle = tint.floor
      ctx.fillRect(x, y, zone.tw * TILE, zone.th * TILE)
      ctx.fillStyle = tint.wall
      ctx.fillRect(x, y, zone.tw * TILE, TILE)
      ctx.fillStyle = tint.nook
      ctx.fillRect(zone.lounge.tx * TILE, zone.lounge.ty * TILE, zone.lounge.tw * TILE, zone.lounge.th * TILE)
      this.drawWorkObjectFallback(zone)
    }
    // crisp zone edge
    ctx.strokeStyle = '#1d1830'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, zone.tw * TILE - 1, zone.th * TILE - 1)
  }

  private drawWorkObject(zone: ZoneBox, t: number): void {
    const { ctx, atlas } = this
    if (!atlas) return
    const tiles = THEME_TILES[zone.theme]
    const wx = zone.workTx * TILE, wy = zone.workTy * TILE
    if (zone.theme === 'farm') {
      // 2x2 tilled plot: TL, TR, BL, BR
      tiles.workObject.forEach((tile, i) => {
        atlas.draw(ctx, tile, wx + (i % 2) * TILE, wy + Math.floor(i / 2) * TILE)
      })
      // darken the soil and dash short furrows so it reads as tilled earth, not planks
      ctx.fillStyle = 'rgba(58, 34, 14, 0.30)'
      ctx.fillRect(wx, wy, TILE * 2, TILE * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      for (let row = 0; row < 4; row++) {
        for (let seg = 0; seg < 7; seg++) ctx.fillRect(wx + 2 + seg * 4, wy + 4 + row * 7, 2, 1)
      }
      // crops grow on the plot over time, staggered per tile, then reset (harvest)
      const stages = tiles.cropStages
      if (stages && stages.length > 0) {
        const seed = hashString(zone.tableKey)
        for (let i = 0; i < 4; i++) {
          const stage = cropStageIndex(t, (seed + i * 3) % 97, stages.length)
          if (stage >= 0) {
            const ref = stages[Math.min(stage, stages.length - 1)]!
            atlas.draw(ctx, ref, wx + (i % 2) * TILE, wy + Math.floor(i / 2) * TILE)
          }
        }
      }
    } else if (zone.theme === 'office') {
      // a two-tile desk with the terminal standing on top of it
      const [desk, terminal] = tiles.workObject
      if (desk) { atlas.draw(ctx, desk, wx, wy); atlas.draw(ctx, desk, wx + TILE, wy) }
      if (terminal) atlas.draw(ctx, terminal, wx + 8, wy - 6)
    } else {
      // mine: boulder + ore pile + cart — in a row
      tiles.workObject.forEach((tile, i) => atlas.draw(ctx, tile, wx + i * TILE, wy))
    }
  }

  private drawWorkObjectFallback(zone: ZoneBox): void {
    const { ctx } = this
    const wx = zone.workTx * TILE, wy = zone.workTy * TILE
    if (zone.theme === 'office') {
      ctx.fillStyle = '#222'
      ctx.fillRect(wx, wy + 4, TILE * 2 - 4, 12)
      ctx.fillStyle = '#7dff9a'
      ctx.fillRect(wx + TILE + 2, wy + 6, 8, 6)
    } else if (zone.theme === 'mine') {
      ctx.fillStyle = '#6b6b76'
      ctx.fillRect(wx + 2, wy + 4, 12, 12)
      ctx.fillStyle = '#d4a017'
      ctx.fillRect(wx + TILE + 4, wy + 8, 6, 6)
    } else {
      ctx.fillStyle = '#5e4226'
      ctx.fillRect(wx, wy, TILE * 2, TILE * 2)
      ctx.fillStyle = '#4a3017'
      for (let i = 0; i < 4; i++) ctx.fillRect(wx + 2 + (i % 2) * TILE, wy + 4 + Math.floor(i / 2) * TILE, 12, 3)
    }
  }

  private drawRoomChrome(room: RoomBox): void {
    const { ctx } = this
    const x = room.tx * TILE, y = room.ty * TILE
    ctx.strokeStyle = '#0f0c1a'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, room.tw * TILE - 1, room.th * TILE - 1)
    ctx.font = '7px monospace'
    const label = './' + room.label
    ctx.fillStyle = '#1d1830'
    ctx.fillText(label, x + 5, y + 12)
    ctx.fillStyle = '#fff8ec'
    ctx.fillText(label, x + 4, y + 11)
  }

  private drawCharacter(c: Character, t: number): void {
    const { ctx, atlas } = this
    const phase = c.palette % 2
    const period = (c.pose === 'idle' || c.pose === 'loaf') && !c.walking ? IDLE_FRAME_MS : FRAME_MS
    const frame = animFrame(t, period, phase)
    const { dx, dy } = poseBodyOffset(c.pose, frame, c.walking)
    const x = c.x * TILE + dx, y = c.y * TILE + dy

    if (atlas) {
      const tile = c.kind === 'main' ? MAIN_CHAR : CHAR_TILES[c.palette % CHAR_TILES.length]!
      atlas.draw(ctx, tile, x, y)
    } else {
      const body = c.kind === 'main' ? '#d4a017' : SHIRTS[c.palette % SHIRTS.length]!
      ctx.fillStyle = body
      ctx.fillRect(x + 3, y + 6, 10, 8)
      ctx.fillStyle = '#e8c39e'
      ctx.fillRect(x + 4, y, 8, 7)
      ctx.fillStyle = ['#3a2a1a', '#1a1a2a', '#5a3a1a', '#2a2a2a'][c.palette % 4]!
      ctx.fillRect(x + 4, y, 8, 3)
      ctx.fillStyle = '#2a2438'
      ctx.fillRect(x + 4 + frame, y + 14, 3, 2)
      ctx.fillRect(x + 9 - frame, y + 14, 3, 2)
    }

    // pose dressing (the motion IS the status — glyphs stay tiny)
    if (!c.walking) {
      if (c.pose === 'work') drawToolOverlay(ctx, c.theme, frame, x, y)
      else if (c.pose === 'gesture') {
        ctx.fillStyle = frame ? '#ffd700' : '#d4a017'
        ctx.fillRect(x + 13, y - 6, 2, 4)
        ctx.fillRect(x + 13, y - 1, 2, 2)
      } else if (c.pose === 'loaf') {
        const zz = animFrame(t, 1100, phase)
        ctx.fillStyle = 'rgba(255, 248, 236, 0.75)'
        ctx.font = '6px monospace'
        ctx.fillText('z', x + 12, y - 2 - zz)
      } else if (c.pose === 'idle') {
        ctx.fillStyle = 'rgba(255, 248, 236, 0.55)'
        for (let i = 0; i <= frame + 1; i++) ctx.fillRect(x + 11 + i * 3, y - 4, 2, 2)
      }
    }

    // crown for main agents
    if (c.kind === 'main') {
      ctx.fillStyle = '#ffd700'
      ctx.fillRect(x + 5, y - 3, 2, 3); ctx.fillRect(x + 7, y - 4, 2, 4); ctx.fillRect(x + 9, y - 3, 2, 3)
    }
  }
}
