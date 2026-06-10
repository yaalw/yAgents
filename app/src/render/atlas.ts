// Kenney roguelike sheets: 16px tiles on a 17px stride (1px spacing).
// Tile refs are (sheet, col, row) — see app/public/sprites/LICENSE.txt for sources.
export type SheetName = 'indoor' | 'rpg' | 'chars'
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
    const [indoor, rpg, chars] = await Promise.all([one('indoor.png'), one('rpg.png'), one('chars.png')])
    return new Atlas({ indoor, rpg, chars })
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
