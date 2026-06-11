import type { WorldPlan, Region } from '../layout/layoutEngine'
import { TILE } from '../layout/layoutEngine'
import { packCell } from '../layout/terrain'
import { Camera } from './camera'
import { CharacterSet, Character, animFrame, poseBodyOffset, FRAME_MS, IDLE_FRAME_MS } from './characters'
import type { Theme } from './atlas'
import type { Skin } from './skins/skin'
import { drawWorkEffects } from './effects'
import { hashString, det } from '../util/rng'

const SHIRTS = ['#c0504e', '#4e79c0', '#4ec07a', '#c0a04e', '#9a4ec0', '#4ebdc0']

// the dark sea the islands float on (slightly bluer than the page void)
const SEA = '#181c30'
const CACHE_MARGIN = 4 // tiles of slack around an island's bbox (fringe, tent tops, rim)

// flat-color fallback used until the active skin loads (or forever if it 404s)
const FALLBACK_TINT: Record<Theme, { floor: string; deco: string }> = {
  office: { floor: '#33502e', deco: '#52486e' },
  mine: { floor: '#6e5232', deco: '#5a5a66' },
  farm: { floor: '#4c7a32', deco: '#5e4226' },
}

/** Owns the canvas, camera, rAF loop, terrain cache, painter's y-sort and hit
 *  testing. All sprite drawing is delegated to the active Skin; a minimal
 *  flat-color fallback keeps the world legible while no skin is ready. */
export class Renderer {
  readonly camera = new Camera()
  readonly characters = new CharacterSet()
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private last = 0
  private skin: Skin | undefined
  private lastFit = ''
  // static island terrain rendered once per state into offscreen canvases
  private terrainCache = new Map<string, { key: string; canvas: HTMLCanvasElement; px: number; py: number }>()
  // the lone sprite who keeps the empty world company (key seeds its actor pick)
  private emptyChar = new Character('yagents:nobody-home', 'sub', 'waiting', 0, 0)

  constructor(private canvas: HTMLCanvasElement, private getPlan: () => WorldPlan) {
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
    // front-most first: scan in reverse y-order (the draw order is y-sorted)
    const chars = this.characters.all().sort((a, b) => a.y - b.y)
    for (let i = chars.length - 1; i >= 0; i--) {
      const c = chars[i]!
      const px = c.x * TILE, py = c.y * TILE
      if (w.x >= px - 2 && w.x <= px + TILE + 2 && w.y >= py - 6 && w.y <= py + TILE + 2) return c.key
    }
    return null
  }

  /** Frame the whole world on first layout (and on growth) until the user pans/zooms.
   *  Worlds bigger than the screen fit out below scale 1 (in crisp 1/8 steps). */
  private maybeFit(plan: WorldPlan): void {
    if (this.camera.userMoved || plan.tw === 0) return
    const key = plan.tx + ',' + plan.ty + ',' + plan.tw + 'x' + plan.th
    if (key === this.lastFit) return
    this.lastFit = key
    const cssW = this.canvas.width / devicePixelRatio
    const cssH = this.canvas.height / devicePixelRatio
    const pw = plan.tw * TILE, ph = plan.th * TILE
    const raw = Math.min(cssW / (pw + 2 * TILE), cssH / (ph + 2 * TILE))
    const s = raw >= 1 ? Math.min(5, Math.floor(raw)) : Math.max(0.3, Math.floor(raw * 8) / 8)
    this.camera.scale = s
    this.camera.x = plan.tx * TILE - (cssW / s - pw) / 2
    this.camera.y = plan.ty * TILE - (cssH / s - ph) / 2
  }

