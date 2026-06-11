// Ninja Adventure skin (CC0, by Pixel-boy & AAA — pixel-boy.itch.io).
// Real animated sheets: 4-direction walk cycles, idle stances, attack
// swings with held tools, and particle FX cut from the pack's fx strips.
//
// Character sheet layout (decoded from the pack):
//   Walk.png   64×64 — column = facing (0 down, 1 up, 2 left, 3 right), row = frame 0-3
//   Idle.png   64×16 — one frame per facing, same column order
//   Attack.png 64×16 — one swing frame per facing, same column order
//   Item.png   16×16 — single down-facing "holds item up" frame
import type { Skin } from './skin'
import type { ZoneBox } from '../../layout/layoutEngine'
import { TILE } from '../../layout/layoutEngine'
import type { Character, Facing } from '../characters'
import { animFrame, poseBodyOffset, FRAME_MS, IDLE_FRAME_MS } from '../characters'
import type { Theme } from '../atlas'
import { burstParticles, cropStageIndex, codeLines, drawGroundScatter, det, SWING_MS } from '../effects'
import { hashString } from '../../util/rng'

const WALK_FRAME_MS = 140 // 4-frame cycle ≈ 1.8 steps/s — a busy little stride

const FACING_COL: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 }

// Theme casting: who shows up for which kind of work. Mains are fixed per
// theme (plus the gold crown); subagents pick from the pool by key hash.
const CAST: Record<Theme, { main: string; subs: string[] }> = {
  mine: { main: 'Caveman', subs: ['Cavegirl', 'Knight', 'NinjaGray', 'Skeleton', 'Monkey'] },
  farm: { main: 'ManGreen', subs: ['Boy', 'Hunter', 'Villager', 'Villager2', 'Pig', 'GreenPig'] },
  office: { main: 'Master', subs: ['Inspector', 'Monk', 'Noble', 'OldMan', 'Sultan', 'Princess'] },
}
const ALL_ACTORS = [...new Set(Object.values(CAST).flatMap(c => [c.main, ...c.subs]))]
const ANIMS = ['Walk', 'Idle', 'Attack', 'Item'] as const

export class NinjaSkin implements Skin {
  readonly name = 'ninja'
  ready = false
  private img = new Map<string, HTMLImageElement>()

  async load(base = './sprites/ninja/'): Promise<void> {
    const files: [string, string][] = [
      ['field', 'tileset/TilesetField.png'],
      ['intfloor', 'tileset/TilesetInteriorFloor.png'],
      ['house', 'tileset/TilesetHouse.png'],
      ['relief', 'tileset/TilesetRelief.png'],
      ['nature', 'tileset/TilesetNature.png'],
      ['dungeon', 'tileset/TilesetDungeon.png'],
      ['plant', 'anim/Plant.png'],
      ['book', 'item/Book.png'],
      ['scroll', 'item/Scroll.png'],
      ['gem', 'item/Gem.png'],
      ['crate', 'item/CrateEmpty.png'],
      ['hourglass', 'item/Hourglass.png'],
      ['fxRock', 'fx/Rock.png'],
      ['fxRockGray', 'fx/RockGray.png'],
      ['fxSpark', 'fx/Spark.png'],
      ['pickaxe', 'tool/Pickaxe.png'],
      ['hoe', 'tool/Hoe.png'],
      ['sickle', 'tool/Sickle.png'],
    ]
    for (const actor of ALL_ACTORS) {
      for (const anim of ANIMS) files.push([actor + ':' + anim, `char/${actor}/${anim}.png`])
    }
    const one = (key: string, file: string) => new Promise<void>((res, rej) => {
      const img = new Image()
      img.onload = () => { this.img.set(key, img); res() }
      img.onerror = () => rej(new Error('ninja sheet failed to load: ' + file))
      img.src = base + file
    })
    await Promise.all(files.map(([k, f]) => one(k, f)))
    this.ready = true
  }

