/**
 * TileAtlas - procedural Block Blast-style tile textures
 * Bright jewel-toned colors, strong highlights, glossy plastic look.
 */

import { Application, Graphics, FillGradient, RenderTexture, Texture } from 'pixi.js'

export type TileTextures = Texture[]

const PROC_TILE_SIZE = 64
const NUM_COLORS = 8
const CORNER_RADIUS = 2

interface BlockColors {
	top: number
	middle: number
	bottom: number
}

/**
 * Высоконасыщенная палитра плиток
 */
const BLOCK_PALETTE: BlockColors[] = [
	// Красный
	{ top: 0xff5555, middle: 0xff2222, bottom: 0xdd2222 },
	// Фиолетовый
	{ top: 0xcc77ff, middle: 0xbb55ee, bottom: 0x9944dd },
	// Зелёный
	{ top: 0x44ee66, middle: 0x22dd44, bottom: 0x11cc33 },
	// Оранжевый
	{ top: 0xffaa33, middle: 0xff8800, bottom: 0xee7700 },
	// Синий
	{ top: 0x55aaff, middle: 0x3399ff, bottom: 0x2288ee },
	// Жёлтый
	{ top: 0xffee33, middle: 0xffdd00, bottom: 0xffcc00 },
	// Бирюзовый
	{ top: 0x44ffee, middle: 0x22dddd, bottom: 0x11cccc },
	// Розовый
	{ top: 0xff6699, middle: 0xff4488, bottom: 0xee3377 },
]

/**
 * Draw a Block Blast-style tile with beveled edges.
 * Light edges top/left, dark edges bottom/right.
 */
function drawGlossyBlock(g: Graphics, size: number, c: BlockColors): void {
	const r = CORNER_RADIUS
	const body = size - 2

	// ── 1. Body: vertical gradient ────────────────────────────────────────────
	const grad = new FillGradient(0, 0, 0, body)
	grad.addColorStop(0, c.top)
	grad.addColorStop(0.45, c.middle)
	grad.addColorStop(1, c.bottom)
	g.roundRect(0, 0, body, body, r)
	g.fill(grad)

	// ── 2. Bevel edges (Block Blast style) ────────────────────────────────────
	const ew = 2 // толщина грани
	// Светлые грани (верх, лево) — источник света сверху-слева
	g.rect(r, 0, body - r * 2, ew)
	g.fill({ color: 0xffffff, alpha: 0.55 })
	g.rect(0, r, ew, body - r * 2)
	g.fill({ color: 0xffffff, alpha: 0.55 })
	// Тёмные грани (низ, право)
	g.rect(r, body - ew, body - r * 2, ew)
	g.fill({ color: 0x000000, alpha: 0.4 })
	g.rect(body - ew, r, ew, body - r * 2)
	g.fill({ color: 0x000000, alpha: 0.4 })

	// ── 3. Outer border ───────────────────────────────────────────────────────
	g.roundRect(0, 0, body, body, r)
	g.stroke({ color: 0x000000, width: 1, alpha: 0.25 })
}

/**
 * Create procedural tile textures.
 */
export async function createTileTextures(app: Application): Promise<TileTextures> {
	const textures: TileTextures = []

	for (let i = 0; i < NUM_COLORS; i++) {
		const colors = BLOCK_PALETTE[i % BLOCK_PALETTE.length]
		const g = new Graphics()
		drawGlossyBlock(g, PROC_TILE_SIZE, colors)

		const rt = RenderTexture.create({
			width: PROC_TILE_SIZE,
			height: PROC_TILE_SIZE,
		})
		app.renderer.render({ container: g, target: rt })
		g.destroy()

		textures.push(rt)
	}

	return textures
}

export function getTileTexture(tileTextures: TileTextures, colorIndex: number): Texture {
	return tileTextures[colorIndex % NUM_COLORS]
}
