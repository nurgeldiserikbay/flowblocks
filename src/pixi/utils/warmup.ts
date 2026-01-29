/**
 * Warmup utilities - прогрев GPU для устранения cold-start паузы
 */

import { Application, Container, Sprite } from 'pixi.js'
import type { TileTextures } from '../textures/TileAtlas'

const TILE_PADDING = 2

/**
 * Прогреть текстуры GPU - создать невидимые спрайты и отрендерить их
 * Это заставляет GPU загрузить текстуры в память и подготовить их к быстрому отображению
 */
export async function warmTextures(
	app: Application,
	tileTextures: TileTextures,
): Promise<void> {
	const warmUpStartTime = performance.now()

	// Создаем временный контейнер для тестовых спрайтов (вне видимой области)
	const warmUpContainer = new Container()
	warmUpContainer.visible = false // Скрываем, чтобы не было видно на экране
	warmUpContainer.alpha = 0 // Дополнительно делаем невидимым
	app.stage.addChild(warmUpContainer)

	const testSprites: Sprite[] = []
	const spriteSize = 30 - TILE_PADDING * 2 // Примерный размер спрайта

	// Создаем тестовые спрайты для всех текстур
	// Это заставит GPU загрузить текстуры в память
	for (let colorIndex = 0; colorIndex < tileTextures.length; colorIndex++) {
		const texture = tileTextures[colorIndex]
		if (texture && texture.width > 0 && texture.height > 0) {
			const sprite = new Sprite(texture)
			sprite.width = spriteSize
			sprite.height = spriteSize
			sprite.x = colorIndex * spriteSize // Размещаем в ряд вне экрана
			sprite.y = 0
			sprite.visible = true
			sprite.alpha = 1
			warmUpContainer.addChild(sprite)
			testSprites.push(sprite)
		} else {
			console.warn(`[Warmup] warmTextures: texture ${colorIndex} not ready`)
		}
	}

	if (testSprites.length === 0) {
		console.warn('[Warmup] warmTextures: no sprites created')
		warmUpContainer.destroy({ children: true })
		return
	}

	// КРИТИЧНО: Рендерим несколько кадров для прогрева GPU
	// Это гарантирует, что текстуры загружены в GPU память
	for (let i = 0; i < 3; i++) {
		// Принудительно рендерим кадр
		app.renderer.render(app.stage)

		// Ждем следующий кадр ticker для гарантии рендера
		await new Promise<void>((resolve) => {
			if (!app.ticker) {
				resolve()
				return
			}
			app.ticker.addOnce(() => {
				resolve()
			})
		})
	}

	// Удаляем тестовые спрайты
	testSprites.forEach((sprite) => {
		if (sprite.parent) {
			sprite.parent.removeChild(sprite)
		}
		sprite.destroy()
	})

	if (warmUpContainer.parent) {
		warmUpContainer.parent.removeChild(warmUpContainer)
	}
	warmUpContainer.destroy({ children: true })
}