  // ── tiny blitters ──────────────────────────────────────────────────────
  private sheet(key: string): HTMLImageElement { return this.img.get(key)! }
  /** copy an arbitrary pixel rect 1:1 (positions floored to stay crisp) */
  private blit(ctx: CanvasRenderingContext2D, key: string, sx: number, sy: number, w: number, h: number, x: number, y: number): void {
    ctx.drawImage(this.sheet(key), sx, sy, w, h, Math.floor(x), Math.floor(y), w, h)
  }
  /** copy one 16px tile (c, r) of a sheet */
  private tile(ctx: CanvasRenderingContext2D, key: string, c: number, r: number, x: number, y: number): void {
    this.blit(ctx, key, c * TILE, r * TILE, TILE, TILE, x, y)
  }

  // ── zones ──────────────────────────────────────────────────────────────
  drawZone(ctx: CanvasRenderingContext2D, zone: ZoneBox, t: number): void {
    const x = zone.tx * TILE, y = zone.ty * TILE
    if (zone.theme === 'office') this.drawOffice(ctx, zone, x, y, t)
    else if (zone.theme === 'mine') this.drawMine(ctx, zone, x, y)
    else this.drawFarm(ctx, zone, x, y, t)
    // sparse deterministic ground scatter keeps floors lived-in (skip wall row)
    for (let i = 0; i < zone.tw; i++) {
      for (let j = 1; j < zone.th; j++) {
        drawGroundScatter(ctx, zone.theme, zone.tx + i, zone.ty + j, x + i * TILE, y + j * TILE)
      }
    }
  }

