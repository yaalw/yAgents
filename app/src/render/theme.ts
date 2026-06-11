import type { Theme } from './atlas'
import type { AgentStatus } from '../types'
import { hashString } from '../util/rng'

// Each work-zone is themed independently and stably (seeded by the session key),
// so a zone keeps its identity across renders. Flip THEME_SCOPE to 'room' to make
// a whole folder-room share one theme (seed by dirKey) instead.
export const THEME_SCOPE: 'zone' | 'room' = 'zone'

const THEMES: Theme[] = ['office', 'mine', 'farm']

/** Stable theme for a zone. Pass the session/table key and the room's dirKey;
 *  which one seeds the choice depends on THEME_SCOPE. */
export function themeFor(zoneKey: string, dirKey: string): Theme {
  const seed = THEME_SCOPE === 'zone' ? zoneKey : dirKey
  return THEMES[hashString(seed) % THEMES.length]!
}

// What an agent's body is doing, derived from its data status. The theme decides
// which sprite/animation renders each pose; the pose itself is theme-independent.
export type Pose = 'work' | 'inspect' | 'gesture' | 'idle' | 'loaf'

export function poseFor(status: AgentStatus): Pose {
  switch (status) {
    case 'typing':
    case 'running':
    case 'browsing':
    case 'working':
      return 'work'
    case 'reading':
      return 'inspect'
    case 'delegating':
      return 'gesture'
    case 'thinking':
      return 'idle'
    case 'waiting':
    case 'idle':
      return 'loaf'
  }
}

/** Agents in a 'loaf' pose leave their work spot and idle in the zone's lounge nook. */
export function loafs(status: AgentStatus): boolean {
  return poseFor(status) === 'loaf'
}
