# FlowBlocks — native-feel design pack

## Goal

Move the game away from a generic neon web look toward a polished, tactile casual puzzle game for a broad age range. Keep the experience bright and welcoming without casino-like visual noise.

## What is included

- `assets/background/flowblocks-sky.png` — responsive menu/game background. Keep the calm center behind gameplay.
- `assets/tiles/*.webp` — eight 256×256 runtime-ready tile textures.
- `assets/tiles/*.svg` — lossless editable tile masters.
- `assets/ui/logo-mark.svg` — scalable app/menu mark.
- `assets/ui/selection-ring.svg` — selected-tile overlay.
- `assets/ui/sparkle.svg` and `soft-burst.svg` — restrained match/combo effects.
- `DESIGN-HANDOFF.md` — implementation and motion instructions.

## Important integration rule

The current 30×30 textures are visibly soft after scaling. Replace them with the new 256×256 WebP files and rebuild `spritesheet.webp` from those sources. Do not resize the new masters down to 30×30.

## Source

The background was generated for this project. Tiles and UI assets are deterministic SVG artwork created specifically for FlowBlocks.