  private drawOffice(ctx: CanvasRenderingContext2D, zone: ZoneBox, x: number, y: number, t: number): void {
    // tatami-tan panel floor with the odd carved motif
    for (let i = 0; i < zone.tw; i++) {
      for (let j = 0; j < zone.th; j++) {
        const motif = det(zone.tx + i, zone.ty + j, 71) < 0.07
        this.tile(ctx, 'intfloor', motif ? 14 : 12, motif ? 5 : 1, x + i * TILE, y + j * TILE)
      }
      this.tile(ctx, 'house', 4, 2, x + i * TILE, y) // cream plaster back wall
    }
    // shoji windows break up the back wall
    this.tile(ctx, 'house', 0, 3, x + 2 * TILE, y)
    this.tile(ctx, 'house', 0, 3, x + 10 * TILE, y)
    // an ornate woven rug under the desk + scribe's spot anchors the room
    // (the floor sheet's complete framed 4×4 panel, 62px with its border)
    this.blit(ctx, 'intfloor', 15 * TILE, 0, 62, 62, x + 4 * TILE + 1, y + 3 * TILE + 1)
    // ── back-wall study lineup (left → right) ────────────────────────────
    // library table: cream cloth table stacked with books and a scroll
    this.blit(ctx, 'house', 16 * TILE, 16 * TILE, 48, 32, x, y + TILE)
    this.blit(ctx, 'book', 0, 0, 16, 16, x + 2, y + TILE + 1)
    this.blit(ctx, 'scroll', 0, 0, 16, 16, x + 16, y + TILE + 2)
    this.blit(ctx, 'book', 0, 0, 16, 16, x + 30, y + TILE + 1)
    this.tile(ctx, 'house', 25, 19, x + 3 * TILE, y + TILE)  // drawer cabinet
    this.tile(ctx, 'house', 26, 19, x + 9 * TILE, y + TILE)  // slatted cabinet
    // hanging banners flank the desk; warm lamps light the work
    this.blit(ctx, 'house', 27 * TILE, 20 * TILE, 16, 32, x + 4 * TILE, y)
    this.blit(ctx, 'house', 24 * TILE, 20 * TILE, 16, 32, x + 8 * TILE, y)
    // the second desk: another workbench under the right window, mid-research
    this.tile(ctx, 'house', 29, 8, x + 10 * TILE, y + TILE)
    this.tile(ctx, 'house', 30, 8, x + 11 * TILE, y + TILE)
    this.tile(ctx, 'house', 29, 9, x + 10 * TILE, y + 2 * TILE)
    this.tile(ctx, 'house', 30, 9, x + 11 * TILE, y + 2 * TILE)
    this.blit(ctx, 'scroll', 0, 0, 16, 16, x + 10 * TILE + 1, y + TILE + 1)
    this.blit(ctx, 'hourglass', 0, 0, 16, 16, x + 11 * TILE + 1, y + TILE)
    this.tile(ctx, 'plant', Math.floor(t / 320) % 4, 0, x + 12 * TILE, y + TILE) // corner plant
    // the scribe's desk: a sturdy 2×2 workbench with book + scroll on top
    const wx = zone.workTx * TILE, wy = zone.workTy * TILE
    this.tile(ctx, 'house', 29, 8, wx, wy)
    this.tile(ctx, 'house', 30, 8, wx + TILE, wy)
    this.tile(ctx, 'house', 29, 9, wx, wy + TILE)
    this.tile(ctx, 'house', 30, 9, wx + TILE, wy + TILE)
    this.blit(ctx, 'book', 0, 0, 16, 16, wx - 1, wy - 1)
    this.blit(ctx, 'scroll', 0, 0, 16, 16, wx + 17, wy)
    this.tile(ctx, 'dungeon', 7, 2, wx - TILE, wy)        // warm orb lamps flank the desk
    this.tile(ctx, 'dungeon', 7, 2, wx + 2 * TILE, wy)
    this.blit(ctx, 'house', 30 * TILE, 18 * TILE, 16, 16, wx + 3 * TILE, wy + 2) // paper pile
    // ── storage corner (bottom-right, off the walking lanes) ─────────────
    this.blit(ctx, 'house', 18 * TILE, 14 * TILE + 10, 16, 22, x + 12 * TILE, y + 6 * TILE - 6) // barrel
    this.blit(ctx, 'house', 19 * TILE, 14 * TILE, 16, 22, x + 10 * TILE, y + 7 * TILE - 6) // apple basket
    this.blit(ctx, 'house', 20 * TILE, 14 * TILE, 16, 22, x + 11 * TILE, y + 7 * TILE - 6) // bread basket
    this.blit(ctx, 'house', 21 * TILE, 14 * TILE, 16, 22, x + 12 * TILE, y + 7 * TILE - 6) // grain sack
    this.blit(ctx, 'house', 29 * TILE, 18 * TILE, 16, 16, x, y + 3 * TILE) // scroll bucket by the table
    // lounge nook: swaying plant, stool, fruit table, bucket
    const lx = zone.lounge.tx * TILE, ly = zone.lounge.ty * TILE
    this.tile(ctx, 'plant', Math.floor(t / 320) % 4, 0, lx, ly)
    this.tile(ctx, 'house', 21, 9, lx + TILE, ly)
    this.tile(ctx, 'house', 29, 10, lx + 2 * TILE, ly)
    this.tile(ctx, 'house', 27, 6, lx + 3 * TILE, ly)
  }

  private drawMine(ctx: CanvasRenderingContext2D, zone: ZoneBox, x: number, y: number): void {
    for (let i = 0; i < zone.tw; i++) {
      for (let j = 0; j < zone.th; j++) this.tile(ctx, 'intfloor', 17, 14, x + i * TILE, y + j * TILE)
      this.tile(ctx, 'relief', 9, 1, x + i * TILE, y) // rough rock face
    }
    // the mining face: a big mossy-gray boulder, a gem knocked loose, rubble
    const wx = zone.workTx * TILE, wy = zone.workTy * TILE
    this.blit(ctx, 'nature', 16 * TILE, 8 * TILE, 32, 32, wx, wy)
    this.blit(ctx, 'gem', 0, 0, 16, 16, wx + 30, wy + 16)
    this.blit(ctx, 'fxRockGray', 4 * 16, 0, 16, 16, wx - 6, wy + 22)
    this.tile(ctx, 'dungeon', 7, 2, wx + 2 * TILE, wy - 2) // warm orb lamp lights the face
    // lounge nook: supply pot, crate, another lamp to huddle around
    const lx = zone.lounge.tx * TILE, ly = zone.lounge.ty * TILE
    this.tile(ctx, 'dungeon', 0, 1, lx, ly)
    this.blit(ctx, 'crate', 0, 0, 16, 16, lx + TILE, ly)
    this.tile(ctx, 'dungeon', 7, 2, lx + 3 * TILE, ly)
    // a small outcrop against the back wall
    this.tile(ctx, 'nature', 18, 9, x + 10 * TILE, y + TILE)
  }

