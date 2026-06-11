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
import type { Region, Station } from '../../layout/layoutEngine'
import { TILE } from '../../layout/layoutEngine'
import { packCell, unpackCell, quadrantSources, isInterior } from '../../layout/terrain'
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
      ['camp', 'tileset/TilesetCamp.png'],
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

  // ── islands ────────────────────────────────────────────────────────────
  // Each folder is one organic landmass: autotiled themed ground (the field
  // tileset's 5×3 blob blocks, rendered per 8px quadrant), a theme landmark
  // (tent / mine entrance / shade tree), one station per session, the shared
  // lounge, seeded filler props and a signpost at the gateway. Everything in
  // drawRegionBase is static — the renderer caches it to an offscreen canvas.
  // The few animated ground details (plants, crops) live in drawRegionLive.

  // ground autotile block per theme: base row within TilesetField
  private static GROUND_ROW: Record<Theme, number> = { mine: 0, farm: 3, office: 6 }

  drawRegionBase(ctx: CanvasRenderingContext2D, region: Region): void {
    this.drawShallows(ctx, region)
    this.drawIslandGround(ctx, region)
    // sparse deterministic ground scatter keeps the interior lived-in
    const has = (tx: number, ty: number) => region.cells.has(packCell(tx, ty))
    for (const p of region.cells) {
      const { tx, ty } = unpackCell(p)
      if (!isInterior(has, tx, ty)) continue
      drawGroundScatter(ctx, region.theme, tx, ty, tx * TILE, ty * TILE)
    }
    // static filler props (animated plants render in the live pass)
    for (const f of this.fillerItems(region)) {
      const px = f.tx * TILE, py = f.ty * TILE
      if (f.kind === 'tree') this.blit(ctx, 'nature', 6 * TILE, 8 * TILE, 32, 32, px - 8, py - 16)
      else if (f.kind === 'bush') this.tile(ctx, 'nature', 1, 10, px, py)
      else if (f.kind === 'bush2') this.tile(ctx, 'nature', 5, 10, px, py)
      else if (f.kind === 'rock') this.tile(ctx, 'nature', 18, 9, px, py)
      else if (f.kind === 'rockLoose') this.blit(ctx, 'fxRockGray', 0, 0, 16, 16, px, py)
      else if (f.kind === 'stump') this.tile(ctx, 'nature', 4, 8, px, py)
      else if (f.kind === 'mound') this.blit(ctx, 'fxRock', 0, 0, 16, 16, px, py)
      // 'plant' → live pass
    }
    if (region.theme === 'office') this.drawOfficeRegion(ctx, region)
    else if (region.theme === 'mine') this.drawMineRegion(ctx, region)
    else this.drawFarmRegion(ctx, region)
    this.drawSignpost(ctx, region)
  }

  drawRegionLive(ctx: CanvasRenderingContext2D, region: Region, t: number): void {
    const frame = Math.floor(t / 320) % 4
    if (region.theme === 'office') {
      // swaying plants: filler picks + the lounge's corner plant
      for (const f of this.fillerItems(region)) {
        if (f.kind === 'plant') this.tile(ctx, 'plant', frame, 0, f.tx * TILE, f.ty * TILE)
      }
      this.tile(ctx, 'plant', frame, 0, region.lounge.tx * TILE, region.lounge.ty * TILE)
    } else if (region.theme === 'farm') {
      // growing crop rows on every plot
      for (const st of region.stations) {
        this.drawCrops(ctx, st.workTx * TILE, st.workTy * TILE, hashString(st.tableKey), t)
      }
    } else {
      // warm lamp flicker at the mine entrance
      const lm = region.landmark
      const glow = 0.05 + 0.04 * animFrame(t, 700, region.seed % 2)
      ctx.fillStyle = `rgba(255, 184, 90, ${glow.toFixed(3)})`
      ctx.fillRect(lm.tx * TILE + 4, (lm.ty + 2) * TILE, 3.5 * TILE, 1.8 * TILE)
    }
  }

  /** 1-tile ring of lighter "shallows" water hugging the coast, so the island
   *  visibly sits IN the sea rather than floating on a void. */
  private drawShallows(ctx: CanvasRenderingContext2D, region: Region): void {
    const has = (tx: number, ty: number) => region.cells.has(packCell(tx, ty))
    const rim = new Set<number>()
    for (const p of region.cells) {
      const { tx, ty } = unpackCell(p)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && !has(tx + dx, ty + dy)) rim.add(packCell(tx + dx, ty + dy))
        }
      }
    }
    ctx.fillStyle = 'rgba(96, 130, 200, 0.13)'
    for (const p of rim) {
      const { tx, ty } = unpackCell(p)
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE)
    }
  }

  /** Autotiled themed ground over the island's blob mask: interior cells are a
   *  single center tile; coast cells assemble from four 8×8 quadrants of the
   *  theme's 5×3 autotile block (see terrain.quadrantSources). */
  private drawIslandGround(ctx: CanvasRenderingContext2D, region: Region): void {
    const base = NinjaSkin.GROUND_ROW[region.theme]
    const has = (tx: number, ty: number) => region.cells.has(packCell(tx, ty))
    for (const p of region.cells) {
      const { tx, ty } = unpackCell(p)
      const x = tx * TILE, y = ty * TILE
      if (isInterior(has, tx, ty)) { this.tile(ctx, 'field', 1, base + 1, x, y); continue }
      const quads = quadrantSources(
        has(tx, ty - 1), has(tx, ty + 1), has(tx + 1, ty), has(tx - 1, ty),
        has(tx - 1, ty - 1), has(tx + 1, ty - 1), has(tx - 1, ty + 1), has(tx + 1, ty + 1))
      for (const q of quads) {
        this.blit(ctx, 'field', q.c * TILE + q.qx * 8, (base + q.r) * TILE + q.qy * 8, 8, 8, x + q.qx * 8, y + q.qy * 8)
      }
    }
  }

  /** Sparse mid-size props on the island's free interior (never on a station,
   *  the lounge or the landmark). Seeded by the absolute tile, so props never
   *  move as the island grows — new ground simply brings new props. */
  private fillerItems(region: Region): { tx: number; ty: number; kind: 'plant' | 'tree' | 'bush' | 'bush2' | 'rock' | 'rockLoose' | 'stump' | 'mound' }[] {
    const out: { tx: number; ty: number; kind: 'plant' | 'tree' | 'bush' | 'bush2' | 'rock' | 'rockLoose' | 'stump' | 'mound' }[] = []
    const has = (tx: number, ty: number) => region.cells.has(packCell(tx, ty))
    const inRect = (tx: number, ty: number, r: { tx: number; ty: number; tw: number; th: number }) =>
      tx >= r.tx - 1 && tx < r.tx + r.tw + 1 && ty >= r.ty - 1 && ty < r.ty + r.th + 1
    const blocked = (tx: number, ty: number) =>
      inRect(tx, ty, region.lounge) || inRect(tx, ty, region.landmark) ||
      region.stations.some(s => inRect(tx, ty, s))
    for (const p of region.cells) {
      const { tx, ty } = unpackCell(p)
      if (!isInterior(has, tx, ty) || blocked(tx, ty)) continue
      // the odd shade tree on grassy islands (needs a clear 2×2)
      if (region.theme !== 'mine' && det(tx, ty, 96) < 0.016 &&
          has(tx + 1, ty) && has(tx, ty + 1) && has(tx + 1, ty + 1) &&
          !blocked(tx + 1, ty) && !blocked(tx, ty + 1) && !blocked(tx + 1, ty + 1)) {
        out.push({ tx, ty, kind: 'tree' })
        continue
      }
      if (det(tx, ty, 97) > (region.theme === 'mine' ? 0.1 : 0.045)) continue
      const r = det(tx, ty, 98)
      if (region.theme === 'office') {
        out.push({ tx, ty, kind: r < 0.3 ? 'plant' : r < 0.6 ? 'bush' : r < 0.85 ? 'bush2' : 'stump' })
      } else if (region.theme === 'mine') {
        out.push({ tx, ty, kind: r < 0.5 ? 'rock' : r < 0.85 ? 'rockLoose' : 'mound' })
      } else {
        out.push({ tx, ty, kind: r < 0.4 ? 'stump' : r < 0.75 ? 'bush' : 'mound' })
      }
    }
    return out
  }

  /** The folder signpost at the island's gateway (its coast cell facing the
   *  world). The label itself renders in screen space so it's always legible. */
  private drawSignpost(ctx: CanvasRenderingContext2D, region: Region): void {
    const x = region.gateway.tx * TILE, y = region.gateway.ty * TILE
    ctx.fillStyle = '#2c1e10' // post shadow/outline
    ctx.fillRect(x + 6, y - 1, 4, 14)
    ctx.fillStyle = '#6e4a2a' // the post
    ctx.fillRect(x + 7, y, 2, 12)
    ctx.fillStyle = '#2c1e10' // board outline
    ctx.fillRect(x + 1, y - 1, 14, 9)
    ctx.fillStyle = '#a9743f' // the board
    ctx.fillRect(x + 2, y, 12, 7)
    ctx.fillStyle = '#3c2a16' // carved scratches
    ctx.fillRect(x + 4, y + 2, 8, 1)
    ctx.fillRect(x + 4, y + 4, 6, 1)
  }

  /** Scholar's camp: the big tent landmark, then a rug + desk station per
   *  session and the shared lounge — a study that lives outdoors. */
  private drawOfficeRegion(ctx: CanvasRenderingContext2D, region: Region): void {
    const lm = region.landmark
    const lx0 = lm.tx * TILE, ly0 = lm.ty * TILE
    // the scholars' tent (camp tileset), flanked by a lamp and the scroll bucket
    this.blit(ctx, 'camp', 64, 0, 48, 48, lx0 + 8, ly0 + 8)
    this.tile(ctx, 'dungeon', 7, 2, lx0 - 8, ly0 + 40)
    this.blit(ctx, 'house', 29 * TILE, 18 * TILE, 16, 16, lx0 + 58, ly0 + 42)
    this.blit(ctx, 'book', 0, 0, 16, 16, lx0 + 60, ly0 + 28)
    // ── one scribe station per session ───────────────────────────────────
    for (const st of region.stations) {
      const wx = st.workTx * TILE, wy = st.workTy * TILE
      const h = hashString(st.tableKey)
      // ornate woven rug under desk + scribe (the floor sheet's framed 4×4 panel)
      this.blit(ctx, 'intfloor', 15 * TILE, 0, 62, 62, wx - TILE + 1, wy - 6)
      // the scribe's desk: a sturdy 2×2 workbench with book + scroll on top
      this.tile(ctx, 'house', 29, 8, wx, wy)
      this.tile(ctx, 'house', 30, 8, wx + TILE, wy)
      this.tile(ctx, 'house', 29, 9, wx, wy + TILE)
      this.tile(ctx, 'house', 30, 9, wx + TILE, wy + TILE)
      this.blit(ctx, 'book', 0, 0, 16, 16, wx - 1, wy - 1)
      this.blit(ctx, 'scroll', 0, 0, 16, 16, wx + 17, wy)
      this.tile(ctx, 'dungeon', 7, 2, wx - TILE, wy)        // warm orb lamps flank the desk
      this.tile(ctx, 'dungeon', 7, 2, wx + 2 * TILE, wy)
      // station flavor varies per session: paper pile, spare book, or scroll bucket
      if (h % 3 === 0) this.blit(ctx, 'house', 30 * TILE, 18 * TILE, 16, 16, wx + 3 * TILE, wy + 2)
      else if (h % 3 === 1) this.blit(ctx, 'book', 0, 0, 16, 16, wx + 3 * TILE + 2, wy + 4)
      else this.blit(ctx, 'house', 29 * TILE, 18 * TILE, 16, 16, wx + 3 * TILE, wy + 2)
    }
    // the SHARED lounge: swaying plant (live pass), stools, fruit table, bucket
    const lx = region.lounge.tx * TILE, ly = region.lounge.ty * TILE
    this.tile(ctx, 'house', 21, 9, lx + TILE, ly)
    this.tile(ctx, 'house', 29, 10, lx + 2 * TILE, ly)
    this.tile(ctx, 'house', 27, 6, lx + 3 * TILE, ly)
    this.tile(ctx, 'house', 21, 9, lx + 4 * TILE, ly)
  }

  /** Dig site: a timbered mine entrance landmark, an ore face per session. */
  private drawMineRegion(ctx: CanvasRenderingContext2D, region: Region): void {
    const lm = region.landmark
    const x0 = lm.tx * TILE, y0 = lm.ty * TILE
    // rocky hill (two mossy boulders) with a dark timbered opening
    this.blit(ctx, 'nature', 16 * TILE, 8 * TILE, 32, 32, x0 + 4, y0 + 2)
    this.blit(ctx, 'nature', 16 * TILE, 8 * TILE, 32, 32, x0 + 28, y0 + 6)
    // the cave mouth: black opening framed by timber posts + lintel
    const cx = x0 + 20, cy = y0 + 26
    ctx.fillStyle = '#0d0c14'
    ctx.fillRect(cx + 2, cy + 4, 16, 12)
    ctx.fillRect(cx + 4, cy + 1, 12, 4)
    ctx.fillStyle = '#5a4026' // timber frame
    ctx.fillRect(cx, cy + 2, 3, 14)
    ctx.fillRect(cx + 17, cy + 2, 3, 14)
    ctx.fillRect(cx - 1, cy, 22, 3)
    ctx.fillStyle = '#3a2814' // frame shadow
    ctx.fillRect(cx - 1, cy + 3, 1, 11)
    ctx.fillRect(cx + 20, cy + 3, 1, 11)
    this.tile(ctx, 'dungeon', 7, 2, cx - 14, cy + 2)  // lamp by the entrance
    this.blit(ctx, 'fxRockGray', 0, 0, 16, 16, cx + 22, cy + 10) // spoil heap
    // a cart-track of sleepers from the entrance south a few tiles
    ctx.fillStyle = 'rgba(60, 42, 22, 0.55)'
    for (let i = 1; i <= 3; i++) ctx.fillRect(cx + 4, cy + 14 + i * 7, 12, 2)
    // ── one ore face per session ─────────────────────────────────────────
    for (const st of region.stations) {
      const wx = st.workTx * TILE, wy = st.workTy * TILE
      const h = hashString(st.tableKey)
      // the mining face: a big mossy-gray boulder, a gem knocked loose, rubble
      this.blit(ctx, 'nature', 16 * TILE, 8 * TILE, 32, 32, wx, wy)
      this.blit(ctx, 'gem', 0, 0, 16, 16, wx + 30, wy + 16)
      this.blit(ctx, 'fxRockGray', 4 * 16, 0, 16, 16, wx - 6, wy + 22)
      this.tile(ctx, 'dungeon', 7, 2, wx + 2 * TILE, wy - 2) // warm orb lamp lights the face
      // per-session flavor: a spare rock pile or a second gem in the rubble
      if (h % 2 === 0) this.blit(ctx, 'fxRockGray', 0, 0, 16, 16, wx + 34, wy + 28)
      else this.blit(ctx, 'gem', 0, 0, 16, 16, wx - 10, wy + 4)
    }
    // the SHARED lounge: supply pot, crate, a lamp to huddle around
    const lx = region.lounge.tx * TILE, ly = region.lounge.ty * TILE
    this.tile(ctx, 'dungeon', 0, 1, lx, ly)
    this.blit(ctx, 'crate', 0, 0, 16, 16, lx + TILE, ly)
    this.tile(ctx, 'dungeon', 7, 2, lx + 4 * TILE, ly)
  }

  /** Farmstead: shade-tree landmark with the harvest stash, a fenced crop
   *  plot per session. Crops themselves grow in the live pass. */
  private drawFarmRegion(ctx: CanvasRenderingContext2D, region: Region): void {
    const lm = region.landmark
    const x0 = lm.tx * TILE, y0 = lm.ty * TILE
    // the big shade tree with the harvest stash beneath it
    this.blit(ctx, 'nature', 6 * TILE, 8 * TILE, 32, 32, x0 + 12, y0 + 4)
    this.blit(ctx, 'house', 18 * TILE, 14 * TILE + 10, 16, 22, x0 + 46, y0 + 24) // barrel
    this.blit(ctx, 'house', 19 * TILE, 14 * TILE, 16, 22, x0 + 2, y0 + 32)       // apple basket
    this.blit(ctx, 'crate', 0, 0, 16, 16, x0 + 46, y0 + 44)
    // ── one crop plot per session ────────────────────────────────────────
    for (const st of region.stations) {
      const wx = st.workTx * TILE, wy = st.workTy * TILE
      // a short picket fence shields the plot's north edge
      for (let i = -1; i <= 2; i++) this.tile(ctx, 'house', 10, 4, wx + i * TILE, wy - TILE)
      // the field tileset ships a freestanding 2×2 tilled block — use it whole
      this.tile(ctx, 'field', 3, 0, wx, wy)
      this.tile(ctx, 'field', 4, 0, wx + TILE, wy)
      this.tile(ctx, 'field', 3, 1, wx, wy + TILE)
      this.tile(ctx, 'field', 4, 1, wx + TILE, wy + TILE)
      // per-session flavor: a harvest crate or a bush by the plot
      const h = hashString(st.tableKey)
      if (h % 2 === 0) this.blit(ctx, 'crate', 0, 0, 16, 16, wx + 3 * TILE, wy + TILE)
      else this.tile(ctx, 'nature', 4, 8, wx - TILE - 2, wy - 2)
    }
    // the SHARED lounge: a stump seat and the lunch crate under the open sky
    const lx = region.lounge.tx * TILE, ly = region.lounge.ty * TILE
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
  drawEffects(ctx: CanvasRenderingContext2D, station: Station, t: number): void {
    const wx = station.workTx * TILE, wy = station.workTy * TILE
    const seed = hashString(station.tableKey) % 4096
    if (station.theme === 'mine') {
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
    } else if (station.theme === 'farm') {
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
