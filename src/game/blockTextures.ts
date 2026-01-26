/**
 * Загрузка и управление текстурами блоков
 * ОБНОВЛЕНО: Использует PixiService для получения текстур из кэша
 */

import { Texture } from 'pixi.js'
import { PixiService } from '@/pixi/PixiService'
import { getTileTexture } from '@/pixi/textures/TileAtlas'

// Константы для совместимости
const FRAME_COUNT = 8

// Кэш загруженных текстур (для обратной совместимости)
let textureCache: Map<number, Texture> | null = null

/**
 * Загрузить все текстуры блоков
 * ОБНОВЛЕНО: Использует PixiService, если он инициализирован
 */
export async function loadBlockTextures(): Promise<Map<number, Texture>> {
	// Если PixiService готов, используем его текстуры
	if (PixiService.isReady()) {
		const tileTextures = PixiService.getTileTextures()
		// Создаем кэш для обратной совместимости
		textureCache = new Map()
		for (let i = 0; i < tileTextures.length; i++) {
			textureCache.set(i, tileTextures[i])
		}
		return textureCache
	}

	// Если кэш уже есть, вернуть его
	if (textureCache) {
		return textureCache
	}

	// Fallback: если PixiService не готов, ждем его инициализации
	// Это может произойти при первой загрузке, если StartPage еще не загрузился
	console.warn('[blockTextures] loadBlockTextures: PixiService not ready, waiting...')
	
	// Ждем инициализации PixiService (максимум 10 секунд)
	const startTime = Date.now()
	while (!PixiService.isReady() && Date.now() - startTime < 10000) {
		await new Promise(resolve => setTimeout(resolve, 100))
	}

	if (PixiService.isReady()) {
		const tileTextures = PixiService.getTileTextures()
		textureCache = new Map()
		for (let i = 0; i < tileTextures.length; i++) {
			textureCache.set(i, tileTextures[i])
		}
		return textureCache
	}

	throw new Error('Failed to load textures: PixiService not initialized')
}

/**
 * Получить текстуру для цвета блока
 * ОБНОВЛЕНО: Использует PixiService, если он готов
 */
export function getBlockTexture(colorIndex: number): Texture | null {
	// Если PixiService готов, используем его текстуры напрямую
	if (PixiService.isReady()) {
		try {
			const tileTextures = PixiService.getTileTextures()
			return getTileTexture(tileTextures, colorIndex)
		} catch (error) {
			console.warn('[blockTextures] getBlockTexture: failed to get texture from PixiService', error)
		}
	}

	// Fallback на старый кэш
	if (!textureCache) {
		return null
	}

	// Используем модуло для циклического использования текстур
	const index = colorIndex % FRAME_COUNT
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
 * КРИТИЧНО: Использует предзагруженные текстуры из кэша, если они доступны
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

	// КРИТИЧНО: Если текстуры уже загружены и имеют валидные размеры,
	// проверяем их готовность сразу без ожидания
	let allReadyImmediately = true
	for (const texture of textureCache.values()) {
		if (!texture || texture.width <= 0 || texture.height <= 0) {
			allReadyImmediately = false
			break
		}
		// Проверяем через внутренний source
		try {
			const source = texture.source as any
			if (source && source.resource) {
				const img = source.resource.source || source.resource
				if (img && img instanceof HTMLImageElement) {
					if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
						allReadyImmediately = false
						break
					}
				}
			}
		} catch (e) {
			// Игнорируем ошибки доступа
		}
	}

	// Если все текстуры уже готовы, возвращаемся сразу
	if (allReadyImmediately) {
		return
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
			
			// КРИТИЧНО: Дополнительная задержка для гарантии, что браузер полностью декодировал изображения
			// На холодном старте браузеру нужно больше времени для декодирования
			// Ждем несколько кадров для полной готовности
			for (let i = 0; i < 3; i++) {
				await new Promise(resolve => requestAnimationFrame(resolve))
			}
			
			// Дополнительная небольшая задержка для гарантии декодирования на медленных устройствах
			// Особенно важно на мобильных устройствах и холодном старте
			await new Promise(resolve => setTimeout(resolve, 50))
			
			return
		}
		
		// Ждем следующий кадр перед повторной проверкой
		await new Promise(resolve => requestAnimationFrame(resolve))
	}
	
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
