# yAgents — Design Language

**Register:** product (a tool), but personality-forward — it's a showpiece meant to be shared publicly with the AI-coder community. Charm is a feature, not decoration.

**One-sentence scene:** a developer glances at a cozy pixel office on a second monitor in a dim room at midnight, watching their AI agents bustle around like a tiny RPG village, and grins.

## The vibe (locked)

**Retro pixel-game / nerdy terminal.** Think Stardew Valley, Habbo Hotel, old-school RPG towns, CRT terminals. **NOT** modern SaaS frontend — no slick glassy dashboards, no soft drop-shadows, no rounded-everything, no gradient heroes. Pixely and nerdy is the whole point. (User directive: "keep it pixely and nerdy. Not state of the art front end.")

Skills: use **impeccable** + taste sensibilities for the HTML chrome. Do **not** use the `frontend-design` skill.

## Canvas (the office — the star)

- 16px tiles, integer-scaled, `image-rendering: pixelated`. Never blur a sprite.
- CC0 Kenney roguelike sprites; cohesive warm palette. Motion is the soul: agents *do* their work (2-frame action loops) and work-target effects (chips, crop growth, screen flicker) sell "alive."
- Composition: readable at a glance, charming on a second look. Each room a little stage.

## HTML chrome (start screen, detail panel, frame)

Minimal, terminal-flavored. The pixels are the hero; the chrome stays out of the way.

- **Color:** dark purple-tinted neutrals, never `#000`/`#fff`. Base `#1d1830` (deep indigo-violet). Panels `#2a2438`. Borders chunky and pixel-flat (`#6b5b8a`), 2–4px, hard edges — no soft shadows, no glass. Accent gold `#d4a017` (main-agent / highlights), sparingly. Subagent green, etc. echo the sprite palette.
- **Type:** monospace everywhere (`ui-monospace`). Nerdy, terminal. Chunky pixel feel; small caps/labels welcome.
- **Motion:** chrome motion minimal and snappy (ease-out, ~120–180ms). The canvas carries the spectacle.
- **Borders/edges:** pixel-style — flat fills, hard 1–4px borders, optional 1px inner highlight. No `border-radius` beyond ~2px, no blur, no box-shadow halos.

## Anti-references (the AI-slop traps to avoid)

Modern SaaS dashboards · glassmorphism · soft gradient cards · hero-metric templates · rounded floating panels with blurred backdrops · slick onboarding carousels. If it looks like a Vercel/Linear clone, it's wrong. It should look like a beloved indie pixel game made by a nerd.

## Copy

Terminal-nerdy, playful, terse. No em dashes. Lowercase labels are fine. "watch the demo office," "pick your ~/.claude/projects folder," etc.
