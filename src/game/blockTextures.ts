/**
 * Загрузка и управление текстурами блоков
 */

import { Assets, Texture } from 'pixi.js'

// Импорт изображений для Vite
import redImg from '@/assets/img/red.webp'
import blueImg from '@/assets/img/blue.webp'
import greenImg from '@/assets/img/green.webp'
import yellowImg from '@/assets/img/yellow.webp'
import orangeImg from '@/assets/img/orange.webp'
import pinkImg from '@/assets/img/pink.webp'
import violetImg from '@/assets/img/violet.webp'
import bluelightImg from '@/assets/img/bluelight.webp'

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
// Промис загрузки для предотвращения множественных одновременных загрузок
let loadPromise: Promise<Map<number, Texture>> | null = null

/**
 * Загрузить все текстуры блоков
 */
export async function loadBlockTextures(): Promise<Map<number, Texture>> {
	// Если уже загружены, вернуть кэш
	if (textureCache) {
		return textureCache
	}

	// Если загрузка уже идет, вернуть существующий промис
	if (loadPromise) {
		return loadPromise
	}

	// Начать загрузку
	loadPromise = (async () => {
		try {
			// Создать bundle для параллельной загрузки всех текстур
			const bundleName = 'blockTextures'
			const assetsToLoad: Record<string, string> = {}

			for (let i = 0; i < COLOR_TO_IMAGE.length; i++) {
				const imagePath = COLOR_TO_IMAGE[i]
				assetsToLoad[`block_${i}`] = imagePath
			}

			// Добавить bundle и загрузить все текстуры параллельно
			// addBundle безопасно вызывать повторно - если bundle уже существует, он будет обновлен
			Assets.addBundle(bundleName, assetsToLoad)
			const loadedTextures = await Assets.loadBundle(bundleName)

			// Создать кэш текстур напрямую из результата загрузки
			textureCache = new Map()
			for (let i = 0; i < COLOR_TO_IMAGE.length; i++) {
				const textureKey = `block_${i}`
				const texture = loadedTextures[textureKey] as Texture
				if (texture) {
					textureCache.set(i, texture)
				}
			}

			return textureCache
		} finally {
			// Очистить промис после завершения загрузки
			loadPromise = null
		}
	})()

	return loadPromise
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
	
	// Проверяем, что все текстуры существуют
	for (const texture of textureCache.values()) {
		if (!texture) {
			return false
		}
	}
	
	return true
}

/**
 * Дождаться, пока все текстуры будут готовы к использованию
 * Проверяет, что текстуры загружены и имеют валидные размеры
 * Также проверяет декодирование изображений через HTMLImageElement
 */
export async function waitForTexturesReady(maxWaitMs: number = 10000): Promise<void> {
	// Если текстуры еще не загружены, ждем их загрузки
	if (!textureCache || textureCache.size === 0) {
		// Если загрузка идет, ждем ее завершения
		if (loadPromise) {
			await loadPromise
		} else {
			// Если загрузка не начата, начинаем ее
			await loadBlockTextures()
		}
	}

	if (!textureCache || textureCache.size === 0) {
		throw new Error('Textures not loaded after waiting')
	}

	const startTime = Date.now()
	
	// Проверяем готовность текстур с интервалами
	while (Date.now() - startTime < maxWaitMs) {
		let allReady = true
		
		for (const texture of textureCache.values()) {
			if (!texture) {
				allReady = false
				break
			}
			
			// Проверяем, что текстура имеет валидные размеры
			// Это означает, что изображение декодировано браузером
			if (texture.width <= 0 || texture.height <= 0) {
				allReady = false
				break
			}
			
			// Дополнительная проверка через source (если доступно)
			if (texture.source && 'width' in texture.source && 'height' in texture.source) {
				const source = texture.source as { width: number; height: number }
				if (source.width <= 0 || source.height <= 0) {
					allReady = false
					break
				}
			}
			
			// КРИТИЧНО: Проверяем, что source готов (для ImageSource)
			// В PixiJS v8 source может быть ImageSource, который имеет свойство resource
			if (texture.source && 'resource' in texture.source) {
				const resource = (texture.source as { resource?: { width?: number; height?: number; complete?: boolean } }).resource
				if (resource) {
					// Проверяем размеры
					if (resource.width === undefined || resource.height === undefined || resource.width <= 0 || resource.height <= 0) {
						allReady = false
						break
					}
					// КРИТИЧНО: Проверяем complete для HTMLImageElement
					// Это гарантирует, что изображение полностью загружено и декодировано
					if ('complete' in resource && resource.complete === false) {
						allReady = false
						break
					}
				}
			}
			
			// КРИТИЧНО: Дополнительная проверка через внутренний source (может быть HTMLImageElement)
			// Пытаемся получить доступ к внутреннему изображению для проверки complete
			try {
				const source = texture.source as any
				// В PixiJS v8 source может иметь внутренний ресурс с изображением
				if (source && source.resource) {
					const img = source.resource.source || source.resource
					// Проверяем, является ли это HTMLImageElement
					if (img && img instanceof HTMLImageElement) {
						if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
							allReady = false
							break
						}
					}
				}
			} catch (e) {
				// Игнорируем ошибки доступа к внутренним свойствам
			}
		}

		if (allReady) {
			// КРИТИЧНО: Дополнительная проверка - убеждаемся, что изображения действительно готовы к рендерингу
			// Проверяем через внутренние свойства PixiJS текстур
			let imagesReady = true
			for (const texture of textureCache.values()) {
				if (!texture) {
					imagesReady = false
					break
				}
				
				try {
					const source = texture.source as any
					if (source && source.resource) {
						const img = source.resource.source || source.resource
						// Проверяем, является ли это HTMLImageElement
						if (img && img instanceof HTMLImageElement) {
							// Проверяем, что изображение полностью загружено и декодировано
							if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
								imagesReady = false
								break
							}
						}
					}
				} catch (e) {
					// Игнорируем ошибки доступа к внутренним свойствам
				}
			}
			
			if (!imagesReady) {
				// Если изображения еще не готовы, продолжаем ждать
				await new Promise(resolve => requestAnimationFrame(resolve))
				continue
			}
			
			// Дополнительная задержка для гарантии, что браузер полностью декодировал изображения
			// Ждем несколько кадров для полной готовности
			await new Promise(resolve => requestAnimationFrame(resolve))
			await new Promise(resolve => requestAnimationFrame(resolve))
			
			// Финальная проверка перед возвратом
			console.log('All textures are ready:', {
				count: textureCache.size,
				textures: Array.from(textureCache.entries()).map(([color, tex]) => ({
					color,
					width: tex?.width,
					height: tex?.height
				}))
			})
			
			return
		}
		
		// Ждем следующий кадр перед повторной проверкой
		await new Promise(resolve => requestAnimationFrame(resolve))
	}
	
	// Если не удалось дождаться готовности, выводим предупреждение
	console.warn('Some textures may not be ready after waiting', maxWaitMs, 'ms')
	
	// Проверяем, какие текстуры не готовы для отладки
	for (const [colorIndex, texture] of textureCache.entries()) {
		if (!texture || texture.width <= 0 || texture.height <= 0) {
			console.warn(`Texture for color ${colorIndex} is not ready:`, {
				width: texture?.width,
				height: texture?.height,
				hasSource: !!texture?.source
			})
		}
	}
}

/**
 * Очистить кэш текстур
 */
export function clearBlockTextures(): void {
	textureCache = null
	loadPromise = null
}
