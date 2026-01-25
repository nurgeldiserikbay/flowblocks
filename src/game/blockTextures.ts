/**
 * Загрузка и управление текстурами блоков
 */

import { Assets, Texture } from 'pixi.js'

// Импорт изображений для Vite
import redImg from '@/assets/img/red.png'
import blueImg from '@/assets/img/blue.png'
import greenImg from '@/assets/img/green.png'
import yellowImg from '@/assets/img/yellow.png'
import orangeImg from '@/assets/img/orange.png'
import pinkImg from '@/assets/img/pink.png'
import violetImg from '@/assets/img/violet.png'
import bluelightImg from '@/assets/img/bluelight.png'

// Маппинг цветов на импортированные изображения
const COLOR_TO_IMAGE: string[] = [
	redImg, // 0 - красный
	blueImg, // 1 - синий
	greenImg, // 2 - зеленый
	yellowImg, // 3 - желтый
	orangeImg, // 4 - оранжевый
	pinkImg, // 5 - розовый
	violetImg, // 6 - фиолетовый
	bluelightImg, // 7 - светло-голубой
]

// Кэш загруженных текстур
let textureCache: Map<number, Texture> | null = null

/**
 * Загрузить все текстуры блоков
 */
export async function loadBlockTextures(): Promise<Map<number, Texture>> {
	if (textureCache) {
		return textureCache
	}

	// Создать объект для загрузки ресурсов
	const assetsToLoad: Record<string, string> = {}

	for (let i = 0; i < COLOR_TO_IMAGE.length; i++) {
		const imagePath = COLOR_TO_IMAGE[i]
		assetsToLoad[`block_${i}`] = imagePath
	}

	// Загрузить все текстуры
	await Assets.load(Object.values(assetsToLoad))

	// Создать кэш текстур
	textureCache = new Map()
	for (let i = 0; i < COLOR_TO_IMAGE.length; i++) {
		const texture = Assets.get(assetsToLoad[`block_${i}`])
		if (texture) {
			textureCache.set(i, texture)
		}
	}

	return textureCache
}

/**
 * Получить текстуру для цвета блока
 */
export function getBlockTexture(colorIndex: number): Texture | null {
	if (!textureCache) {
		return null
	}

	// Используем модуло для циклического использования текстур
	const index = colorIndex % COLOR_TO_IMAGE.length
	return textureCache.get(index) || null
}

/**
 * Проверить, загружены ли все текстуры и готовы ли они к использованию
 */
export function areTexturesLoaded(): boolean {
	if (!textureCache || textureCache.size === 0) {
		return false
	}
	
	// Проверяем, что все текстуры валидны
	for (const texture of textureCache.values()) {
		if (!texture || !texture.valid) {
			return false
		}
	}
	
	return true
}

/**
 * Очистить кэш текстур
 */
export function clearBlockTextures(): void {
	textureCache = null
}
