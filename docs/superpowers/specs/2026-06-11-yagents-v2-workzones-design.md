# yAgents v2 — "Work Zones" Design Spec

**Date:** 2026-06-11
**Status:** Design approved in conversation; spec awaiting user review before implementation.
**Supersedes parts of:** `2026-06-04-yagents-design.md` (the office/kitchen layout + static rendering). Data layer (adapters, parser, SessionTracker, OfficeStore, liveness) is unchanged.

## 1. Why

v1 reads as a static diorama: agents sit at desks, "activity" is only a status emoji + a 1px bob, and a single central kitchen owns all idling. The user wants a workplace that feels alive: agents **doing** their work, each room **self-contained**, and the whole thing skinnable into different worlds (office / mine / farm) for charm.

## 2. The core model: work zones

One structure underlies every theme:

- **Work zone** = one session. It contains a **work object** (the thing being acted on) and spots for the agents.
- **Main agent** stands/sits at the work object and performs the **work action** when active.
- **Subagents** spawn into the *same* zone and **join the same job** — around the same rock, the same field plot, the same desk pod.
- **Idle/waiting agents** drift to the room's **lounge corner** and loaf.

This replaces v1's "table with seats." The table becomes an active work object; the central kitchen is removed.

## 3. Room & layout model

- **No central kitchen.** Each folder-room is self-contained.
- A room contains one or more **work zones** (one per live session) laid out in a grid, plus a **lounge corner** (bottom-left of the room) with themed loafing props.
- Rooms still attach left-to-right in first-seen order; rooms still grow to fit their zone count.
- **Doorway** on a room edge remains as a walk-in point for new agents (cosmetic).

Geometry (tile units, 16px tiles):
- Room width fits one zone column for now (zones stack vertically); height grows per zone.
- A work zone is ~6×5 tiles: work object centered, main-agent spot adjacent, up to 4 subagent spots arranged around the work object (not in a rigid row — clustered).
- Lounge corner ~4×3 tiles in the room's bottom-left.

## 4. Theme system

- Themes: **office | mine | farm**. Cosmetic only — no effect on logic.
- **Scope = per zone** (`THEME_SCOPE = 'zone'`): each work-zone is themed independently, seeded by the session key (stable across renders). A single room may show mixed themes. Implemented as one constant so we can flip to `'room'` (seed by dirKey) trivially if mixed themes look too busy.
- Theme only selects the sprite set + work object + action animation + lounge props:

| theme | work object | "working" action | idle/loaf | lounge props |
|---|---|---|---|---|
| office | computer desk + monitor | typing at keyboard | lean back in chair | couch, plant, rug |
| mine | rock / ore vein | pickaxe swing | sit on a crate | crates, campfire |
| farm | tilled field plot | hoe / till swing | lie on hay | hay bales, well, fence |

## 5. Status → pose mapping (shared across themes)

The data is unchanged (`AgentStatus`). Each status maps to a pose; the theme picks the sprite/frames for that pose:

| AgentStatus | pose | notes |
|---|---|---|
| typing / running / browsing | **work action** (2-frame swing/type loop) | the "doing something" state |
| reading | **inspect** (lean toward work object, 1–2 frame) | studying |
| delegating | **gesture at work object** | directing subagents |
| thinking | **idle-at-station** (slow breathe) | still at the zone |
| waiting | **loaf in lounge** (walks to lounge corner, sits/lies) | the "needs you" signal, now per-room |
| working (generic/unknown tool) | work action | fallback |
| idle | loaf in lounge | |

Subagents use the same mapping driven by their own `SubagentView.status` (individual subagent animation is still the separate future task; until then they show the generic work action while present).

## 6. Animation (v1 of motion = 2 frames)

- **Body:** 2-frame loops per pose, frame index = `Math.floor(t / FRAME_MS) % 2` (reuse the existing bob clock). Walk cycle already exists.
- **Work-target effects carry the "alive" feeling** and are cheap, theme-specific, no new character art:
  - mine: rock chips fly + occasional "+1 ore" puff on swing
  - farm: dirt puff on till + a crop sprite that pops up over time
  - office: monitor-glow flicker + tiny code-line scroll on the screen
