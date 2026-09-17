/**
 * TileAtlas — текстуры плиток из готовых мастеров 256×256.
 *
 * Раньше плитки рисовались процедурно (`Graphics` → `RenderTexture`, 128px) и
 * получались стеклянно-неоновыми: резкий бевел, белая засветка на всю верхнюю
 * треть, чёрная обводка по периметру. Дизайн-пак `_docs/_gpt-brief` заменяет их
 * на сатиново-пластиковые — мягкий блик, скруглённый корпус, тень под низом.
 * Рисовать такое кодом нечем, поэтому текстуры теперь загружаются картинками.
 *
 * Размер мастеров — 256px при рендере плитки в 44–72 CSS-пикселя, то есть запас
 * даже на тройной DPR. Поэтому включены мипмапы: без них уменьшение в четыре
 * раза даёт муар на блике и на строчке тени.
 */

import { Assets, Texture, type Application } from 'pixi.js'

import blueUrl from '@/assets/tiles/blue.webp'
import cyanUrl from '@/assets/tiles/cyan.webp'
import greenUrl from '@/assets/tiles/green.webp'
import orangeUrl from '@/assets/tiles/orange.webp'
import pinkUrl from '@/assets/tiles/pink.webp'
import redUrl from '@/assets/tiles/red.webp'
import violetUrl from '@/assets/tiles/violet.webp'
import yellowUrl from '@/assets/tiles/yellow.webp'

export type TileTextures = Texture[]

/** Сторона мастера в пикселях. */
export const TILE_TEXTURE_SIZE = 256
export const NUM_TILE_COLORS = 8

/**
 * Цвет по индексу.
 *
 * Порядок именно такой, а не алфавитный, как в самом паке: индекс цвета уже
 * зашит в сохранённые партии и в прежнюю палитру (0 — красный, 1 — фиолетовый,
 * 2 — зелёный и так далее). Перетасовать список значило бы перекрасить все
 * плитки на доске у игроков, которые сейчас в середине партии, — а выигрыша в
 * этом нет никакого, матчи считаются по индексу, а не по оттенку.
 */
const TILE_URLS: string[] = [
	redUrl, // 0 — был #EF4444
	violetUrl, // 1 — был #A855F7
	greenUrl, // 2 — был #22C55E
	orangeUrl, // 3 — был #F97316
	blueUrl, // 4 — был #3B82F6
	yellowUrl, // 5 — был #FACC15
	cyanUrl, // 6 — был #06B6D4
	pinkUrl, // 7 — был #EC4899
]

/**
 * Загрузить текстуры плиток.
 *
 * `app` больше не нужен для рисования, но остаётся в сигнатуре: вызов сидит в
 * `PixiService.init` между созданием приложения и прогревом GPU, и менять там
 * порядок ради одного аргумента незачем.
 */
export async function createTileTextures(
	_app: Application
): Promise<TileTextures> {
	const textures = (await Promise.all(
		TILE_URLS.map((url) => Assets.load<Texture>(url))
	)) as TileTextures

	for (const texture of textures) {
		const source = texture.source
		source.scaleMode = 'linear'
		source.autoGenerateMipmaps = true
		// Мипмапы строятся при заливке в GPU, а текстура к этому моменту уже
		// загружена, — поэтому просим пересобрать источник явно.
		source.updateMipmaps()
	}

	return textures
}

export function getTileTexture(
	tileTextures: TileTextures,
	colorIndex: number
): Texture {
	return tileTextures[colorIndex % NUM_TILE_COLORS]
}
