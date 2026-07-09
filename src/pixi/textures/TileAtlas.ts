/**
 * TileAtlas — procedural tiles: saturated palette, top-left light, bevel, gloss, crisp edges.
 * Renders at high internal resolution; scaled down in-game for sharp, tactile blocks.
 */

import { Application, Graphics, FillGradient, RenderTexture, Texture } from 'pixi.js'

export type TileTextures = Texture[]

/** Source art size per tile (higher = less blur when scaled on screen). */
const PROC_TILE_SIZE = 128
export const TILE_TEXTURE_SIZE = PROC_TILE_SIZE
export const NUM_TILE_COLORS = 8

interface BlockColors {
	top: number
	middle: number
	bottom: number
}

/**
 * Palette (order matches game color indices 0–7).
 * Middle = anchor HEX from spec; top/bottom = lighter / darker pure hues (no muddy grays).
 */
const BLOCK_PALETTE: BlockColors[] = [
	// 0 Red #EF4444
	{ top: 0xf87171, middle: 0xef4444, bottom: 0xdc2626 },
	// 1 Purple #A855F7
	{ top: 0xc084fc, middle: 0xa855f7, bottom: 0x9333ea },
	// 2 Green #22C55E
	{ top: 0x4ade80, middle: 0x22c55e, bottom: 0x16a34a },
	// 3 Orange #F97316
	{ top: 0xfb923c, middle: 0xf97316, bottom: 0xea580c },
	// 4 Blue #3B82F6
	{ top: 0x60a5fa, middle: 0x3b82f6, bottom: 0x2563eb },
	// 5 Yellow #FACC15
	{ top: 0xfde047, middle: 0xfacc15, bottom: 0xeab308 },
	// 6 Cyan #06B6D4 (extra distinguishable hue)
	{ top: 0x22d3ee, middle: 0x06b6d4, bottom: 0x0891b2 },
	// 7 Pink #EC4899
	{ top: 0xf472b6, middle: 0xec4899, bottom: 0xdb2777 },
]

function drawGlossyBlock(g: Graphics, size: number, c: BlockColors): void {
	const inset = 2
	const body = size - inset * 2
	const r = Math.max(4, Math.round(body * 0.11))
	const x0 = inset
	const y0 = inset

	// 1) Base: vertical gradient (lighter top → darker bottom)
	const grad = new FillGradient(0, y0, 0, y0 + body)
	grad.addColorStop(0, c.top)
	grad.addColorStop(0.42, c.middle)
	grad.addColorStop(1, c.bottom)
	g.roundRect(x0, y0, body, body, r)
	g.fill(grad)

	// 2) Tight bottom-right “contact shadow” inside the tile (not a soft blur)
	const sh = Math.max(2, Math.round(body * 0.07))
	g.roundRect(x0 + sh * 0.35, y0 + body - sh * 1.1, body - sh * 0.5, sh, r * 0.35)
	g.fill({ color: 0x000000, alpha: 0.22 })

	// 3) Bevel — light top/left, dark bottom/right (global light top-left)
	const ew = Math.max(2, Math.round(body * 0.045))
	const innerL = x0 + r * 0.35
	const innerW = body - r * 0.7
	g.rect(innerL, y0, innerW, ew)
	g.fill({ color: 0xffffff, alpha: 0.42 })
	g.rect(x0, y0 + r * 0.35, ew, body - r * 0.7)
	g.fill({ color: 0xffffff, alpha: 0.38 })
	g.rect(innerL, y0 + body - ew, innerW, ew)
	g.fill({ color: 0x000000, alpha: 0.32 })
	g.rect(x0 + body - ew, y0 + r * 0.35, ew, body - r * 0.7)
	g.fill({ color: 0x000000, alpha: 0.34 })

	// 4) Inner gloss band (top zone, soft highlight)
	const glossH = body * 0.38
	g.roundRect(x0 + ew, y0 + ew, body - ew * 2, glossH, Math.max(1, r - ew))
	g.fill({ color: 0xffffff, alpha: 0.12 })

	// 5) Specular spot (top-left)
	const cx = x0 + body * 0.3
	const cy = y0 + body * 0.32
	g.ellipse(cx, cy, body * 0.11, body * 0.075)
	g.fill({ color: 0xffffff, alpha: 0.28 })

	// 6) Subtle rim (separation from neighbors / grid)
	g.roundRect(x0, y0, body, body, r)
	g.stroke({ color: 0x000000, width: 1, alpha: 0.38 })
}

/**
 * Create procedural tile textures (one per palette entry).
 */
export async function createTileTextures(app: Application): Promise<TileTextures> {
	const textures: TileTextures = []

	for (let i = 0; i < NUM_TILE_COLORS; i++) {
		const colors = BLOCK_PALETTE[i % BLOCK_PALETTE.length]
		const g = new Graphics()
		drawGlossyBlock(g, PROC_TILE_SIZE, colors)

		const rt = RenderTexture.create({
			width: PROC_TILE_SIZE,
			height: PROC_TILE_SIZE,
			resolution: 1,
		})
		app.renderer.render({ container: g, target: rt })
		g.destroy()

		rt.source.scaleMode = 'linear'
		textures.push(rt)
	}

	return textures
}

export function getTileTexture(tileTextures: TileTextures, colorIndex: number): Texture {
	return tileTextures[colorIndex % NUM_TILE_COLORS]
}
