import type { FloorPlan, RoomBox, ZoneBox } from '../layout/layoutEngine'
import { TILE } from '../layout/layoutEngine'
import { Camera } from './camera'
import { CharacterSet, Character, animFrame, poseBodyOffset, FRAME_MS, IDLE_FRAME_MS } from './characters'
import type { Theme } from './atlas'
import type { Skin } from './skins/skin'
import { drawWorkEffects } from './effects'
import { hashString } from '../util/rng'

const SHIRTS = ['#c0504e', '#4e79c0', '#4ec07a', '#c0a04e', '#9a4ec0', '#4ebdc0']

// flat-color fallback used until the active skin loads (or forever if it 404s)
const FALLBACK_TINT: Record<Theme, { floor: string; wall: string; nook: string }> = {
  office: { floor: '#3d3654', wall: '#52486e', nook: '#352f4a' },
  mine: { floor: '#3a3a46', wall: '#2c2c36', nook: '#32323c' },
  farm: { floor: '#2f4a2c', wall: '#4a3a22', nook: '#294026' },
}

/** Owns the canvas, camera, rAF loop, painter's y-sort and hit testing.
 *  All sprite drawing is delegated to the active Skin; a minimal flat-color
 *  fallback keeps the office legible while no skin is ready. */
export class Renderer {
  readonly camera = new Camera()
  readonly characters = new CharacterSet()
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private last = 0
  private skin: Skin | undefined
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

  /** Skins are optional: until one is set and ready we fall back to flat-color drawing. */
  setSkin(skin: Skin): void { this.skin = skin }

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
    const skin = this.skin?.ready ? this.skin : undefined
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
      for (const zone of room.zones) {
        if (skin) skin.drawZone(ctx, zone, t)
        else this.drawZoneFallback(zone)
        // crisp zone edge
        ctx.strokeStyle = '#1d1830'
        ctx.lineWidth = 1
        ctx.strokeRect(zone.tx * TILE + 0.5, zone.ty * TILE + 0.5, zone.tw * TILE - 1, zone.th * TILE - 1)
      }
      this.drawRoomChrome(room)
    }
    // painter's order: lower characters draw over higher ones
    const chars = this.characters.all().sort((a, b) => a.y - b.y)
    for (const c of chars) {
      if (skin) skin.drawCharacter(ctx, c, t)
      else this.drawCharacterFallback(c, t)
    }
    // effects float above everything in their zone
    for (const room of plan.rooms) {
      for (const zone of room.zones) {
        if (working.has(zone.tableKey)) {
          if (skin) skin.drawEffects(ctx, zone, t)
          else drawWorkEffects(ctx, zone.theme, zone.workTx * TILE, zone.workTy * TILE, t, hashString(zone.tableKey) % 4096)
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

  private drawZoneFallback(zone: ZoneBox): void {
    const { ctx } = this
    const x = zone.tx * TILE, y = zone.ty * TILE
    const tint = FALLBACK_TINT[zone.theme]
    ctx.fillStyle = tint.floor
    ctx.fillRect(x, y, zone.tw * TILE, zone.th * TILE)
    ctx.fillStyle = tint.wall
    ctx.fillRect(x, y, zone.tw * TILE, TILE)
    ctx.fillStyle = tint.nook
    ctx.fillRect(zone.lounge.tx * TILE, zone.lounge.ty * TILE, zone.lounge.tw * TILE, zone.lounge.th * TILE)
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

  private drawCharacterFallback(c: Character, t: number): void {
    const { ctx } = this
    const phase = c.palette % 2
    const period = (c.pose === 'idle' || c.pose === 'loaf') && !c.walking ? IDLE_FRAME_MS : FRAME_MS
    const frame = animFrame(t, period, phase)
    const { dx, dy } = poseBodyOffset(c.pose, frame, c.walking)
    const x = c.x * TILE + dx, y = c.y * TILE + dy

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

    // crown for main agents
    if (c.kind === 'main') {
      ctx.fillStyle = '#ffd700'
      ctx.fillRect(x + 5, y - 3, 2, 3); ctx.fillRect(x + 7, y - 4, 2, 4); ctx.fillRect(x + 9, y - 3, 2, 3)
    }
  }
}