  private draw(plan: WorldPlan, t: number): void {
    const { ctx, canvas, camera } = this
    const skin = this.skin?.ready ? this.skin : undefined
    this.maybeFit(plan)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = SEA
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // nobody home: show the friendly empty state instead of a silent void
    // (waits for leaving characters to finish walking out, then takes over;
    // reappears/disappears purely from the live plan, so it's fully reactive)
    if (plan.regions.length === 0 && this.characters.all().length === 0) {
      this.drawEmptyState(t)
      return
    }
    ctx.save()
    ctx.scale(camera.scale * devicePixelRatio, camera.scale * devicePixelRatio)
    ctx.translate(-camera.x, -camera.y)

    // visible world rect (world px) for culling
    const viewW = canvas.width / devicePixelRatio / camera.scale
    const viewH = canvas.height / devicePixelRatio / camera.scale
    const vx0 = camera.x, vy0 = camera.y, vx1 = camera.x + viewW, vy1 = camera.y + viewH

    this.drawSea(t, vx0, vy0, vx1, vy1)
    this.drawPaths(plan, t)

    // islands: blit the cached terrain, then the live animated layer
    this.pruneTerrainCache(plan)
    for (const region of plan.regions) {
      const px0 = (region.tx - CACHE_MARGIN) * TILE, py0 = (region.ty - CACHE_MARGIN) * TILE
      const px1 = (region.tx + region.tw + CACHE_MARGIN) * TILE, py1 = (region.ty + region.th + CACHE_MARGIN) * TILE
      if (px1 < vx0 || px0 > vx1 || py1 < vy0 || py0 > vy1) continue // offscreen island
      const entry = this.terrainFor(region, skin)
      ctx.drawImage(entry.canvas, entry.px, entry.py)
      if (skin) skin.drawRegionLive(ctx, region, t)
    }

    // which stations have someone actually doing the work right now?
    const working = new Set<string>()
    for (const s of plan.seats) if (s.pose === 'work') working.add(s.tableKey)

    // painter's order: lower characters draw over higher ones
    const chars = this.characters.all().sort((a, b) => a.y - b.y)
    for (const c of chars) {
      if (skin) skin.drawCharacter(ctx, c, t)
      else this.drawCharacterFallback(c, t)
    }
    // effects float above everything at their station
    for (const region of plan.regions) {
      for (const st of region.stations) {
        if (working.has(st.tableKey)) {
          if (skin) skin.drawEffects(ctx, st, t)
          else drawWorkEffects(ctx, st.theme, st.workTx * TILE, st.workTy * TILE, t, hashString(st.tableKey) % 4096)
        }
      }
    }
    ctx.restore()
    // labels, overflow tags and the low-zoom crown live in SCREEN space:
    // constant pixel size no matter how far the camera fits out
    this.drawScreenChrome(plan)
  }

  // ── the sea ───────────────────────────────────────────────────────────────
  /** Sparse deterministic glints + slow wave dashes over the visible water.
   *  Sampled on a coarse grid and culled to the viewport — O(visible). */
  private drawSea(t: number, vx0: number, vy0: number, vx1: number, vy1: number): void {
    const { ctx } = this
    const step = 3 // sample every 3rd tile
    const tx0 = Math.floor(vx0 / TILE / step) * step, ty0 = Math.floor(vy0 / TILE / step) * step
    const phase = Math.floor(t / 1400)
    for (let ty = ty0; ty * TILE < vy1; ty += step) {
      for (let tx = tx0; tx * TILE < vx1; tx += step) {
        const r = det(tx, ty, 401)
        if (r > 0.30) continue
        const ox = Math.floor(det(tx, ty, 402) * (step * TILE - 6))
        const oy = Math.floor(det(tx, ty, 403) * (step * TILE - 4))
        const x = tx * TILE + ox, y = ty * TILE + oy
        // most are faint wave dashes; a few twinkle on a slow clock
        const twinkle = r < 0.05 && (phase + tx + ty) % 3 === 0
        if (twinkle) {
          ctx.fillStyle = 'rgba(122, 148, 210, 0.5)'
          ctx.fillRect(x, y, 2, 2)
        } else {
          ctx.fillStyle = 'rgba(74, 92, 142, 0.35)'
          ctx.fillRect(x, y, 4, 1)
        }
      }
    }
  }

  // ── causeways ─────────────────────────────────────────────────────────────
  /** Stepping-stone causeways between islands, drawn procedurally on the sea. */
  private drawPaths(plan: WorldPlan, t: number): void {
    const { ctx } = this
    for (const path of plan.paths) {
      for (const [i, c] of path.cells.entries()) {
        const h = det(c.tx, c.ty, 211)
        const big = h > 0.55
        const w = big ? 8 : 6, hh = big ? 6 : 5
        const x = c.tx * TILE + 4 + Math.floor(det(c.tx, c.ty, 212) * 4)
        const y = c.ty * TILE + 5 + Math.floor(det(c.tx, c.ty, 213) * 4)
        // gentle lap of water against the stones
        const lap = animFrame(t + i * 217, 1200)
        ctx.fillStyle = 'rgba(98, 120, 178, 0.35)'
        ctx.fillRect(x - 1, y + hh - 1 + lap, w + 2, 2)
        ctx.fillStyle = '#3c4258' // stone shadow rim
        ctx.fillRect(x - 1, y + 1, w + 2, hh)
        ctx.fillStyle = big ? '#8b93a8' : '#7c849a' // the stone
        ctx.fillRect(x, y, w, hh - 1)
        ctx.fillStyle = 'rgba(255,255,255,0.18)' // top light
        ctx.fillRect(x + 1, y, w - 2, 1)
      }
    }
  }