  private drawFarm(ctx: CanvasRenderingContext2D, zone: ZoneBox, x: number, y: number, t: number): void {
    for (let i = 0; i < zone.tw; i++) {
      for (let j = 0; j < zone.th; j++) this.tile(ctx, 'field', 1, 4, x + i * TILE, y + j * TILE)
      this.tile(ctx, 'house', 10, 4, x + i * TILE, y) // picket fence along the back
    }
    // the field tileset ships a freestanding 2×2 tilled block — use it whole
    const wx = zone.workTx * TILE, wy = zone.workTy * TILE
    this.tile(ctx, 'field', 3, 0, wx, wy)
    this.tile(ctx, 'field', 4, 0, wx + TILE, wy)
    this.tile(ctx, 'field', 3, 1, wx, wy + TILE)
    this.tile(ctx, 'field', 4, 1, wx + TILE, wy + TILE)
    this.drawCrops(ctx, wx, wy, hashString(zone.tableKey), t)
    // lounge nook: a shade tree, a stump seat, the harvest crate
    const lx = zone.lounge.tx * TILE, ly = zone.lounge.ty * TILE
    this.blit(ctx, 'nature', 6 * TILE, 8 * TILE, 32, 32, lx, ly - TILE)
    this.tile(ctx, 'nature', 4, 8, lx + 2 * TILE, ly)
    this.blit(ctx, 'crate', 0, 0, 16, 16, lx + 3 * TILE, ly)
  }

  /** Tidy procedural crop rows across the 2×2 tilled plot. Each of the 4 rows
   *  is one planting cycling bare dirt → seed mound → sprout → ripe plant on
   *  the shared crop clock, one phase apart per row, so the plot always reads
   *  as a staggered harvest. Plants are tiny and ground-hugging (≤3px tall)
   *  so they sit ON the soil and never bury the farmer working the front edge. */
  private drawCrops(ctx: CanvasRenderingContext2D, wx: number, wy: number, seed: number, t: number): void {
    for (let row = 0; row < 4; row++) {
      const stage = cropStageIndex(t, seed + row, 3)
      const cy = wy + 6 + row * 7              // plant base line, inside the plot
      for (let col = 0; col < 4; col++) {
        const cx = wx + 4 + col * 8            // 4 plants per row, evenly spaced
        const sway = animFrame(t, 620, row * 3 + col) // gentle 2-frame breeze
        if (stage === 0) {                     // seed mound poking from the dirt
          ctx.fillStyle = '#a86a34'
          ctx.fillRect(cx - 1, cy, 3, 1)
          ctx.fillStyle = '#7c4a22'
          ctx.fillRect(cx, cy - 1, 1, 1)
        } else if (stage === 1) {              // small green sprout
          ctx.fillStyle = '#4e9434'
          ctx.fillRect(cx, cy - 1, 1, 2)
          ctx.fillStyle = '#6cb446'
          ctx.fillRect(cx - 1 + sway, cy - 1, 1, 1)
          ctx.fillStyle = '#a8dc6e'
          ctx.fillRect(cx + sway, cy - 2, 1, 1)
        } else if (stage === 2) {              // leafy plant with a ripe fruit
          ctx.fillStyle = 'rgba(60, 30, 8, 0.25)'
          ctx.fillRect(cx - 1, cy + 1, 3, 1)   // contact shadow seats it on the soil
          ctx.fillStyle = '#3e8226'
          ctx.fillRect(cx - 1, cy - 1, 3, 2)
          ctx.fillStyle = '#6cb446'
          ctx.fillRect(cx - 1 + sway, cy - 2, 2, 1)
          ctx.fillStyle = '#e0524c'              // ripe fruit peeking through the leaves
          ctx.fillRect(cx, cy, 1, 1)
          ctx.fillRect(cx + (col % 2 ? 1 : -1), cy - 1, 1, 1)
        }                                      // stage -1: freshly hoed bare row
      }
    }
  }

