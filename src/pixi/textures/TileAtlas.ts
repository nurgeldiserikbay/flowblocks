/**
 * TileAtlas - управление текстурами плиток из sprite sheet
 */

import { Assets, Texture, Rectangle } from 'pixi.js'
import spritesheetImg from '@/assets/img/spritesheet.webp'

const TILE_SIZE = 30
const NUM_COLORS = 8

export type TileTextures = Texture[]

/**
 * Создать текстуры плиток из sprite sheet
 * Sprite sheet: 240x30 (8 плиток по 30x30)
 */
export async function createTileTextures(): Promise<TileTextures> {
	const startTime = performance.now()
	console.log('[TileAtlas] createTileTextures: starting')

	// Загрузить sprite sheet через Assets
	const loadedTexture = await Assets.load(spritesheetImg) as Texture
	
	// Получить source из загруженной текстуры
	const source = loadedTexture.source

	// Создать массив текстур для каждого кадра (0..7)
	const tileTextures: TileTextures = Array.from({ length: NUM_COLORS }, (_, i) =>
		new Texture({
			source,
			frame: new Rectangle(i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE)
		})
	)

	const duration = performance.now() - startTime
	console.log(`[TileAtlas] createTileTextures: completed in ${duration.toFixed(2)}ms`)

	return tileTextures
}

/**
 * Получить текстуру для цвета блока
 */
export function getTileTexture(tileTextures: TileTextures, colorIndex: number): Texture {
	const index = colorIndex % NUM_COLORS
	return tileTextures[index]
}