- **Frames sourcing:** compose 2-frame loops from existing Kenney sheets where a pose exists; where a real swing/type frame doesn't exist, draw a small custom 2-frame **tool overlay** (pickaxe/hoe/arm) on top of the base character sprite. This keeps us on CC0 assets and avoids a license hunt now.
- Escalation (later task): richer multi-frame action cycles, possibly a dedicated animated character set.

## 7. Assets

- Reuse: `chars.png` (characters), `indoor.png` (office furniture), `rpg.png` (floors/walls, plus its outdoor rock/tree/fence tiles for mine/farm).
- Likely add (CC0, Kenney): a farm/outdoor tile pack for field plots, crops, hay, well, fence; rock/ore tiles (the roguelike RPG sheet already has boulders/ore — verify in the plan). Any new sheet goes in `app/public/sprites/` with its CC0 source noted in `LICENSE.txt`.
- All new tiles are added to `atlas.ts` `TILES` with verified (col,row) coords (same screenshot-driven verification loop used in v1's graphics task).

## 8. What stays unchanged

- Data layer end-to-end: adapters (FolderPicker / LocalServer / Demo), `parseLine`, `SessionTracker` (incl. the `Agent`-tool fix), `OfficeStore` (incl. bounded-waiting liveness).
- Hierarchy semantics (main agent + its subagents per session).
- Live-only office, 30-min waiting window, click-for-detail panel, pan/zoom, sprite-with-flat-fallback, demo mode, GitHub Pages + npx server.

## 9. Components touched

- `layout/layoutEngine.ts` — rewrite: emit **work zones** (work-object rect + main spot + clustered subagent spots) and a **lounge rect** per room; drop the kitchen room. New `Zone`/`Lounge` shapes in the floor plan.
- `render/atlas.ts` — expand with theme tile sets + work objects + lounge props + any new sheet.
- `render/renderer.ts` — draw themed rooms/zones/lounges; pose-based 2-frame character drawing; work-target effect emitters.
- `render/characters.ts` — extend with pose state + target position that depends on status (work spot vs lounge), so a waiting agent walks to the lounge.
- New `render/theme.ts` — theme assignment (seeded) + theme→tiles/poses tables + status→pose map.
- New `render/effects.ts` — lightweight particle/effect system for work-target flair (chips, puffs, crop growth, screen flicker).
- `demo.ts` — extend the scripted office so the demo shows all three themes, subagents joining a job, and idle loafing (for screenshot/dev verification).

## 10. Testing

- **Pure-logic, unit-tested:** theme assignment is deterministic per seed; status→pose mapping is total (every `AgentStatus` → a pose); layout emits zones/lounges with correct geometry (zones inside room bounds, lounge in corner, subagent spots clustered near the work object, waiting agents routed to lounge).
- **Effects system:** spawn/age/expire is deterministic given a seeded clock (no `Math.random` — vary by index/time like v1).
- **Renderer:** smoke only (boots, draws a frame), plus screenshot-driven visual verification via headless Chrome against `?demo=1` (the v1 workflow).
- Keep the full suite green; add tests alongside the new pure modules.

## 11. v2 scope

**In:** work-zone room model, per-room lounges, kitchen removal, per-zone random themes (office/mine/farm), status→pose mapping, 2-frame body animation, work-target effects, themed assets, demo covering all themes, redeploy.

**Out (later):** individual subagent animation from nested `subagents/*.jsonl` (already-scoped separate task), richer multi-frame action cycles / dedicated animated character set, theme-as-work-type meaning, sound, user-defined themes, day/night ambient.

## 12. Risks / open points

- **Mixed themes per room** (per-zone scope) may look chaotic; mitigated by the one-line `THEME_SCOPE` toggle to per-room.
- **Custom tool-overlay frames** are the riskiest art bit; fallback is "no overlay, just body 2-frame + work-target effects," which still reads as active.
- This is a **renderer + layout rewrite**; the data layer is untouched, so blast radius is contained to `layout/` and `render/`.