  // ── characters ─────────────────────────────────────────────────────────
  private actorFor(c: Character): string {
    const cast = CAST[c.theme]
    return c.kind === 'main' ? cast.main : cast.subs[c.palette % cast.subs.length]!
  }

  drawCharacter(ctx: CanvasRenderingContext2D, c: Character, t: number): void {
    const actor = this.actorFor(c)
    const phase = c.palette % 4
    const baseX = c.x * TILE, baseY = c.y * TILE
    // soft contact shadow grounds the sprite on the floor
    ctx.fillStyle = 'rgba(15, 12, 26, 0.30)'
    ctx.fillRect(Math.floor(baseX) + 3, Math.floor(baseY) + 14, 10, 2)

    const swingT = t + phase * 173
    const striking = c.pose === 'work' && !c.walking && (swingT % SWING_MS) >= SWING_MS / 2
    const frame2 = animFrame(t, (c.pose === 'idle' || c.pose === 'loaf') && !c.walking ? IDLE_FRAME_MS : FRAME_MS, phase)
    let facing: Facing = c.facing
    let sheetKey = actor + ':Idle'
    let col = FACING_COL[facing]
    let row = 0
    let { dx, dy } = c.walking ? { dx: 0, dy: 0 } : poseBodyOffset(c.pose, frame2, false)

    if (c.walking) {
      sheetKey = actor + ':Walk'
      row = Math.floor(t / WALK_FRAME_MS + phase) % 4
      dy = 0; dx = 0
    } else if (c.pose === 'work' && c.theme !== 'office') {
      sheetKey = striking ? actor + ':Attack' : actor + ':Idle'
      dy = striking ? 0 : -1
    } else if (c.pose === 'gesture') {
      sheetKey = actor + ':Item' // arms up, announcing — the Item sheet is down-facing only
      facing = 'down'
      col = 0
    }
    const x = Math.floor(baseX + dx), y = Math.floor(baseY + dy)
    const sheet = this.sheet(sheetKey)
    const sy = sheetKey.endsWith(':Walk') ? row * TILE : 0
    const sx = sheetKey.endsWith(':Item') ? 0 : col * TILE
    ctx.drawImage(sheet, sx, sy, TILE, TILE, x, y, TILE, TILE)

    // held tool sells the swing (mine/farm work only)
    if (!c.walking && c.pose === 'work' && c.theme !== 'office') {
      const tool = c.theme === 'mine' ? 'pickaxe' : (c.palette % 2 ? 'sickle' : 'hoe')
      this.drawTool(ctx, tool, facing, striking, x, y)
    }

    // pose glyphs: tiny, the motion is the real status
    if (!c.walking) {
      if (c.pose === 'gesture') {
        ctx.fillStyle = frame2 ? '#ffd700' : '#d4a017'
        ctx.fillRect(x + 13, y - 6, 2, 4)
        ctx.fillRect(x + 13, y - 1, 2, 2)
      } else if (c.pose === 'loaf') {
        const zz = animFrame(t, 1100, phase)
        ctx.fillStyle = 'rgba(255, 248, 236, 0.75)'
        ctx.font = '6px monospace'
        ctx.fillText('z', x + 12, y - 2 - zz)
      } else if (c.pose === 'idle') {
        ctx.fillStyle = 'rgba(255, 248, 236, 0.55)'
        for (let i = 0; i <= frame2 + 1; i++) ctx.fillRect(x + 11 + i * 3, y - 4, 2, 2)
      }
    }

    if (c.kind === 'main') {
      ctx.fillStyle = '#ffd700'
      ctx.fillRect(x + 5, y - 3, 2, 3); ctx.fillRect(x + 7, y - 4, 2, 4); ctx.fillRect(x + 9, y - 3, 2, 3)
    }
  }

