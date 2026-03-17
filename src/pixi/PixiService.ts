/**
 * PixiService - Singleton для управления Pixi Application
 * Создается один раз на всё приложение и переиспользуется между страницами
 */

import { Application, Container } from 'pixi.js'
import { createTileTextures, type TileTextures } from './textures/TileAtlas'
import { warmTextures } from './utils/warmup'

export interface PixiServiceOptions {
	width?: number
	height?: number
}

function getOptimalRenderResolution(): number {
	const dpr = window.devicePixelRatio || 1
	const isAndroid = /Android/i.test(navigator.userAgent)
	const cores = navigator.hardwareConcurrency || 4
	const memory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4)

	// На Android высокий DPR сильно бьет по fill-rate, поэтому ограничиваем рендер-буфер.
	if (isAndroid) {
		const maxAndroidResolution = cores <= 4 || memory <= 4 ? 1.25 : 1.5
		return Math.min(dpr, maxAndroidResolution)
	}

	return Math.min(dpr, 2)
}

class PixiServiceClass {
	private app: Application | null = null
	private startSceneContainer: Container | null = null
	private gameSceneContainer: Container | null = null
	private tileTextures: TileTextures | null = null
	private hostElement: HTMLElement | null = null
	private canvas: HTMLCanvasElement | null = null
	private isInitialized = false

	/**
	 * Инициализировать Pixi Application
	 * Вызывается один раз на StartPage
	 */
	async init(hostEl: HTMLElement, options?: PixiServiceOptions): Promise<void> {
		if (this.isInitialized) {
			console.warn('[PixiService] Already initialized, skipping')
			return
		}

		const initStartTime = performance.now()

		// Создаем canvas элемент
		this.canvas = document.createElement('canvas')
		this.canvas.style.display = 'block'
		this.canvas.style.width = `${options?.width || 320}px`
		this.canvas.style.height = `${options?.height || 400}px`

		// Добавляем canvas в DOM (скрытый, в фоне)
		this.hostElement = hostEl
		this.canvas.style.position = 'absolute'
		this.canvas.style.left = '-9999px'
		this.canvas.style.top = '0'
		this.canvas.style.opacity = '0'
		this.canvas.style.pointerEvents = 'none'
		hostEl.appendChild(this.canvas)

		// Создаем Pixi Application
		this.app = new Application()
		const renderResolution = getOptimalRenderResolution()
		const logicalWidth = options?.width || 320
		const logicalHeight = options?.height || 400

		await this.app.init({
			canvas: this.canvas,
			width: logicalWidth,
			height: logicalHeight,
			backgroundColor: 0x000000,
			backgroundAlpha: 0,
			resolution: renderResolution,
			autoDensity: true,
			antialias: false,
			powerPreference: 'high-performance',
		})

		// Стабилизируем delta time в мобильном WebView, чтобы анимации не "пролетали"
		// после кратковременных фризов.
		this.app.ticker.maxFPS = 60
		this.app.ticker.minFPS = 30

		// Создаем сцены
		this.startSceneContainer = new Container()
		this.gameSceneContainer = new Container()
		this.app.stage.addChild(this.startSceneContainer)
		this.app.stage.addChild(this.gameSceneContainer)

		// По умолчанию показываем стартовую сцену
		this.startSceneContainer.visible = true
		this.gameSceneContainer.visible = false

		// Загружаем и создаем текстуры
		const assetsLoadedTime = performance.now()
		this.tileTextures = await createTileTextures(this.app)

		// Прогреваем текстуры GPU
		const warmupStartTime = performance.now()
		await warmTextures(this.app, this.tileTextures)

		this.isInitialized = true
	}