  // ── terrain cache ─────────────────────────────────────────────────────────
  private terrainKey(region: Region, skin: Skin | undefined): string {
    return [
      region.dirKey, region.theme, region.radius.toFixed(2),
      region.stations.map(s => s.tableKey + '@' + s.tx + ',' + s.ty).join(';'),
      region.lounge.tx + ',' + region.lounge.ty,
      region.gateway.tx + ',' + region.gateway.ty,
      skin ? skin.name : 'fallback',
    ].join('|')
  }

  /** The island's static terrain, rendered once into an offscreen canvas and
   *  re-rendered only when the island actually changes (growth, new station). */
  private terrainFor(region: Region, skin: Skin | undefined): { canvas: HTMLCanvasElement; px: number; py: number } {
    const key = this.terrainKey(region, skin)
    const hit = this.terrainCache.get(region.dirKey)
    if (hit && hit.key === key) return hit
    const px = (region.tx - CACHE_MARGIN) * TILE
    const py = (region.ty - CACHE_MARGIN) * TILE
    const canvas = document.createElement('canvas')
    canvas.width = (region.tw + 2 * CACHE_MARGIN) * TILE
    canvas.height = (region.th + 2 * CACHE_MARGIN) * TILE
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.translate(-px, -py)
    if (skin) skin.drawRegionBase(ctx, region)
    else this.drawRegionFallback(ctx, region)
    const entry = { key, canvas, px, py }
    this.terrainCache.set(region.dirKey, entry)
    return entry
  }

  private pruneTerrainCache(plan: WorldPlan): void {
    if (this.terrainCache.size === 0) return
    const live = new Set(plan.regions.map(r => r.dirKey))
    for (const key of this.terrainCache.keys()) {
      if (!live.has(key)) this.terrainCache.delete(key)
    }
  }

  /** First-run / between-sessions screen: a lone loafing sprite snoozing under
   *  its 'z' (the pack's own idle charm) plus a terminal-flavored hint, all
   *  centered and pixel-crisp. Drawn every frame from live state, so it
   *  vanishes the instant a session appears and returns when the world empties. */
  private drawEmptyState(t: number): void {
    const { ctx, canvas } = this
    const dpr = devicePixelRatio
    const cssW = canvas.width / dpr, cssH = canvas.height / dpr
    const skin = this.skin?.ready ? this.skin : undefined

    // the sprite dozes a little above the message, pixel-scaled ×3
    const s = 3
    this.emptyChar.pose = 'loaf'
    this.emptyChar.theme = 'office'
    this.emptyChar.x = (cssW / s / 2) / TILE - 0.5
    this.emptyChar.y = (cssH / s / 2) / TILE - 2.2
    ctx.save()
    ctx.scale(s * dpr, s * dpr)
    if (skin) skin.drawCharacter(ctx, this.emptyChar, t)
    else this.drawCharacterFallback(this.emptyChar, t)
    ctx.restore()

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.textAlign = 'center'
    const cx = cssW / 2, cy = cssH / 2
    ctx.font = '13px ui-monospace, Menlo, monospace'
    ctx.fillStyle = '#d4a017'
    const headline = 'no agents working right now'
    ctx.fillText(headline, cx, cy + 6)
    // blinking terminal cursor after the headline (deterministic from t)
    if (animFrame(t, 600) === 0) {
      ctx.fillStyle = '#5a8f5a'
      ctx.fillRect(Math.floor(cx + ctx.measureText(headline).width / 2 + 5), cy - 4, 7, 12)
    }
    ctx.font = '11px ui-monospace, Menlo, monospace'
    ctx.fillStyle = '#8a7aaa'
    ctx.fillText("open Claude Code in a project and they'll show up here", cx, cy + 26)
    ctx.restore()
  }

