# FlowBlocks design handoff

## Visual direction

Use a calm sky-workshop theme: deep navy and blue-teal depth, soft frosted panels, satin-plastic blocks, and small warm gold accents. The board is always the visual focus. Avoid full-screen confetti, permanent glows, thick outlines, and highly saturated purple covering the whole screen.

## Integration order

1. Replace the existing `30×30` block sources with the `256×256` WebP textures in this pack. Preserve the existing color-index order: blue, cyan, green, orange, pink, red, violet, yellow.
2. Rebuild the Pixi atlas at native resolution. Use mipmapping and linear scaling; target rendered tile sizes around 44–72 CSS pixels depending on the device.
3. Use `flowblocks-sky.png` as a fixed, cover-scaled background. Add a navy overlay of `rgba(8, 18, 45, .18)` on gameplay only so numbers remain readable.
4. Replace the inline start-page logo with `logo-mark.svg`. Keep the wordmark as live text.
5. Use `selection-ring.svg` as a separate Pixi overlay; never bake selection into tile textures.
6. Use `sparkle.svg` for 3–5 particles on ordinary matches. Reserve `soft-burst.svg` for combos of 3 or greater.

## UI tokens

| Token | Value |
| --- | --- |
| Background navy | `#111B3A` |
| Surface | `rgba(20, 39, 79, .82)` |
| Surface border | `rgba(255, 255, 255, .16)` |
| Primary cyan | `#58D6DD` |
| Primary blue | `#4C8FE8` |
| Reward gold | `#FFD66C` |
| Main text | `#F7FAFF` |
| Muted text | `#B8C8E8` |
| Danger | `#FF7081` |
| Panel radius | `20px` |
| Small control radius | `14px` |

## Typography

- Keep Inter for HUD and numbers.
- Use Luckiest Guy only for the FlowBlocks wordmark and short celebration labels.
- Apply tabular numerals to score, wave, and tile moves.
- Remove emoji from the HUD; use simple SVG icons with one visual weight.

## Motion

- Tile press: scale `1 → .94 → 1`, 110 ms total.
- Selection: ring fades in over 90 ms and gently pulses between `.72–1` opacity every 900 ms.
- Swap: 170–210 ms, ease-out cubic. No elastic overshoot during ordinary swaps.
- Match: tile scales to `1.08`, then `.15` while opacity reaches zero, 190 ms.
- Fall: 220–360 ms depending on distance, slight 4 px squash on landing.
- Ordinary match: 3–5 sparkles, 240–380 ms.
- Combo 3+: one soft burst and a compact label near the match; never cover the board.
- Danger state: pulse only the relevant column indicator, not the entire screen.
- Respect `prefers-reduced-motion` by removing loops and reducing travel.

## Start screen

- Use one visual focus: logo mark + wordmark + Play.
- Place secondary actions in 44 px translucent controls at the top corners.
- Make Play a blue-to-cyan rounded rectangle, not hot pink. The current pink CTA competes with the block palette.
- Reduce decorative motion to a slow 8–12 second background drift.

## Gameplay screen

- Use a single frosted HUD bar with four stable slots: exit, wave, score, sound.
- Give the board a dark translucent well with a 1 px highlight and a soft inner shadow.
- Ensure tile numbers have a high-contrast dark ink color or adaptive white/dark choice. Avoid heavy text shadows.
- Keep the ad band visually separated with at least 8 px spacing and do not let effects render over it.

## Store screenshots

- Current promotional screenshots are much louder than the actual product. Re-export them after implementation.
- Use one short headline per screenshot and show genuine gameplay at readable scale.
- Keep effects representative: no artificial explosions or combo values that the game cannot routinely produce.