	/**
	 * Прикрепить canvas к новому хосту (при переходе на GamePage)
	 */
	attachToHost(newHostEl: HTMLElement): void {
		if (!this.canvas || !this.isInitialized) {
			throw new Error('PixiService not initialized')
		}

		// Если canvas уже прикреплен к этому хосту, ничего не делаем
		if (this.canvas.parentElement === newHostEl) {
			// Убеждаемся, что стили правильные
			this.canvas.style.position = 'relative'
			this.canvas.style.left = 'auto'
			this.canvas.style.top = 'auto'
			this.canvas.style.opacity = '1'
			this.canvas.style.pointerEvents = 'auto'
			this.canvas.style.display = 'block'
			return
		}

		// Удаляем из старого хоста (если был)
		if (this.canvas.parentElement) {
			this.canvas.parentElement.removeChild(this.canvas)
		}

		// Добавляем в новый хост
		this.hostElement = newHostEl
		this.canvas.style.position = 'relative'
		this.canvas.style.left = 'auto'
		this.canvas.style.top = 'auto'
		this.canvas.style.opacity = '1'
		this.canvas.style.pointerEvents = 'auto'
		this.canvas.style.display = 'block'
		newHostEl.appendChild(this.canvas)
	}

	/**
	 * Открепить canvas от хоста (при уходе с GamePage)
	 */
	detach(): void {
		if (!this.canvas) return

		// Возвращаем в скрытое состояние
		if (this.hostElement && this.canvas.parentElement === this.hostElement) {
			this.canvas.style.position = 'absolute'
			this.canvas.style.left = '-9999px'
			this.canvas.style.top = '0'
			this.canvas.style.opacity = '0'
			this.canvas.style.pointerEvents = 'none'
		}
	}

	/**
	 * Переключиться на игровую сцену
	 */
	switchToGameScene(): void {
		if (!this.startSceneContainer || !this.gameSceneContainer) {
			throw new Error('Scenes not initialized')
		}
		this.startSceneContainer.visible = false
		this.gameSceneContainer.visible = true
	}

	/**
	 * Переключиться на стартовую сцену
	 */
	switchToStartScene(): void {
		if (!this.startSceneContainer || !this.gameSceneContainer) {
			throw new Error('Scenes not initialized')
		}
		this.startSceneContainer.visible = true
		this.gameSceneContainer.visible = false
	}

	/**
	 * Получить Pixi Application
	 */
	getApp(): Application {
		if (!this.app) {
			throw new Error('PixiService not initialized')
		}
		return this.app
	}

	/**
	 * Получить canvas элемент
	 */
	getCanvas(): HTMLCanvasElement {
		if (!this.canvas) {
			throw new Error('PixiService not initialized')
		}
		return this.canvas
	}

	/**
	 * Получить контейнер игровой сцены
	 */
	getGameScene(): Container {
		if (!this.gameSceneContainer) {
			throw new Error('Game scene not initialized')
		}
		return this.gameSceneContainer
	}

	/**
	 * Получить контейнер стартовой сцены
	 */
	getStartScene(): Container {
		if (!this.startSceneContainer) {
			throw new Error('Start scene not initialized')
		}
		return this.startSceneContainer
	}

	/**
	 * Получить кэш текстур плиток
	 */
	getTileTextures(): TileTextures {
		if (!this.tileTextures) {
			throw new Error('Tile textures not initialized')
		}
		return this.tileTextures
	}

	/**
	 * Проверить, инициализирован ли сервис
	 */
	isReady(): boolean {
		return this.isInitialized && this.app !== null && this.tileTextures !== null
	}

	/**
	 * Уничтожить сервис (для cleanup)
	 */
	destroy(): void {
		if (this.app) {
			this.app.destroy(true, {
				children: true,
				texture: true,
				textureSource: true,
			})
			this.app = null
		}

		if (this.canvas && this.canvas.parentElement) {
			this.canvas.parentElement.removeChild(this.canvas)
		}

		this.canvas = null
		this.hostElement = null
		this.startSceneContainer = null
		this.gameSceneContainer = null
		this.tileTextures = null
		this.isInitialized = false
	}
}

// Singleton instance
export const PixiService = new PixiServiceClass()