  /** Screen-space chrome: island labels, +N overflow tags, and a constant-size
   *  crown over each main agent when the camera is zoomed out far enough that
   *  the in-sprite crown becomes illegible. Drawn after the world transform is
   *  popped so all of it stays readable at any fit zoom. */
  private drawScreenChrome(plan: WorldPlan): void {
    const { ctx, camera } = this
    ctx.save()
    ctx.scale(devicePixelRatio, devicePixelRatio)
    ctx.font = '11px ui-monospace, Menlo, monospace'
    ctx.textAlign = 'center'
    for (const region of plan.regions) {
      // label floats centered above the island's north coast
      const p = camera.worldToScreen((region.anchorTx + 0.5) * TILE, (region.ty - 0.6) * TILE)
      const label = './' + region.label
      const w = Math.ceil(ctx.measureText(label).width)
      // flat dark badge keeps the label readable over any terrain
      ctx.fillStyle = 'rgba(15, 12, 26, 0.82)'
      ctx.fillRect(Math.floor(p.x - w / 2) - 4, Math.floor(p.y) - 11, w + 8, 15)
      ctx.fillStyle = '#fff8ec'
      ctx.fillText(label, Math.floor(p.x), Math.floor(p.y))
      for (const st of region.stations) {
        if (st.overflow <= 0) continue
        const tag = '+' + st.overflow + ' more'
        const tw = Math.ceil(ctx.measureText(tag).width)
        const q = camera.worldToScreen((st.tx + st.tw) * TILE, (st.ty + st.th) * TILE)
        ctx.fillStyle = 'rgba(15, 12, 26, 0.82)'
        ctx.fillRect(Math.floor(q.x) - tw - 11, Math.floor(q.y) - 18, tw + 8, 14)
        ctx.fillStyle = '#d4a017'
        ctx.fillText(tag, Math.floor(q.x) - tw / 2 - 7, Math.floor(q.y) - 7)
      }
    }
    ctx.textAlign = 'left'
    // below ~3× the 6×4px sprite crown is a smudge — overlay a constant-size one
    if (camera.scale < 3) {
      for (const c of this.characters.all()) {
        if (c.kind !== 'main' || c.leaving) continue
        const p = camera.worldToScreen(c.x * TILE + TILE / 2, c.y * TILE)
        this.drawScreenCrown(Math.floor(p.x), Math.floor(p.y))
      }
    }
    ctx.restore()
  }

  /** The main-agent crown at a fixed screen size (2 CSS px per crown pixel),
   *  dark-silhouetted so the gold pops on any terrain. (cx, cy) = head top. */
  private drawScreenCrown(cx: number, cy: number): void {
    const { ctx } = this
    const u = 2
    const spikes: [number, number, number, number][] = [[-3, -4, 2, 3], [-1, -5, 2, 4], [1, -4, 2, 3]]
    ctx.fillStyle = '#0f0c1a'
    for (const [x, y, w, h] of spikes) ctx.fillRect(cx + x * u - 1, cy + y * u - 1, w * u + 2, h * u + 2)
    ctx.fillStyle = '#ffd700'
    for (const [x, y, w, h] of spikes) ctx.fillRect(cx + x * u, cy + y * u, w * u, h * u)
  }

  /** Flat-color island for the pre-skin fallback: tinted blob cells with a
   *  dark coast outline, plus simple work-object markers. */
  private drawRegionFallback(ctx: CanvasRenderingContext2D, region: Region): void {
    const tint = FALLBACK_TINT[region.theme]
    const has = (tx: number, ty: number) => region.cells.has(packCell(tx, ty))
    ctx.fillStyle = tint.floor
    for (const p of region.cells) {
      const tx = (p % 4096) - 2048, ty = Math.floor(p / 4096) - 2048
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE)
    }
    ctx.fillStyle = '#0f0c1a'
    for (const p of region.cells) {
      const tx = (p % 4096) - 2048, ty = Math.floor(p / 4096) - 2048
      if (!has(tx, ty - 1)) ctx.fillRect(tx * TILE, ty * TILE, TILE, 2)
      if (!has(tx, ty + 1)) ctx.fillRect(tx * TILE, ty * TILE + TILE - 2, TILE, 2)
      if (!has(tx - 1, ty)) ctx.fillRect(tx * TILE, ty * TILE, 2, TILE)
      if (!has(tx + 1, ty)) ctx.fillRect(tx * TILE + TILE - 2, ty * TILE, 2, TILE)
    }
    ctx.fillStyle = tint.deco
    ctx.fillRect(region.lounge.tx * TILE, region.lounge.ty * TILE, region.lounge.tw * TILE, region.lounge.th * TILE)
    for (const st of region.stations) {
      const wx = st.workTx * TILE, wy = st.workTy * TILE
      if (st.theme === 'office') {
        ctx.fillStyle = '#222'
        ctx.fillRect(wx, wy + 4, TILE * 2 - 4, 12)
        ctx.fillStyle = '#7dff9a'
        ctx.fillRect(wx + TILE + 2, wy + 6, 8, 6)
      } else if (st.theme === 'mine') {
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
