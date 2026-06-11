// The swappable look of the office. A Skin owns every sprite decision:
// which tiles floor a room, which sheet animates a character, which
// particles fly when work happens. The Renderer owns everything else
// (camera, rAF loop, y-sort, hit testing, room chrome) and delegates
// drawing to the active skin — or to its built-in flat-color fallback
// while no skin is ready. Adding a new style (KenneySkin, LegoSkin...)
// means implementing this interface and wiring it in main.ts.
import type { RoomBox, Station } from '../../layout/layoutEngine'
import type { Character } from '../characters'

export interface Skin {
  readonly name: string
  /** true once load() has resolved and every sheet is drawable */
  readonly ready: boolean
  /** Load sprite sheets from `base` (default './sprites/<skin>/').
   *  Resolve when ready; reject → the renderer keeps its flat fallback. */
  load(base?: string): Promise<void>
  /** One continuous room: floor, back wall, every station, the shared lounge. */
  drawRoom(ctx: CanvasRenderingContext2D, room: RoomBox, t: number): void
  /** One animated character: sheet by theme/kind, frame by pose + facing + time. */
  drawCharacter(ctx: CanvasRenderingContext2D, char: Character, t: number): void
  /** Work-target effects for one station. Called only while someone works there. */
  drawEffects(ctx: CanvasRenderingContext2D, station: Station, t: number): void
}
