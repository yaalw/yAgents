// Kenney roguelike sheets: 16px tiles on a 17px stride (1px spacing).
// Tile refs are (sheet, col, row) — see app/public/sprites/LICENSE.txt for sources.
export type SheetName = 'indoor' | 'rpg' | 'chars' | 'city'
export interface TileRef { s: SheetName; c: number; r: number }

const STRIDE = 17
const T = 16

export class Atlas {
  private constructor(private sheets: Record<SheetName, HTMLImageElement>) {}

  static async load(base = './sprites/'): Promise<Atlas> {
    const one = (file: string) => new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.onerror = () => rej(new Error('sprite sheet failed to load: ' + file))
      img.src = base + file
    })
    const [indoor, rpg, chars, city] = await Promise.all([one('indoor.png'), one('rpg.png'), one('chars.png'), one('city.png')])
    return new Atlas({ indoor, rpg, chars, city })
  }

  draw(ctx: CanvasRenderingContext2D, ref: TileRef, x: number, y: number): void {
    ctx.drawImage(this.sheets[ref.s], ref.c * STRIDE, ref.r * STRIDE, T, T, x, y, T, T)
  }
}

const t = (s: SheetName, c: number, r: number): TileRef => ({ s, c, r })

export const TILES = {
  // floors (rpg sheet, solid color blocks bottom-left: brown / gray / cream)
  floorWood: t('rpg', 1, 26),
  floorKitchen: t('rpg', 7, 26),
  // wall face band along a room's top edge (rpg sheet, interior walls)
  wallTan: t('rpg', 14, 12),
  wallGray: t('rpg', 20, 12),
  // table assembled 4 wide × 2 tall (indoor sheet, long tables)
  tableTopL: t('indoor', 0, 9),
  tableTopM: t('indoor', 1, 9),
  tableTopR: t('indoor', 2, 9),
  tableBotL: t('indoor', 0, 10),
  tableBotM: t('indoor', 1, 10),
  tableBotR: t('indoor', 2, 10),
  // chairs, 4 directions (indoor sheet)
  chairDown: t('indoor', 0, 6),
  chairUp: t('indoor', 0, 7),
  chairLeft: t('indoor', 2, 6),
  chairRight: t('indoor', 3, 6),
  // kitchen set (indoor sheet)
  counterSink: t('indoor', 0, 12),
  counterDrawers: t('indoor', 1, 12),
  stove: t('indoor', 14, 14),
  couchL: t('indoor', 16, 8),
  couchM: t('indoor', 17, 8),
  couchR: t('indoor', 18, 8),
  plant: t('indoor', 16, 0),
} as const

// Composed characters (chars sheet col 1, rows 5-10 are fully dressed).
// Subagents cycle by palette hash; the main agent is the white-bearded elder
// at row 11 + the procedural crown drawn on top.
export const CHAR_TILES: TileRef[] = [
  t('chars', 1, 5), t('chars', 1, 6), t('chars', 1, 7),
  t('chars', 1, 8), t('chars', 1, 9), t('chars', 1, 10),
]
export const MAIN_CHAR: TileRef = t('chars', 1, 11)

// ── v2 themed work-zones ────────────────────────────────────────────────────
// Every tile below was verified by eye against the sheets (16px tiles,
// 17px stride). city.png is Kenney's Roguelike Modern City pack — same
// format and palette family as the other sheets.

export type Theme = 'office' | 'mine' | 'farm'

export interface ThemeTiles {
  floor: TileRef
  /** back-wall strip drawn along a room's top edge */
  wall: TileRef
  /** the thing the agent acts on; 1-4 tiles drawn as a small connected cluster.
   *  farm: 4 tiles = a 2x2 tilled plot in order TL, TR, BL, BR.
   *  mine: 3 tiles = boulder, ore pile, cart — an L-shaped mining face. */
  workObject: TileRef[]
  /** 2-4 loafing props for the theme */
  lounge: TileRef[]
  /** ambient set dressing, placed (zone-relative tiles) so props read as
   *  arranged, never dropped in a corner or on the label row */
  deco?: { ref: TileRef; tx: number; ty: number }[]
  /** FARM ONLY: crop growth sprites, sprout → mid → ripe */
  cropStages?: TileRef[]
}

export const THEME_TILES: Record<Theme, ThemeTiles> = {
  office: {
    floor: t('rpg', 1, 26),       // warm brown wood floor block
    wall: t('rpg', 14, 12),       // tan paneled interior wall with cream trim
    workObject: [
      t('indoor', 7, 4),          // pedestal desk, front view
      t('city', 27, 8),           // chunky gray terminal w/ green phosphor screen
    ],
    lounge: [
      t('indoor', 14, 9),         // orange armchair
      t('indoor', 16, 0),         // potted plant
      t('indoor', 22, 8),         // small bordered rug / doormat
      t('rpg', 43, 12),           // bookshelf with colored books
    ],
    deco: [
      { ref: t('rpg', 45, 12), tx: 9, ty: 1 },   // tall bookshelf against the back wall
      { ref: t('indoor', 16, 0), tx: 10, ty: 1 }, // potted plant beside it
    ],
  },
  mine: {
    floor: t('rpg', 7, 0),        // gray speckled cave stone
    wall: t('rpg', 38, 18),       // brown rock face with embedded stones
    workObject: [
      t('rpg', 54, 19),           // the boulder being mined (big brown rock)
      t('rpg', 42, 11),           // gold ore pile knocked loose beside it
      t('rpg', 49, 21),           // wooden mine cart being loaded below
    ],
    lounge: [
      t('rpg', 47, 17),           // large brown supply crate
      t('rpg', 15, 8),            // campfire (logs + flame)
      t('rpg', 53, 21),           // chopping stump with an axe
    ],
    deco: [
      { ref: t('rpg', 55, 19), tx: 9, ty: 1 },   // rock pile at the base of the rock face
      { ref: t('rpg', 54, 20), tx: 10, ty: 1 },  // mossy rocks beside it — a little outcrop
    ],
  },
  farm: {
    floor: t('rpg', 5, 0),        // speckled grass
    wall: t('rpg', 52, 23),       // split-rail wooden fence (transparent bg)
    workObject: [
      t('rpg', 6, 1), t('rpg', 6, 1),   // tilled dirt plot, 2x2 — solid soil
      t('rpg', 6, 1), t('rpg', 6, 1),   // squares; crops grow on top
    ],
    lounge: [
      t('rpg', 23, 11),           // fruit tree heavy with red apples
      t('rpg', 56, 11),           // plump grain sack
      t('rpg', 46, 23),           // fence gate segment
    ],
    deco: [
      { ref: t('rpg', 24, 11), tx: 9, ty: 1 },   // leafy green bush along the fence
      { ref: t('rpg', 25, 11), tx: 10, ty: 1 },  // white wildflower tucked at its side
    ],
    cropStages: [
      t('rpg', 22, 10),           // sprout: tiny green shoots
      t('rpg', 22, 11),           // mid: leafy tuft
      t('rpg', 24, 9),            // ripe: bush heavy with orange berries
    ],
  },
}