  /** The 16px tool sprites point up-right. Raised = as-is beside the hand;
   *  strike = rotated a crisp 90° toward the work. Left-facing mirrors. */
  private drawTool(ctx: CanvasRenderingContext2D, tool: string, facing: Facing, striking: boolean, x: number, y: number): void {
    const img = this.sheet(tool)
    ctx.save()
    if (facing === 'left') {
      ctx.translate(x + 8, y + 8)
      ctx.scale(-1, 1)
      if (striking) ctx.rotate(Math.PI / 2)
      ctx.drawImage(img, striking ? -14 : -16, striking ? -10 : -12, TILE, TILE)
    } else {
      ctx.translate(x + 8, y + 8)
      if (striking) ctx.rotate(Math.PI / 2)
      if (facing === 'up') ctx.drawImage(img, striking ? -16 : 0, striking ? -12 : -14, TILE, TILE)
      else ctx.drawImage(img, striking ? -14 : 2, striking ? -8 : -12, TILE, TILE)
    }
    ctx.restore()
  }

  // ── effects ────────────────────────────────────────────────────────────
  drawEffects(ctx: CanvasRenderingContext2D, zone: ZoneBox, t: number): void {
    const wx = zone.workTx * TILE, wy = zone.workTy * TILE
    const seed = hashString(zone.tableKey) % 4096
    if (zone.theme === 'mine') {
      // gray chips fly off the boulder; the gem glints every few swings
      const ox = wx + 16, oy = wy + 12
      for (const [i, p] of burstParticles(t, seed, 5, 11).entries()) {
        ctx.globalAlpha = Math.min(1, p.alpha * 1.5)
        // frames 1-4 are the small chips; frame 0 is a whole rock
        this.blit(ctx, 'fxRockGray', (((seed + i) % 4) + 1) * 16, 0, 16, 16, ox + p.x - 8, oy + p.y - 8)
      }
      ctx.globalAlpha = 1
      const cycle = Math.floor(t / SWING_MS)
      if (cycle % 3 === 0) {
        const u = (t % SWING_MS) / SWING_MS
        ctx.globalAlpha = Math.max(0, 1 - u)
        this.blit(ctx, 'fxSpark', (Math.floor(t / 90) % 5) * 14, 0, 14, 8, wx + 30, wy + 12 - u * 6)
        ctx.globalAlpha = 1
      }
      if (cycle % 5 === 0) {
        const u = (t % SWING_MS) / SWING_MS
        ctx.fillStyle = `rgba(255, 215, 64, ${(1 - u).toFixed(3)})`
        ctx.font = '6px monospace'
        ctx.fillText('+1', wx + 34, wy + 6 - u * 7)
      }
    } else if (zone.theme === 'farm') {
      // small dirt clods kick up where the hoe lands on the plot's front row —
      // brown only, so nothing green floats over the farmer or the crop rows
      const ox = wx + 16, oy = wy + 28
      for (const [i, p] of burstParticles(t, seed, 3, 7).entries()) {
        ctx.globalAlpha = Math.min(1, p.alpha * 1.5)
        this.blit(ctx, 'fxRock', (((seed + i) % 4) + 1) * 16, 0, 16, 16, ox + p.x - 8, oy + p.y - 8)
      }
      ctx.globalAlpha = 1
    } else {
      // the scribe at work: ink lines crawl across the desk's scroll, the quill bobs
      const px = wx + 21, py = wy + 5, pw = 9, ph = 7
      ctx.fillStyle = 'rgba(74, 52, 34, 0.85)'
      for (const ln of codeLines(t, seed, 3, pw - 1, ph - 1)) {
        ctx.fillRect(px + ln.x, py + ln.y, ln.w, 1)
      }
      const bob = animFrame(t, 240, seed % 2)
      ctx.fillStyle = '#fff8ec'
      ctx.fillRect(px + pw - 2 + bob, py - 6 - bob, 2, 4) // the quill
      ctx.fillStyle = '#2a2438'
      ctx.fillRect(px + pw - 2 + bob, py - 3 - bob, 1, 2) // its ink tip
    }
  }
}
