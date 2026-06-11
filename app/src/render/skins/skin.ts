// The swappable look of the world. A Skin owns every sprite decision:
// which tiles ground an island, which sheet animates a character, which
// particles fly when work happens. The Renderer owns everything else
// (camera, rAF loop, terrain caching, y-sort, hit testing, screen chrome)
// and delegates drawing to the active skin — or to its built-in flat-color
// fallback while no skin is ready. Adding a new style (KenneySkin,
// LegoSkin...) means implementing this interface and wiring it in main.ts.
//
// Terrain is split in two passes so the renderer can cache the heavy part:
//  • drawRegionBase — STATIC terrain (autotiled ground, structures, props,
//    scatter). The renderer renders this ONCE into an offscreen canvas per
//    island and blits it every frame; it must not depend on time.
//  • drawRegionLive — the few ANIMATED ground details (swaying plants,
//    growing crops), drawn live every frame on top of the cached base.
import type { Region, Station } from '../../layout/layoutEngine'
import type { Character } from '../characters'

export interface Skin {
  readonly name: string
  /** true once load() has resolved and every sheet is drawable */
  readonly ready: boolean
  /** Load sprite sheets from `base` (default './sprites/<skin>/').
   *  Resolve when ready; reject → the renderer keeps its flat fallback. */
  load(base?: string): Promise<void>
  /** Static island terrain: ground + coast, landmark, stations, lounge, props. */
  drawRegionBase(ctx: CanvasRenderingContext2D, region: Region): void
  /** Animated ground details for one island (plants, crops). Every frame. */
  drawRegionLive(ctx: CanvasRenderingContext2D, region: Region, t: number): void
  /** One animated character: sheet by theme/kind, frame by pose + facing + time. */
  drawCharacter(ctx: CanvasRenderingContext2D, char: Character, t: number): void
  /** Work-target effects for one station. Called only while someone works there. */
  drawEffects(ctx: CanvasRenderingContext2D, station: Station, t: number): void
}
