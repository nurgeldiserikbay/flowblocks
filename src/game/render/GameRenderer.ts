/**
 * Pixi.js game renderer - handles rendering and animations
 */

import {
	Container,
	Sprite,
	Text,
	TextStyle,
	Graphics,
} from 'pixi.js'
import { gsap } from 'gsap'
import type { GameEvent, Cube } from '../logic/types'
import { getBlockTexture } from '../blockTextures'
import { WIDTH } from '../logic/grid'
import { AudioManager } from '../audio/AudioManager'
import { PixiService } from '@/pixi/PixiService'
import type { Application } from 'pixi.js'

const TILE_PADDING = 2

export interface GameRendererOptions {
	canvas: HTMLCanvasElement
	tileSize: number
}

type CubeContainer = {
	container: Container
	sprite: Sprite
	text: Text | null
	highlight: Graphics | null
	color: number // Текущий цвет куба для отслеживания изменений
}

type CubeSpriteContainer = Container & { __cubeId?: number }

export class GameRenderer {
	private canvas: HTMLCanvasElement
	private app: Application | null = null
	private gameContainer: Container | null = null
	private tileSize: number
	private cubeContainers: Map<number, CubeContainer> = new Map() // Map<cubeId, container>
	private cubePositions: Map<number, { r: number; c: number }> = new Map() // Map<cubeId, position>
	private positionToCubeId: Map<string, number> = new Map() // Map<"r,c", cubeId>
	private nextCubeId: number = 1
	private selectedPosition: { r: number; c: number } | null = null
	private gridHeight: number = 0 // Высота grid для расчета позиций снизу
	private syncCounter: number = 0

	constructor(options: GameRendererOptions) {
		this.canvas = options.canvas
		this.tileSize = options.tileSize
	}

	async init(): Promise<void> {
		const initStartTime = performance.now()

		// КРИТИЧНО: Используем PixiService вместо создания нового Application
		if (!PixiService.isReady()) {
			throw new Error(
				'PixiService not initialized. Call PixiService.init() on StartPage first.'
			)
		}

		// Получаем Application из PixiService
		this.app = PixiService.getApp()

		// КРИТИЧНО: Получаем контейнер из переданного canvas ref
		// Canvas из PixiService будет прикреплен к этому контейнеру через attachToHost в GamePage
		const container = this.canvas.parentElement
		if (!container) {
			throw new Error('Canvas parent container not found')
		}

		// КРИТИЧНО: Прикрепляем canvas из PixiService к нашему хосту
		// Это должно быть сделано в GamePage перед вызовом renderer.init()
		// Но на всякий случай проверяем и прикрепляем здесь
		const pixiCanvas = PixiService.getCanvas()
		if (pixiCanvas.parentElement !== container) {
			PixiService.attachToHost(container)
		}

		// Обновляем ссылку на canvas из PixiService
		this.canvas = pixiCanvas

		// КРИТИЧНО: Получаем игровую сцену из PixiService
		const gameScene = PixiService.getGameScene()
		this.gameContainer = gameScene

		// КРИТИЧНО: Очищаем сцену при повторном входе (после выхода и возврата)
		// Иначе остаются элементы от предыдущей сессии и игра не генерируется заново
		gameScene.removeChildren()

		// КРИТИЧНО: Переключаемся на игровую сцену
		PixiService.switchToGameScene()

		// КРИТИЧНО: Проверяем, что renderer инициализирован корректно
		if (!this.app.renderer) {
			throw new Error('PixiJS renderer failed to initialize')
		}

		// КРИТИЧНО: Проверяем размеры renderer
		if (this.app.renderer.width <= 0 || this.app.renderer.height <= 0) {
			console.warn('PixiJS renderer has invalid dimensions:', {
				width: this.app.renderer.width,
				height: this.app.renderer.height,
			})
		}

		// КРИТИЧНО: Проверяем, что ticker запущен (по умолчанию должен быть запущен)
		if (!this.app.ticker.started) {
			console.warn('PixiJS ticker is not started, starting manually')
			this.app.ticker.start()
		}

		// КРИТИЧНО: Принудительно рендерим первый кадр для проверки
		this.forceRender()
	}

	/**
	 * Получить canvas элемент
	 */
	getCanvas(): HTMLCanvasElement {
		return this.canvas
	}

	/**
	 * КРИТИЧНО: Прогрев текстур - создание тестовых спрайтов и рендеринг для подготовки GPU
	 * ОБНОВЛЕНО: Текстуры уже прогреты в PixiService.init(), этот метод больше не нужен
	 * Оставлен для обратной совместимости, но ничего не делает
	 */
	async warmUpTextures(): Promise<void> {
		// Текстуры уже прогреты в PixiService.init() на StartPage
		return Promise.resolve()
	}

	async renderGrid(
		grid: (Cube | null)[][],
		nextCubeId: number = 1,
		excludeCubeIds?: Set<number>
	): Promise<void> {
		if (!this.gameContainer || !this.app) return

		this.nextCubeId = nextCubeId
		// Сохраняем высоту grid для расчета позиций снизу
		this.gridHeight = grid.length

		// КРИТИЧНО: Не пересоздаем существующие спрайты, а только обновляем их позиции
		// Это предотвращает изменение цветов существующих кубов при спавне новых
		const existingCubeIds = new Set<number>()
		const cubesToCreate: Array<{ cube: Cube; r: number; c: number }> = []

		// Собираем все кубы из grid
		for (let r = 0; r < grid.length; r++) {
			for (let c = 0; c < WIDTH; c++) {
				const cube = grid[r]?.[c]
				if (cube) {
					// Пропускаем новые кубы - они будут созданы в animateSpawn
					if (excludeCubeIds && excludeCubeIds.has(cube.id)) {
						continue
					}

					// Проверяем, существует ли уже спрайт для этого куба
					if (this.cubeContainers.has(cube.id)) {
						existingCubeIds.add(cube.id)
						// Обновляем позицию существующего спрайта
						const cubeContainer = this.cubeContainers.get(cube.id)
						if (cubeContainer) {
							const pos = this.cubePositions.get(cube.id)
							if (!pos || pos.r !== r || pos.c !== c) {
								// Позиция изменилась - обновляем её
								this.setCubePosition(cube.id, r, c)
								cubeContainer.container.x = c * this.tileSize
								cubeContainer.container.y = this.calculateYFromBottom(r)
							}

							// КРИТИЧНО: Проверяем и обновляем цвет/текстуру, если цвет изменился
							// Это защита от бага, когда цвет куба в grid не соответствует спрайту
							// ВАЖНО: Если цвет изменился неожиданно, это может указывать на проблему в логике игры
							if (cubeContainer.color !== cube.color) {
								console.warn(
									`[GameRenderer] renderGrid: Color mismatch detected for cube ${cube.id} at (${r}, ${c}): ` +
										`renderer color=${cubeContainer.color}, grid color=${cube.color}. ` +
										`This may indicate a bug in game logic.`
								)
								const newTexture = getBlockTexture(cube.color)
								if (newTexture && cubeContainer.sprite) {
									if (cubeContainer.sprite.texture !== newTexture) {
										cubeContainer.sprite.texture = newTexture
									}
									cubeContainer.color = cube.color
								}
							}
						}
					} else {
						// Новый куб - нужно создать спрайт
						cubesToCreate.push({ cube, r, c })
					}
				}
			}
		}

		// Удаляем спрайты для кубов, которых больше нет в grid
		const cubesToRemove: number[] = []
		for (const cubeId of this.cubeContainers.keys()) {
			if (
				!existingCubeIds.has(cubeId) &&
				(!excludeCubeIds || !excludeCubeIds.has(cubeId))
			) {
				cubesToRemove.push(cubeId)
			}
		}

		for (const cubeId of cubesToRemove) {
			const cubeContainer = this.cubeContainers.get(cubeId)
			if (cubeContainer && cubeContainer.container) {
				gsap.killTweensOf(cubeContainer.container)
				if (cubeContainer.container.scale) {
					gsap.killTweensOf(cubeContainer.container.scale)
				}

				if (cubeContainer.container.parent) {
					cubeContainer.container.parent.removeChild(cubeContainer.container)
				}

				if (cubeContainer.container && cubeContainer.container.scale) {
					cubeContainer.container.destroy({ children: true })
				}

				this.cubeContainers.delete(cubeId)
				this.deleteCubePosition(cubeId)
			}
		}

		// Создаем спрайты только для новых кубов
		for (const { cube, r, c } of cubesToCreate) {
			this.createCubeSprite(cube, r, c)
		}

		// Restore selection if it exists
		if (this.selectedPosition) {
			this.setSelectedPosition(this.selectedPosition.r, this.selectedPosition.c)
		}

		// Ждем первого реального рендера через ticker
		// Это гарантирует, что плитки действительно отрисованы на экране
		await new Promise<void>((resolve) => {
			if (!this.app) {
				resolve()
				return
			}
			// Используем addOnce для ожидания следующего кадра рендеринга
			this.app.ticker.addOnce(() => {
				resolve()
			})
		})
	}

	/**
	 * Рассчитать позицию Y для строки r, выровненную снизу сосуда
	 * @param r - индекс строки в grid (0 = верх, gridHeight-1 = низ)
	 * @param gridHeight - высота grid
	 * @returns позиция Y в пикселях, выровненная снизу
	 */
	private calculateYFromBottom(r: number): number {
		// Выравниваем снизу: строка 0 (верх) внизу, строка gridHeight-1 (низ) вверху
		return r * this.tileSize
	}

	/**
	 * Преобразовать координаты центра экрана браузера в координаты канваса PixiJS
	 * @returns объект с координатами {x, y} в системе координат канваса
	 */
	private getScreenCenterInCanvasCoordinates(): { x: number; y: number } {
		if (!this.app || !this.canvas) {
			// Fallback: возвращаем центр renderer
			return {
				x: Number(this?.app?.renderer?.width) / 2 || 0,
				y: Number(this?.app?.renderer?.height) / 2 || 0,
			}
		}

		// Получаем центр экрана браузера
		const screenCenterX = window.innerWidth / 2
		const screenCenterY = window.innerHeight / 2

		// Получаем позицию канваса на экране
		const canvasRect = this.canvas.getBoundingClientRect()

		// Координаты центра экрана относительно канваса (в CSS пикселях)
		const relativeX = screenCenterX - canvasRect.left
		const relativeY = screenCenterY - canvasRect.top

		// Преобразуем в координаты канваса PixiJS с учетом масштаба
		// Используем соотношение между CSS размерами и логическими размерами PixiJS
		const scaleX = this.app.renderer.width / canvasRect.width
		const scaleY = this.app.renderer.height / canvasRect.height

		const canvasX = relativeX * scaleX
		const canvasY = relativeY * scaleY

		return { x: canvasX, y: canvasY }
	}

	/**
	 * Center of the canvas element (игровая область).
	 */
	private getCanvasCenterInCanvasCoordinates(): { x: number; y: number } {
		if (!this.app || !this.canvas) {
			return {
				x: Number(this?.app?.renderer?.width) / 2 || 0,
				y: Number(this?.app?.renderer?.height) / 2 || 0,
			}
		}
		const canvasRect = this.canvas.getBoundingClientRect()
		const centerX = canvasRect.left + canvasRect.width / 2
		const centerY = canvasRect.top + canvasRect.height / 2
		const relativeX = centerX - canvasRect.left
		const relativeY = centerY - canvasRect.top
		const scaleX = this.app.renderer.width / canvasRect.width
		const scaleY = this.app.renderer.height / canvasRect.height
		return {
			x: relativeX * scaleX,
			y: relativeY * scaleY,
		}
	}

	/**
	 * Position popup in the visual center of the phone viewport.
	 */
	private positionPopupAtViewportCenter(
		popup: Container,
		width: number,
		height: number
	): void {
		const screenCenter = this.getScreenCenterInCanvasCoordinates()
		popup.x = screenCenter.x - width / 2
		popup.y = screenCenter.y - height / 2
	}

	/**
	 * Position popup in the center of the canvas (игровая область).
	 */
	private positionPopupAtCanvasCenter(
		popup: Container,
		width: number,
		height: number
	): void {
		const center = this.getCanvasCenterInCanvasCoordinates()
		popup.x = center.x - width / 2
		popup.y = center.y - height / 2
	}

	/**
	 * Keep popup pinned to viewport center even when container scrolls.
	 */
	private pinPopupToViewportCenter(
		popup: Container,
		width: number,
		height: number
	): () => void {
		if (!this.app) {
			this.positionPopupAtViewportCenter(popup, width, height)
			return () => {}
		}

		const updatePosition = () => {
			this.positionPopupAtViewportCenter(popup, width, height)
		}

		updatePosition()
		this.app.ticker.add(updatePosition)

		return () => {
			if (this.app) {
				this.app.ticker.remove(updatePosition)
			}
		}
	}

	/**
	 * Keep popup pinned to canvas center (центр игровой области).
	 */
	private pinPopupToCanvasCenter(
		popup: Container,
		width: number,
		height: number
	): () => void {
		if (!this.app) {
			this.positionPopupAtCanvasCenter(popup, width, height)
			return () => {}
		}

		const updatePosition = () => {
			this.positionPopupAtCanvasCenter(popup, width, height)
		}

		updatePosition()
		this.app.ticker.add(updatePosition)

		return () => {
			if (this.app) {
				this.app.ticker.remove(updatePosition)
			}
		}
	}

	private createCubeSprite(
		cube: Cube,
		r: number,
		c: number,
		initialAlpha: number = 1,
		initialScale: number = 1
	): CubeContainer {
		if (!this.gameContainer) {
			throw new Error('Game container not initialized')
		}

		const texture = getBlockTexture(cube.color)

		if (!texture) {
			throw new Error(`Texture not found for color ${cube.color}`)
		}

		// КРИТИЧНО: Проверяем размеры текстуры (в PixiJS v8 нет texture.valid)
		// Если текстура еще не готова, это может привести к проблемам с анимацией
		if (texture.width <= 0 || texture.height <= 0) {
			console.warn(`Texture for color ${cube.color} has invalid dimensions`, {
				width: texture.width,
				height: texture.height,
				textureSource: texture.source ? 'exists' : 'missing',
			})
			// Пытаемся получить информацию о внутреннем изображении
			try {
				const source = texture.source as any
				if (source && source.resource) {
					const img = source.resource.source || source.resource
					if (img && img instanceof HTMLImageElement) {
						console.warn(`Image element state:`, {
							complete: img.complete,
							naturalWidth: img.naturalWidth,
							naturalHeight: img.naturalHeight,
							src: img.src.substring(0, 50) + '...',
						})
					}
				}
			} catch (e) {
				// Игнорируем ошибки доступа
			}
		}

		// Create container for cube
		const container = new Container()
		;(container as CubeSpriteContainer).__cubeId = cube.id
		container.x = c * this.tileSize
		container.y = this.calculateYFromBottom(r)

		// КРИТИЧНО: Устанавливаем начальные состояния (могут быть изменены для анимации)
		container.visible = true
		container.alpha = initialAlpha
		container.scale.set(initialScale)

		// Create sprite
		const sprite = new Sprite(texture)
		const spriteSize = Math.max(1, this.tileSize - TILE_PADDING * 2)

		// КРИТИЧНО: Убеждаемся, что спрайт видим
		sprite.visible = true
		sprite.alpha = 1

		// КРИТИЧНО: В PixiJS v8 установка width/height автоматически изменяет scale
		// НЕ устанавливаем scale.set(1) ПОСЛЕ width/height, так как это сбросит размеры!
		// Устанавливаем размеры напрямую через width/height
		sprite.width = spriteSize
		sprite.height = spriteSize
		sprite.x = TILE_PADDING
		sprite.y = TILE_PADDING

		container.addChild(sprite)

		// Проверяем, что спрайт добавлен в контейнер (только для отладки)
		if (!sprite.parent || sprite.parent !== container) {
			console.error('Failed to add sprite to container', {
				cubeId: cube.id,
				hasParent: !!sprite.parent,
				parentMatches: sprite.parent === container,
			})
		}

		// Create text for moves (color #1F2937, small white shadow for visibility)
		let text: Text | null = null
		if (cube.moves > 0) {
			text = new Text({
				text: String(cube.moves),
				style: new TextStyle({
					fontFamily: 'Inter, Arial',
					fontSize: Math.max(11, this.tileSize / 2.8),
					fill: 0x1f2937,
					align: 'center',
					fontWeight: 'bold',
					dropShadow: {
						color: 0xffffff,
						blur: 2,
						distance: 1,
						alpha: 0.3,
					},
				}),
			})
			text.resolution = window.devicePixelRatio || 1
			text.anchor.set(0.5)
			text.x = this.tileSize / 2
			text.y = this.tileSize / 2
			container.addChild(text)
		}

		// Create highlight (initially hidden) – subtle selection ring
		const highlight = new Graphics()
		const hlR = Math.round(spriteSize * 0.2)
		highlight.roundRect(TILE_PADDING - 1, TILE_PADDING - 1, spriteSize + 2, spriteSize + 2, hlR + 1)
		highlight.stroke({ color: 0xffffff, width: 2, alpha: 0.6 })
		highlight.roundRect(TILE_PADDING, TILE_PADDING, spriteSize, spriteSize, hlR)
		highlight.fill({ color: 0xffffff, alpha: 0.12 })
		highlight.visible = false
		container.addChild(highlight)
		this.gameContainer.addChild(container)

		// Проверяем, что контейнер добавлен в gameContainer (только для отладки)
		if (!container.parent || container.parent !== this.gameContainer) {
			console.error('Failed to add container to gameContainer', {
				cubeId: cube.id,
				position: { r, c },
				hasParent: !!container.parent,
				parentMatches: container.parent === this.gameContainer,
			})
		}

		this.cubeContainers.set(cube.id, {
			container,
			sprite,
			text,
			highlight,
			color: cube.color,
		})
		this.setCubePosition(cube.id, r, c)

		// Update highlight if this position is selected
		if (
			this.selectedPosition &&
			this.selectedPosition.r === r &&
			this.selectedPosition.c === c
		) {
			highlight.visible = true
		}

		return { container, sprite, text, highlight, color: cube.color }
	}

	/**
	 * Удаляет "осиротевшие" куб-спрайты из gameContainer.
	 * Это защита от визуальных дублей, когда контейнер остался в сцене,
	 * но уже отсутствует в cubeContainers/cubePositions.
	 */
	private cleanupOrphanCubeSprites(): void {
		if (!this.gameContainer) return

		const mappedContainers = new Set<Container>()
		for (const cubeContainer of this.cubeContainers.values()) {
			mappedContainers.add(cubeContainer.container)
		}

		const orphanChildren: CubeSpriteContainer[] = []
		for (const child of this.gameContainer.children) {
			const cubeChild = child as CubeSpriteContainer
			const cubeId = cubeChild.__cubeId
			if (cubeId === undefined) continue

			const mapped = this.cubeContainers.get(cubeId)
			const isMappedToThisContainer = mapped?.container === child
			if (!isMappedToThisContainer || !mappedContainers.has(child as Container)) {
				orphanChildren.push(cubeChild)
			}
		}

		for (const orphan of orphanChildren) {
			gsap.killTweensOf(orphan)
			if (orphan.parent) {
				orphan.parent.removeChild(orphan)
			}
			if (orphan && (orphan as Container).scale) {
				orphan.destroy({ children: true })
			}
		}
	}

	private maybeCleanupOrphanCubeSprites(): void {
		if (!this.gameContainer) return

		this.syncCounter++
		const extraChildren = this.gameContainer.children.length - this.cubeContainers.size
		if (extraChildren <= 2 && this.syncCounter % 5 !== 0) {
			return
		}

		this.cleanupOrphanCubeSprites()
	}

	updateCubeMoves(cubeId: number, moves: number): void {
		const cubeContainer = this.cubeContainers.get(cubeId)
		if (!cubeContainer) return

		if (moves > 0) {
			if (!cubeContainer.text) {
				// Create text if it doesn't exist (matches createCubeSprite style)
				cubeContainer.text = new Text({
					text: String(moves),
					style: new TextStyle({
						fontFamily: 'Inter, Arial',
						fontSize: Math.max(11, this.tileSize / 2.8),
						fill: 0x1f2937,
						align: 'center',
						fontWeight: 'bold',
						dropShadow: {
							color: 0xffffff,
							blur: 2,
							distance: 1,
							alpha: 0.3,
						},
					}),
				})
				cubeContainer.text.resolution = window.devicePixelRatio || 1
				cubeContainer.text.anchor.set(0.5)
				cubeContainer.text.x = this.tileSize / 2
				cubeContainer.text.y = this.tileSize / 2
				cubeContainer.container.addChild(cubeContainer.text)
			} else {
				// Update existing text
				const nextText = String(moves)
				if (cubeContainer.text.text !== nextText) {
					cubeContainer.text.text = nextText
				}
			}
		} else {
			// Remove text if moves is 0
			if (cubeContainer.text) {
				cubeContainer.container.removeChild(cubeContainer.text)
				cubeContainer.text.destroy()
				cubeContainer.text = null
			}
		}
	}

	setSelectedPosition(r: number | null, c: number | null): void {
		// Remove previous selection
		this.cubeContainers.forEach((cc) => {
			if (cc.highlight) cc.highlight.visible = false
		})

		// Set new selection
		if (r !== null && c !== null) {
			this.selectedPosition = { r, c }
			const cubeId = this.findCubeIdAt(r, c)
			if (cubeId !== null) {
				const cubeContainer = this.cubeContainers.get(cubeId)
				if (cubeContainer?.highlight) {
					cubeContainer.highlight.visible = true
				}
			}
		} else {
			this.selectedPosition = null
		}
	}

	async applyEvents(events: GameEvent[]): Promise<void> {
		for (const event of events) {
			switch (event.type) {
				case 'swap':
					await this.animateSwap(event.a, event.b)
					break
				case 'move':
					await this.animateMove(event.from, event.to)
					break
				case 'fall':
					await this.animateFall(event.items)
					break
				case 'remove':
					// Воспроизводим звук во время анимации удаления
					if (event.chainIndex !== undefined) {
						const isCascade = event.chainIndex > 1
						AudioManager.playMatch(event.chainIndex, isCascade)
					}
					await this.animateRemove(
						event.cells,
						event.baseScore,
						event.comboBonus
					)
					break
				case 'spawn':
					await this.animateSpawn(event.cells)
					break
				case 'gameover':
					// No animation, just handled by game state
					break
			}
		}
	}

	private async animateSwap(
		a: { r: number; c: number },
		b: { r: number; c: number }
	): Promise<void> {
		// Find cube IDs at positions a and b
		const cubeIdA = this.findCubeIdAt(a.r, a.c)
		const cubeIdB = this.findCubeIdAt(b.r, b.c)

		if (cubeIdA === null || cubeIdB === null) return

		const containerA = this.cubeContainers.get(cubeIdA)
		const containerB = this.cubeContainers.get(cubeIdB)

		if (!containerA || !containerB) return

		const posAX = a.c * this.tileSize
		const posAY = this.calculateYFromBottom(a.r)
		const posBX = b.c * this.tileSize
		const posBY = this.calculateYFromBottom(b.r)

		// Update positions
		this.setCubePosition(cubeIdA, b.r, b.c)
		this.setCubePosition(cubeIdB, a.r, a.c)

	await Promise.all([
		new Promise<void>((resolve) => {
			gsap.killTweensOf(containerA.container)
			gsap.to(containerA.container, {
				x: posBX,
				y: posBY,
				duration: 0.1,
				ease: 'power2.out',
				onComplete: resolve,
				onInterrupt: () => {
					containerA.container.x = posBX
					containerA.container.y = posBY
					resolve()
				},
			})
		}),
		new Promise<void>((resolve) => {
			gsap.killTweensOf(containerB.container)
			gsap.to(containerB.container, {
				x: posAX,
				y: posAY,
				duration: 0.1,
				ease: 'power2.out',
				onComplete: resolve,
				onInterrupt: () => {
					containerB.container.x = posAX
					containerB.container.y = posAY
					resolve()
				},
			})
		}),
	])
	}

	private async animateMove(
		from: { r: number; c: number },
		to: { r: number; c: number }
	): Promise<void> {
		const cubeId = this.findCubeIdAt(from.r, from.c)
		if (cubeId === null) return

		const cubeContainer = this.cubeContainers.get(cubeId)
		if (!cubeContainer) return

		// Update position
		this.setCubePosition(cubeId, to.r, to.c)

		const targetX = to.c * this.tileSize
		const targetY = this.calculateYFromBottom(to.r)

	await new Promise<void>((resolve) => {
		gsap.killTweensOf(cubeContainer.container)
		gsap.to(cubeContainer.container, {
			x: targetX,
			y: targetY,
			duration: 0.1,
			ease: 'power2.out',
			onComplete: resolve,
			onInterrupt: () => {
				cubeContainer.container.x = targetX
				cubeContainer.container.y = targetY
				resolve()
			},
		})
	})
}

private async animateFall(
		items: Array<{
			id?: number
			from: { r: number; c: number }
			to: { r: number; c: number }
			color: number
		}>
	): Promise<void> {
		// Дедупликация по cubeId: для каждого куба анимируем только конечную позицию.
		// Иначе возможны конкурирующие tweens одного контейнера и визуальные артефакты.
		const finalFallByCube = new Map<
			number,
			{ to: { r: number; c: number }; from: { r: number; c: number } }
		>()

		for (const item of items) {
			let cubeId: number | null = null
			if (item.id !== undefined) {
				cubeId = item.id
			} else {
				cubeId = this.findCubeIdAt(item.from.r, item.from.c)
			}
			if (cubeId === null) continue
			const existing = finalFallByCube.get(cubeId)
			if (existing) {
				finalFallByCube.set(cubeId, { from: existing.from, to: item.to })
			} else {
				finalFallByCube.set(cubeId, { from: item.from, to: item.to })
			}
		}

		const animations = Array.from(finalFallByCube.entries()).map(([cubeId, item]) => {
			const cubeContainer = this.cubeContainers.get(cubeId)
			if (!cubeContainer) return Promise.resolve()

			this.setCubePosition(cubeId, item.to.r, item.to.c)

			const targetX = item.to.c * this.tileSize
			const targetY = this.calculateYFromBottom(item.to.r)
			const fallDistance = Math.max(1, Math.abs(item.to.r - item.from.r))
		// Block Blast fall: snappy with tiny landing bounce.
		// Formula: min(0.30, 0.08 + distance * 0.055) → fast drops
		const duration = Math.min(0.30, 0.08 + fallDistance * 0.055)

			return new Promise<void>((resolve) => {
				gsap.killTweensOf(cubeContainer.container)
				gsap.to(cubeContainer.container, {
					x: targetX,
					y: targetY,
					duration,
					ease: 'bounce.out',
					onComplete: resolve,
					onInterrupt: () => {
						cubeContainer.container.x = targetX
						cubeContainer.container.y = targetY
						resolve()
					},
				})
			})
		})

		await Promise.all(animations)

		// КРИТИЧНО: Ждем дополнительный кадр после завершения всех анимаций fall
		// Это гарантирует, что браузер успел отрендерить финальное состояние всех спрайтов
		await this.waitForNextFrame()
	}

	private async animateRemove(
		cells: Array<{
			r: number
			c: number
			color: number
			id: number
			moves?: number
		}>,
		baseScore?: number,
		comboBonus?: number
	): Promise<void> {
		// Use cube IDs directly from the event instead of finding by position
		const cubeIdsToRemove: number[] = cells.map((cell) => cell.id)

		const containers = cubeIdsToRemove
			.map((id) => this.cubeContainers.get(id))
			.filter((c): c is CubeContainer => c !== undefined)

		if (containers.length === 0) return

		// Score popup at center of screen
		if (
			this.app &&
			cells.length > 0 &&
			(baseScore !== undefined ||
				(comboBonus !== undefined && (comboBonus ?? 0) > 0))
		) {
			// Получаем центр экрана в координатах канваса
			const screenCenter = this.getScreenCenterInCanvasCoordinates()

			const popup = new Container()

			// Создаем тексты для расчета размеров
			// Адаптивный размер текста: не слишком большой, но видимый
			const baseFontSize = Math.min(
				Math.max(20, window.innerWidth * 0.05),
				Math.max(20, this.tileSize * 1.0)
			)
			const comboFontSize = Math.min(
				Math.max(16, window.innerWidth * 0.04),
				Math.max(16, this.tileSize * 0.8)
			)

		const baseVal = baseScore ?? 0
		let baseText: Text | null = null
		if (baseVal > 0) {
			baseText = new Text({
				text: `+${baseVal}`,
				style: new TextStyle({
					fontFamily: 'Inter, Arial',
					fontSize: baseFontSize,
					fill: 0xffffff,
					align: 'center',
					fontWeight: 'bold',
					dropShadow: {
						color: 0x000000,
						blur: 6,
						distance: 2,
						alpha: 0.7,
					},
				}),
			})
			baseText.resolution = window.devicePixelRatio || 1
			baseText.anchor.set(0.5)
			baseText.style.stroke = { color: 0x22c55e, width: 3 }
			popup.addChild(baseText)
		}

		const comboVal = comboBonus ?? 0
		let comboText: Text | null = null
		if (comboVal > 0) {
			comboText = new Text({
				text: `🔥 x${comboVal} COMBO`,
				style: new TextStyle({
					fontFamily: 'Inter, Arial',
					fontSize: comboFontSize,
					fill: 0xfde047,
					align: 'center',
					fontWeight: 'bold',
					dropShadow: {
						color: 0x000000,
						blur: 6,
						distance: 2,
						alpha: 0.7,
					},
				}),
			})
			comboText.resolution = window.devicePixelRatio || 1
			comboText.anchor.set(0.5)
			comboText.style.stroke = { color: 0xf97316, width: 3 }
			popup.addChild(comboText)
		}

			// Рассчитываем размеры текстов для правильного позиционирования
			const baseTextWidth = baseText?.width ?? 0
			const baseTextHeight = baseText?.height ?? 0
			const comboTextWidth = comboText?.width ?? 0
			const comboTextHeight = comboText?.height ?? 0

			// Максимальная ширина для расчета позиции
			const maxTextWidth = Math.max(baseTextWidth, comboTextWidth)
			const totalTextHeight =
				(baseTextHeight > 0 ? baseTextHeight : 0) +
				(comboTextHeight > 0
					? comboTextHeight + (baseTextHeight > 0 ? 10 : 0)
					: 0)

			// Позиционируем popup в центре экрана, учитывая размеры текстов
			// Сдвигаем влево на половину ширины самого широкого текста
			// Сдвигаем вниз на половину общей высоты текстов
			popup.x = screenCenter.x - maxTextWidth / 2
			popup.y = screenCenter.y - totalTextHeight / 2

			// Ensure popup is on top by setting zIndex
			popup.zIndex = 999999
			this.app.stage.sortableChildren = true

			// Позиционируем тексты относительно popup
			if (baseText) {
				baseText.x = maxTextWidth / 2
				baseText.y = baseTextHeight / 2
			}
			if (comboText) {
				comboText.x = maxTextWidth / 2
				comboText.y =
					(baseTextHeight > 0 ? baseTextHeight + 10 : 0) + comboTextHeight / 2
			}

			// Добавляем на stage для отображения поверх всего
			this.app.stage.addChild(popup)
			// High zIndex = drawn last = on top (Pixi draws children in array order)
		this.app.stage.children.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

			// Анимация появления и исчезновения
			popup.alpha = 0
			gsap.to(popup, {
				alpha: 1,
				duration: 0.2,
				ease: 'power2.out',
			})
			gsap.to(popup, {
				y: popup.y - 45,
				alpha: 0,
				duration: 2.0,
				delay: 0.3,
				ease: 'power2.out',
				onComplete: () => {
					// КРИТИЧНО: Убиваем все GSAP анимации перед уничтожением
					gsap.killTweensOf(popup)
					// КРИТИЧНО: Проверяем, что popup еще существует перед уничтожением
					if (popup && popup.parent) {
						popup.parent.removeChild(popup)
					}
					if (popup) {
						popup.destroy({ children: true })
					}
				},
			})
		}

		await Promise.all(
			containers.map(
				(cubeContainer) =>
					new Promise<void>((resolve) => {
						if (!cubeContainer || !cubeContainer.container) {
							resolve()
							return
						}

						const container = cubeContainer.container
						let resolved = false

						const finish = () => {
							if (resolved) return
							resolved = true

							gsap.killTweensOf(container)
							if (container.scale) gsap.killTweensOf(container.scale)

							if (container.parent) {
								container.parent.removeChild(container)
							}
							if (container && container.scale) {
								container.destroy({ children: true })
							}
							resolve()
						}

					// Match animation: scale 1→1.1, fade out
					if (container.scale) {
						gsap.to(container.scale, {
							x: 1.1,
							y: 1.1,
							duration: 0.15,
							ease: 'power2.out',
						})
						gsap.to(container, {
							alpha: 0,
							duration: 0.15,
							ease: 'power1.in',
							onComplete: finish,
							onInterrupt: finish,
						})
					} else {
						gsap.to(container, {
							alpha: 0,
							duration: 0.18,
							ease: 'power1.in',
							onComplete: finish,
							onInterrupt: finish,
						})
					}
					})
			)
		)

		// Remove from maps
		cubeIdsToRemove.forEach((id) => {
			this.cubeContainers.delete(id)
			this.deleteCubePosition(id)
		})
	}

	private async animateSpawn(
		cells: Array<{
			id: number
			r: number
			c: number
			color: number
			fromRow?: number
			toRow?: number
		}>
	): Promise<void> {
		if (!this.gameContainer) return

		// Текстуры уже должны быть прогреты в warmUpTextures(), поэтому не ждем здесь

		// КРИТИЧНО: Сначала создаем все спрайты синхронно
		// Это гарантирует, что все спрайты добавлены в контейнер перед запуском анимации
		for (const cell of cells) {
			let cubeContainer = this.cubeContainers.get(cell.id)

			// Если есть "битый" контейнер (без parent), пересоздаем его.
			// Иначе спавн может пройти, но плитка останется невидимой.
			if (cubeContainer && !cubeContainer.container.parent) {
				this.cubeContainers.delete(cell.id)
				this.deleteCubePosition(cell.id)
				cubeContainer = undefined
			}

			// Если спрайт еще не создан, создаем его сейчас с правильными начальными состояниями
			if (!cubeContainer) {
				// Создаем временный куб для создания спрайта
				const tempCube: Cube = {
					id: cell.id,
					color: cell.color,
					moves: 0, // moves будет обновлен позже через updateCubeMoves если нужно
				}
				// Создаем спрайт на целевой позиции из события (toRow или r)
				// Это финальная позиция после gravity
				const targetRow = cell.toRow !== undefined ? cell.toRow : cell.r

				// Определяем начальные состояния в зависимости от типа анимации
				if (cell.fromRow !== undefined && cell.fromRow < 0) {
					// Для падения сверху: создаем с alpha=1, scale=1 (будет анимироваться по Y)
					cubeContainer = this.createCubeSprite(
						tempCube,
						targetRow,
						cell.c,
						1,
						1
					)
				} else {
					// Для появления на месте: scale 0.9 → 1, 0.12s
					cubeContainer = this.createCubeSprite(
						tempCube,
						targetRow,
						cell.c,
						1,
						0.9
					)
				}

				// КРИТИЧНО: Проверяем, что спрайт создан и добавлен в контейнер
				if (!cubeContainer || !cubeContainer.container.parent) {
					console.error(
						`Failed to create sprite for cell ${cell.id} at row ${targetRow}, col ${cell.c}`
					)
				} else {
					// Проверяем готовность текстуры после создания спрайта
					const createdTexture = cubeContainer.sprite.texture
					if (
						!createdTexture ||
						createdTexture.width <= 0 ||
						createdTexture.height <= 0
					) {
						console.error(
							`Sprite created but texture not ready for cell ${cell.id}, color ${cell.color}`,
							{
								textureWidth: createdTexture?.width,
								textureHeight: createdTexture?.height,
							}
						)
					}
				}
			}
		}

		// Теперь создаем промисы анимации для всех ячеек
		const animations = cells.map((cell) => {
			const cubeContainer = this.cubeContainers.get(cell.id)
			if (!cubeContainer) {
				console.error(`Cube container not found for cell ${cell.id}`)
				return Promise.resolve()
			}

			const targetRow = cell.toRow !== undefined ? cell.toRow : cell.r
			// Гарантируем синхронизацию позиции в карте даже если она была потеряна.
			this.setCubePosition(cell.id, targetRow, cell.c)
			const targetY = this.calculateYFromBottom(targetRow)

			if (cell.fromRow !== undefined && cell.fromRow < 0) {
				// Для спавна сверху: fromRow отрицательный (например, -1, -2)
				// Рассчитываем позицию сверху canvas: отрицательные значения означают строки выше видимой области
				// Позиция сверху = (gridHeight - 1 + |fromRow|) * tileSize, но это будет выше canvas
				// Для визуального эффекта падения сверху используем отрицательную позицию
				const startY = -Math.abs(cell.fromRow) * this.tileSize
				// КРИТИЧНО: Устанавливаем начальную позицию ПЕРЕД анимацией
				const container = cubeContainer.container

				if (!container) {
					return Promise.resolve()
				}

				container.y = startY
				container.visible = true
				container.alpha = 1
				if (container.scale) {
					container.scale.set(1)
				}
				cubeContainer.sprite.visible = true
				cubeContainer.sprite.alpha = 1

			return new Promise<void>((resolve) => {
				gsap.to(container, {
					y: targetY,
					duration: 0.6,
					ease: 'power2.out',
					onComplete: () => {
						if (container && container.y !== undefined) {
							container.y = targetY
						}
						resolve()
					},
					onInterrupt: () => {
						if (container && container.y !== undefined) {
							container.y = targetY
						}
						resolve()
					},
				})
			})
			} else {
			// Spawn: scale 0.9 → 1, 0.12s
			cubeContainer.container.visible = true
			cubeContainer.sprite.visible = true
			cubeContainer.container.alpha = 1
			if (cubeContainer.container.scale) {
				cubeContainer.container.scale.set(0.9)
			}

			return new Promise<void>((resolve) => {
				const container = cubeContainer.container

				gsap.killTweensOf(container)
				if (container.scale) {
					gsap.killTweensOf(container.scale)
					gsap.set(container.scale, { x: 0.9, y: 0.9 })
				}
				gsap.to(container.scale, {
					x: 1,
					y: 1,
					duration: 0.12,
					ease: 'power2.out',
					onComplete: () => {
						container.scale?.set(1)
						resolve()
					},
					onInterrupt: () => {
						container.scale?.set(1)
						resolve()
					},
				})
			})
			}
		})

		// Ждем один кадр перед запуском всех анимаций для синхронизации
		await this.waitForNextFrame()

		await Promise.all(animations)

		// Fallback: после анимаций гарантируем, что все заспавненные кубы реально существуют
		// и находятся в полностью видимом состоянии.
		for (const cell of cells) {
			let cubeContainer = this.cubeContainers.get(cell.id)
			const targetRow = cell.toRow !== undefined ? cell.toRow : cell.r
			const targetY = this.calculateYFromBottom(targetRow)

			if (!cubeContainer) {
				const tempCube: Cube = {
					id: cell.id,
					color: cell.color,
					moves: 0,
				}
				cubeContainer = this.createCubeSprite(tempCube, targetRow, cell.c, 1, 1)
			}

			this.setCubePosition(cell.id, targetRow, cell.c)
			const container = cubeContainer.container
			container.x = cell.c * this.tileSize
			container.y = targetY
			container.visible = true
			container.alpha = 1
			if (container.scale) {
				container.scale.set(1)
			}
			cubeContainer.sprite.visible = true
			cubeContainer.sprite.alpha = 1
		}

		// КРИТИЧНО: Ждем дополнительный кадр после завершения всех анимаций
		// Это гарантирует, что браузер успел отрендерить финальное состояние всех спрайтов
		// перед тем как продолжить выполнение (например, проверку матчей)
		await this.waitForNextFrame()
	}

	private findCubeIdAt(r: number, c: number): number | null {
		return this.positionToCubeId.get(this.makePosKey(r, c)) ?? null
	}

	private makePosKey(r: number, c: number): string {
		return `${r},${c}`
	}

	private setCubePosition(cubeId: number, r: number, c: number): void {
		const prev = this.cubePositions.get(cubeId)
		if (prev) {
			const prevKey = this.makePosKey(prev.r, prev.c)
			if (this.positionToCubeId.get(prevKey) === cubeId) {
				this.positionToCubeId.delete(prevKey)
			}
		}
		this.cubePositions.set(cubeId, { r, c })
		this.positionToCubeId.set(this.makePosKey(r, c), cubeId)
	}

	private deleteCubePosition(cubeId: number): void {
		const prev = this.cubePositions.get(cubeId)
		if (prev) {
			const prevKey = this.makePosKey(prev.r, prev.c)
			if (this.positionToCubeId.get(prevKey) === cubeId) {
				this.positionToCubeId.delete(prevKey)
			}
		}
		this.cubePositions.delete(cubeId)
	}

	updateTileSize(
		newTileSize: number,
		forceUpdatePositions = false,
		gridHeight?: number
	): void {
		const oldTileSize = this.tileSize
		this.tileSize = newTileSize

		// Обновляем gridHeight если передан
		if (gridHeight !== undefined) {
			this.gridHeight = gridHeight
		}

		// Обновить позиции и размеры всех существующих спрайтов
		if (oldTileSize !== newTileSize || forceUpdatePositions) {
			this.cubeContainers.forEach((cubeContainer, cubeId) => {
				const pos = this.cubePositions.get(cubeId)
				if (pos) {
					// Обновить позицию контейнера
					cubeContainer.container.x = pos.c * this.tileSize
					cubeContainer.container.y = this.calculateYFromBottom(pos.r)

					// Обновить размер спрайта
					const spriteSize = Math.max(1, this.tileSize - TILE_PADDING * 2)
					cubeContainer.sprite.width = spriteSize
					cubeContainer.sprite.height = spriteSize

					// Обновить размер текста (если есть)
					if (cubeContainer.text) {
						cubeContainer.text.style.fontSize = Math.max(11, this.tileSize / 2.8)
						cubeContainer.text.resolution = window.devicePixelRatio || 1
						cubeContainer.text.x = this.tileSize / 2
						cubeContainer.text.y = this.tileSize / 2
					}

				// Обновить highlight (если есть)
				if (cubeContainer.highlight) {
					cubeContainer.highlight.clear()
					const hlR = Math.round(spriteSize * 0.2)
					cubeContainer.highlight.roundRect(TILE_PADDING - 1, TILE_PADDING - 1, spriteSize + 2, spriteSize + 2, hlR + 1)
					cubeContainer.highlight.stroke({ color: 0xffffff, width: 2, alpha: 0.6 })
					cubeContainer.highlight.roundRect(TILE_PADDING, TILE_PADDING, spriteSize, spriteSize, hlR)
					cubeContainer.highlight.fill({ color: 0xffffff, alpha: 0.12 })
				}
				}
			})
		}
	}

	/** Переразмер канваса (Pixi) при расширении сосуда */
	resizeCanvas(width: number, height: number, gridHeight?: number): void {
		if (!this.app?.renderer) return

		// Обновляем gridHeight если передан
		if (gridHeight !== undefined) {
			this.gridHeight = gridHeight
		}

		// Устанавливаем CSS размеры (логические пиксели)
		// Это важно для правильного отображения на мобильных устройствах
		this.canvas.style.width = `${width}px`
		this.canvas.style.height = `${height}px`

		// С autoDensity: true PixiJS сам управляет внутренними размерами canvas
		// Мы только устанавливаем CSS размеры и вызываем resize с логическими размерами
		// Resize renderer - передаем логические размеры, PixiJS использует их с resolution
		this.app.renderer.resize(width, height)

		// После resize PixiJS автоматически обновит внутренние размеры canvas
		// через autoDensity, поэтому мы не устанавливаем их вручную

		// При изменении размера canvas нужно пересчитать позиции всех блоков
		// Это важно при расширении сосуда, когда высота canvas меняется
		this.updateAllPositions()
	}

	/** Принудительно обновить позиции всех существующих блоков */
	private updateAllPositions(): void {
		this.cubeContainers.forEach((cubeContainer, cubeId) => {
			const pos = this.cubePositions.get(cubeId)
			if (pos) {
				// Пересчитать позицию контейнера с учетом текущего tileSize и выравнивания снизу
				cubeContainer.container.x = pos.c * this.tileSize
				cubeContainer.container.y = this.calculateYFromBottom(pos.r)
			}
		})
	}

	async showFullClearBonus(bonus: number): Promise<void> {
		if (!this.app) return

		const popup = new Container()
		popup.x = this.canvas.width / 2
		popup.y = this.canvas.height / 2

		// Block Blast style: bright pill background
		const fontSize = Math.max(28, this.tileSize * 1.2)
		const bgW = fontSize * 5
		const bgH = fontSize * 1.8
		const bg = new Graphics()
		bg.roundRect(-bgW / 2, -bgH / 2, bgW, bgH, bgH / 2)
		bg.fill({ color: 0xfacc15, alpha: 0.95 })
		bg.stroke({ color: 0xffffff, width: 3, alpha: 0.8 })
		popup.addChild(bg)

		const t = new Text({
			text: `⭐ CLEAR! +${bonus}`,
			style: new TextStyle({
				fontFamily: 'Inter, Arial',
				fontSize: fontSize,
				fill: 0x1e293b,
				align: 'center',
				fontWeight: 'bold',
			}),
		})
		t.resolution = window.devicePixelRatio || 1
		t.anchor.set(0.5)
		t.x = 0
		t.y = 0
		popup.addChild(t)

		popup.alpha = 0
		if (popup.scale) {
			popup.scale.set(0.5)
		}
		this.app.stage.addChild(popup)

		await new Promise<void>((resolve) => {
			gsap.to(popup, {
				alpha: 1,
				duration: 0.3,
				ease: 'back.out',
			})
			if (popup.scale) {
				gsap.to(popup.scale, {
					x: 1.2,
					y: 1.2,
					duration: 0.3,
					ease: 'back.out',
				})
			}
			gsap.to(popup, {
				alpha: 0,
				y: popup.y - 60,
				duration: 1.0,
				delay: 1.4,
				ease: 'power2.in',
				onComplete: () => {
					// КРИТИЧНО: Убиваем все GSAP анимации перед уничтожением
					gsap.killTweensOf(popup)
					if (popup.scale) {
						gsap.killTweensOf(popup.scale)
					}

					if (popup && popup.parent) {
						popup.parent.removeChild(popup)
					}
					if (popup) {
						popup.destroy({ children: true })
					}
					resolve()
				},
			})
		})
	}

	async showGreatMessage(bonus: number): Promise<void> {
		if (!this.app) return

		const popup = new Container()

		// Получаем центр экрана в координатах канваса
		// Создаем тексты для расчета размеров
		// Адаптивный размер текста: не слишком большой, но видимый
		const baseFontSize = Math.min(Math.max(20, window.innerWidth * 0.05), 32)
		const bonusFontSize = Math.min(Math.max(16, window.innerWidth * 0.038), 24)

		const mainText = new Text({
			text: `✨ Block Cleared!`,
			style: new TextStyle({
				fontFamily: 'Inter, Arial',
				fontSize: baseFontSize,
				fill: 0xffffff,
				align: 'center',
				fontWeight: 'bold',
				letterSpacing: 0.2,
			}),
		})
		mainText.resolution = window.devicePixelRatio || 1
		mainText.anchor.set(0.5)

		const bonusText = new Text({
			text: `+${bonus}`,
			style: new TextStyle({
				fontFamily: 'Inter, Arial',
				fontSize: bonusFontSize,
				fill: 0xfde047,
				align: 'center',
				fontWeight: 'bold',
			}),
		})
		bonusText.resolution = window.devicePixelRatio || 1
		bonusText.anchor.set(0.5)

		// Рассчитываем размеры текстов для правильного позиционирования
		// Размеры текста доступны сразу после создания
		const mainTextWidth = mainText.width
		const mainTextHeight = mainText.height
		const bonusTextWidth = bonusText.width
		const bonusTextHeight = bonusText.height

		// Максимальная ширина для расчета позиции
		const maxTextWidth = Math.max(mainTextWidth, bonusTextWidth)
		const totalTextHeight = mainTextHeight + bonusTextHeight + 10 // 10px отступ между текстами

		// Ensure popup is on top by setting zIndex and enabling sortable children
		popup.zIndex = 999999 // Maximum zIndex to be above all tiles
		this.app.stage.sortableChildren = true

		// Block Blast style: colourful rounded pill panel
		const bg = new Graphics()
		const padding = Math.max(16, window.innerWidth * 0.04)
		const bgWidth = Math.max(maxTextWidth + padding * 2, 160)
		const bgHeight = Math.max(totalTextHeight + padding * 2, 64)
		const bgRadius = bgHeight / 2

		// Центрируем в viewport и дальше пиним к центру во время показа
		const unpinPopup = this.pinPopupToViewportCenter(popup, bgWidth, bgHeight)
		bg.roundRect(0, 0, bgWidth, bgHeight, bgRadius)
		bg.fill({ color: 0x7c3aed, alpha: 0.95 })
		bg.stroke({ color: 0xffffff, width: 2, alpha: 0.5 })
		popup.addChild(bg)

		// Top highlight strip for gloss
		const hlGlow = new Graphics()
		hlGlow.roundRect(4, 4, bgWidth - 8, bgHeight * 0.45, bgRadius - 2)
		hlGlow.fill({ color: 0xffffff, alpha: 0.15 })
		popup.addChild(hlGlow)

		// Позиционируем тексты относительно popup (учитывая размеры)
		mainText.x = bgWidth / 2
		mainText.y = padding + mainTextHeight / 2
		mainText.style.stroke = { color: 0x000000, width: 0 }
		popup.addChild(mainText)

		bonusText.x = bgWidth / 2
		bonusText.y = padding + mainTextHeight + 10 + bonusTextHeight / 2
		bonusText.style.stroke = { color: 0x000000, width: 0 }
		popup.addChild(bonusText)

		popup.alpha = 0
		if (popup.scale) {
			popup.scale.set(0.5)
		}
		// Add to stage last to ensure it's on top of all tiles
		this.app.stage.addChild(popup)
		// Force sort by zIndex to ensure popup renders on top
		this.app.stage.sortableChildren = true
		// High zIndex = drawn last = on top (Pixi draws children in array order)
		this.app.stage.children.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

		// Воспроизводим звук combo5 в момент появления надписи
		AudioManager.playCombo5()

		await new Promise<void>((resolve) => {
			gsap.to(popup, {
				alpha: 1,
				duration: 0.3,
				ease: 'back.out',
			})
			if (popup.scale) {
				gsap.to(popup.scale, {
					x: 1.1,
					y: 1.1,
					duration: 0.3,
					ease: 'back.out',
				})
			}
			gsap.to(popup, {
				alpha: 0,
				duration: 1.0,
				delay: 1.5,
				ease: 'power2.in',
				onComplete: () => {
					unpinPopup()
					// КРИТИЧНО: Убиваем все GSAP анимации перед уничтожением
					gsap.killTweensOf(popup)
					if (popup.scale) {
						gsap.killTweensOf(popup.scale)
					}

					if (popup && popup.parent) {
						popup.parent.removeChild(popup)
					}
					if (popup) {
						popup.destroy({ children: true })
					}
					resolve()
				},
			})
		})
	}

	async showNoMovesMessage(bonus: number): Promise<void> {
		if (!this.app) return

		const popup = new Container()

		// Получаем центр экрана в координатах канваса
		// Создаем тексты для расчета размеров
		// Адаптивный размер текста: не слишком большой, но видимый
		const baseFontSize = Math.min(Math.max(20, window.innerWidth * 0.05), 32)
		const bonusFontSize = Math.min(Math.max(16, window.innerWidth * 0.038), 24)

		const noMovesText = new Text({
			text: '📦 New blocks incoming!',
			style: new TextStyle({
				fontFamily: 'Inter, Arial',
				fontSize: baseFontSize,
				fill: 0xffffff,
				align: 'center',
				fontWeight: 'bold',
				letterSpacing: 0.15,
			}),
		})
		noMovesText.resolution = window.devicePixelRatio || 1
		noMovesText.anchor.set(0.5)

		const bonusText = new Text({
			text: `+${bonus}`,
			style: new TextStyle({
				fontFamily: 'Inter, Arial',
				fontSize: bonusFontSize,
				fill: 0xfde047,
				align: 'center',
				fontWeight: 'bold',
			}),
		})
		bonusText.resolution = window.devicePixelRatio || 1
		bonusText.anchor.set(0.5)

		// Рассчитываем размеры текстов для правильного позиционирования
		// Размеры текста доступны сразу после создания
		const noMovesTextWidth = noMovesText.width
		const noMovesTextHeight = noMovesText.height
		const bonusTextWidth = bonusText.width
		const bonusTextHeight = bonusText.height

		// Максимальная ширина для расчета позиции
		const maxTextWidth = Math.max(noMovesTextWidth, bonusTextWidth)
		const totalTextHeight = noMovesTextHeight + bonusTextHeight + 10 // 10px отступ между текстами

		// Ensure popup is on top by setting zIndex and enabling sortable children
		popup.zIndex = 999999 // Maximum zIndex to be above all tiles
		this.app.stage.sortableChildren = true

		// Block Blast style: orange warning pill panel
		const bg = new Graphics()
		const padding = Math.max(16, window.innerWidth * 0.04)
		const bgWidth = Math.max(maxTextWidth + padding * 2, 160)
		const bgHeight = Math.max(totalTextHeight + padding * 2, 70)
		const bgRadius = bgHeight / 2

		// Центрируем в центре canvas (надёжнее при скролле)
		const unpinPopup = this.pinPopupToCanvasCenter(popup, bgWidth, bgHeight)
		bg.roundRect(0, 0, bgWidth, bgHeight, bgRadius)
		bg.fill({ color: 0xf97316, alpha: 0.95 })
		bg.stroke({ color: 0xffffff, width: 2, alpha: 0.5 })
		popup.addChild(bg)

		// Top highlight strip for gloss
		const hlGlow = new Graphics()
		hlGlow.roundRect(4, 4, bgWidth - 8, bgHeight * 0.45, bgRadius - 2)
		hlGlow.fill({ color: 0xffffff, alpha: 0.18 })
		popup.addChild(hlGlow)

		// Позиционируем тексты относительно popup (учитывая размеры)
		noMovesText.x = bgWidth / 2
		noMovesText.y = padding + noMovesTextHeight / 2
		noMovesText.style.stroke = { color: 0x000000, width: 0 }
		popup.addChild(noMovesText)

		bonusText.x = bgWidth / 2
		bonusText.y = padding + noMovesTextHeight + 10 + bonusTextHeight / 2
		bonusText.style.stroke = { color: 0x000000, width: 0 }
		popup.addChild(bonusText)

		popup.alpha = 0
		if (popup.scale) {
			popup.scale.set(0.5)
		}
		// Add to stage last to ensure it's on top of all tiles
		this.app.stage.addChild(popup)
		// Force sort by zIndex to ensure popup renders on top
		this.app.stage.sortableChildren = true
		// High zIndex = drawn last = on top (Pixi draws children in array order)
		this.app.stage.children.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
		this.forceRender()

		// Воспроизводим звук combo4 в момент появления надписи
		AudioManager.playCombo4()

		await new Promise<void>((resolve) => {
			gsap.to(popup, {
				alpha: 1,
				duration: 0.3,
				ease: 'back.out',
			})
			if (popup.scale) {
				gsap.to(popup.scale, {
					x: 1.1,
					y: 1.1,
					duration: 0.3,
					ease: 'back.out',
				})
			}
			gsap.to(popup, {
				alpha: 0,
				duration: 1.0,
				delay: 1.4,
				ease: 'power2.in',
				onComplete: () => {
					unpinPopup()
					// КРИТИЧНО: Убиваем все GSAP анимации перед уничтожением
					gsap.killTweensOf(popup)
					if (popup.scale) {
						gsap.killTweensOf(popup.scale)
					}

					if (popup && popup.parent) {
						popup.parent.removeChild(popup)
					}
					if (popup) {
						popup.destroy({ children: true })
					}
					resolve()
				},
			})
		})
	}

	async syncGridPositions(
		grid: (Cube | null)[][],
		forceUpdate = false
	): Promise<void> {
		if (!this.gameContainer) return

		// Обновляем высоту grid для расчета позиций снизу
		this.gridHeight = grid.length

		// Update positions of existing cubes and remove cubes that are no longer in grid
		const cubesInGrid = new Set<number>()

		// Collect all cube IDs from grid
		for (let r = 0; r < grid.length; r++) {
			for (let c = 0; c < WIDTH; c++) {
				const cube = grid[r]?.[c]
				if (cube) {
					cubesInGrid.add(cube.id)
					let cubeContainer = this.cubeContainers.get(cube.id)
					if (!cubeContainer) {
						cubeContainer = this.createCubeSprite(cube, r, c, 1, 1)
					}

					// Детерминированно приводим визуальное состояние к grid.
					const pos = this.cubePositions.get(cube.id)
					if (forceUpdate || !pos || pos.r !== r || pos.c !== c) {
						this.setCubePosition(cube.id, r, c)
					}

					cubeContainer.container.x = c * this.tileSize
					cubeContainer.container.y = this.calculateYFromBottom(r)
					cubeContainer.container.visible = true
					cubeContainer.container.alpha = 1
					if (cubeContainer.container.scale) {
						cubeContainer.container.scale.set(1)
					}
					cubeContainer.sprite.visible = true
					cubeContainer.sprite.alpha = 1

					if (cubeContainer.color !== cube.color) {
						const newTexture = getBlockTexture(cube.color)
						if (newTexture && cubeContainer.sprite.texture !== newTexture) {
							cubeContainer.sprite.texture = newTexture
						}
						cubeContainer.color = cube.color
					}

					// Синхронизируем числовой оверлей ходов.
					this.updateCubeMoves(cube.id, cube.moves)
				}
			}
		}

		// Remove cubes that are no longer in grid (but only if they weren't already removed by animateRemove)
		const cubesToRemove: number[] = []
		for (const cubeId of this.cubeContainers.keys()) {
			if (!cubesInGrid.has(cubeId)) {
				cubesToRemove.push(cubeId)
			}
		}

		for (const cubeId of cubesToRemove) {
			const cubeContainer = this.cubeContainers.get(cubeId)
			if (cubeContainer && cubeContainer.container) {
				gsap.killTweensOf(cubeContainer.container)
				if (cubeContainer.container.scale) {
					gsap.killTweensOf(cubeContainer.container.scale)
				}

				// Only remove if still in parent (wasn't already removed by animateRemove)
				if (cubeContainer.container.parent) {
					cubeContainer.container.parent.removeChild(cubeContainer.container)
				}

				if (cubeContainer.container && cubeContainer.container.scale) {
					cubeContainer.container.destroy({ children: true })
				}

				this.cubeContainers.delete(cubeId)
				this.deleteCubePosition(cubeId)
			}
		}

		// Restore selection if it exists
		if (this.selectedPosition) {
			this.setSelectedPosition(this.selectedPosition.r, this.selectedPosition.c)
		}

		// Self-heal: очищаем визуальные дубли в сцене
		this.maybeCleanupOrphanCubeSprites()
	}

	/**
	 * Получить логические размеры экрана из PixiJS
	 * Это важно для правильного расчета координат на мобильных устройствах
	 */
	getScreenSize(): { width: number; height: number } | null {
		if (!this.app) return null
		// Используем screen из PixiJS, который содержит логические размеры
		return {
			width: this.app.screen.width,
			height: this.app.screen.height,
		}
	}

	/**
	 * Проверить, инициализирован ли Pixi Application
	 */
	isInitialized(): boolean {
		return this.app !== null && this.gameContainer !== null
	}

	/**
	 * Проверить, что все плитки готовы и отрисованы
	 * Проверяет, что сетка построена, все текстуры загружены и все спрайты созданы
	 */
	areTilesReady(): boolean {
		if (!this.gameContainer || !this.app) {
			console.warn('areTilesReady: gameContainer or app is not initialized')
			return false
		}

		// Проверяем, что есть хотя бы одна плитка
		if (this.cubeContainers.size === 0) {
			console.warn('areTilesReady: no cube containers')
			return false
		}

		// Проверяем, что ВСЕ спрайты имеют валидные текстуры и добавлены в контейнер
		for (const [cubeId, cubeContainer] of this.cubeContainers.entries()) {
			// Проверяем наличие спрайта
			if (!cubeContainer.sprite) {
				console.warn(`areTilesReady: sprite missing for cube ${cubeId}`)
				return false
			}

			// Проверяем наличие текстуры
			if (!cubeContainer.sprite.texture) {
				console.warn(`areTilesReady: texture missing for cube ${cubeId}`)
				return false
			}

			// КРИТИЧНО: Проверяем размеры текстуры (в PixiJS v8 нет texture.valid)
			if (
				cubeContainer.sprite.texture.width <= 0 ||
				cubeContainer.sprite.texture.height <= 0
			) {
				console.warn(
					`areTilesReady: texture has invalid dimensions for cube ${cubeId}`
				)
				return false
			}

			// Проверяем, что контейнер добавлен в gameContainer
			if (
				!cubeContainer.container.parent ||
				cubeContainer.container.parent !== this.gameContainer
			) {
				console.warn(
					`areTilesReady: container not in gameContainer for cube ${cubeId}`
				)
				return false
			}

			// Проверяем базовые свойства видимости (только visible, alpha может быть 0 для анимаций)
			if (!cubeContainer.container.visible) {
				console.warn(`areTilesReady: container not visible for cube ${cubeId}`)
				return false
			}

			// Проверяем, что спрайт видим
			if (!cubeContainer.sprite.visible) {
				console.warn(`areTilesReady: sprite not visible for cube ${cubeId}`)
				return false
			}
		}

		// Все плитки готовы
		return true
	}

	/**
	 * Принудительно отрисовать кадр
	 * КРИТИЧНО: Используем правильный метод рендеринга для PixiJS v8
	 */
	forceRender(): void {
		if (!this.app || !this.app.renderer || !this.app.stage) {
			return
		}

		// КРИТИЧНО: В PixiJS v8 нужно явно указать stage для рендеринга
		// app.render() может не работать правильно, используем renderer.render(stage)
		try {
			this.app.renderer.render(this.app.stage)
		} catch (error) {
			console.error('Error during force render:', error)
		}
	}

	/**
	 * Ждать следующего кадра рендеринга PixiJS
	 * Используется для синхронизации перед запуском анимаций
	 */
	async waitForNextFrame(): Promise<void> {
		if (!this.app) {
			return Promise.resolve()
		}

		return new Promise<void>((resolve) => {
			// Используем requestAnimationFrame для синхронизации с браузером
			requestAnimationFrame(() => {
				// И еще один кадр PixiJS ticker для гарантии
				if (this.app && this.app.ticker) {
					this.app.ticker.addOnce(() => {
						resolve()
					})
				} else {
					resolve()
				}
			})
		})
	}

	/**
	 * КРИТИЧНО: Ждать, пока плитки реально видны на экране
	 * Проверяет готовность текстур, наличие спрайтов в дереве и ждет реального рендера
	 * Используется для строгой синхронизации перед скрытием loading overlay
	 * ДЕТЕРМИНИРОВАННЫЙ ПОДХОД: ждет строго первый видимый кадр без лишних задержек
	 */
	async waitForTilesVisible(): Promise<void> {
		const startTime = performance.now()

		if (!this.app || !this.gameContainer) {
			console.warn('waitForTilesVisible: app or gameContainer not initialized')
			return
		}

		// 1. Проверяем, что renderer инициализирован и имеет валидные размеры
		if (
			!this.app.renderer ||
			this.app.renderer.width <= 0 ||
			this.app.renderer.height <= 0
		) {
			console.warn('waitForTilesVisible: renderer has invalid dimensions', {
				width: this.app.renderer?.width,
				height: this.app.renderer?.height,
			})
			throw new Error('Renderer not ready')
		}

		// 2. Проверяем, что ticker запущен
		if (!this.app.ticker.started) {
			console.warn('waitForTilesVisible: ticker not started, starting manually')
			this.app.ticker.start()
		}

		// 3. Проверяем, что canvas в DOM и имеет валидные размеры
		if (!document.body.contains(this.canvas)) {
			console.warn('waitForTilesVisible: canvas not in DOM')
			throw new Error('Canvas not in DOM')
		}

		// КРИТИЧНО: Ждем, пока canvas получит правильные размеры
		// Это особенно важно при возврате на страницу игры
		let canvasRect = this.canvas.getBoundingClientRect()
		let attempts = 0
		const maxAttempts = 20 // Максимум 20 попыток (примерно 1 секунда)
		while (
			(canvasRect.width <= 0 || canvasRect.height <= 0) &&
			attempts < maxAttempts
		) {
			attempts++
			// Ждем несколько кадров для расчета layout
			await new Promise((resolve) => requestAnimationFrame(resolve))
			await new Promise((resolve) => requestAnimationFrame(resolve))
			await new Promise((resolve) => setTimeout(resolve, 50))
			canvasRect = this.canvas.getBoundingClientRect()
		}

		if (canvasRect.width <= 0 || canvasRect.height <= 0) {
			console.warn('waitForTilesVisible: canvas has zero dimensions after waiting', {
				width: canvasRect.width,
				height: canvasRect.height,
				attempts,
			})
			throw new Error('Canvas has zero dimensions')
		}

		// 4. Проверяем, что есть плитки
		if (this.cubeContainers.size === 0) {
			console.warn('waitForTilesVisible: no tiles created')
			throw new Error('No tiles created')
		}

		// 5. Проверяем готовность всех текстур (быстрая проверка)
		const { waitForTexturesReady } = await import('../blockTextures')
		try {
			await waitForTexturesReady(2000) // Короткий таймаут для проверки
		} catch (error) {
			console.warn('waitForTilesVisible: textures not ready', error)
			// Продолжаем, но это может привести к проблемам
		}

		// 6. Проверяем, что все спрайты имеют валидные текстуры и добавлены в дерево
		for (const [cubeId, cubeContainer] of this.cubeContainers.entries()) {
			if (!cubeContainer.sprite || !cubeContainer.sprite.texture) {
				console.warn(
					`[GameRenderer] waitForTilesVisible: sprite or texture missing for cube ${cubeId}`
				)
				throw new Error(`Sprite or texture missing for cube ${cubeId}`)
			}

			if (
				cubeContainer.sprite.texture.width <= 0 ||
				cubeContainer.sprite.texture.height <= 0
			) {
				console.warn(
					`[GameRenderer] waitForTilesVisible: texture has invalid dimensions for cube ${cubeId}`,
					{
						width: cubeContainer.sprite.texture.width,
						height: cubeContainer.sprite.texture.height,
					}
				)
				throw new Error(`Texture has invalid dimensions for cube ${cubeId}`)
			}

			if (
				!cubeContainer.container.parent ||
				cubeContainer.container.parent !== this.gameContainer
			) {
				console.warn(
					`[GameRenderer] waitForTilesVisible: container not in gameContainer for cube ${cubeId}`
				)
				throw new Error(`Container not in gameContainer for cube ${cubeId}`)
			}
		}

		// 7. КРИТИЧНО: Проверяем, что плитки реально видны и анимация завершена
		// Для плиток, появляющихся на месте (alpha/scale анимация), проверяем что alpha === 1 и scale === 1
		// Это гарантирует, что анимация spawn полностью завершена и плитки отображаются
		let tilesVisible = false
		let visibilityAttempts = 0
		const maxVisibilityAttempts = 30 // Увеличиваем количество попыток для холодного старта
		const visibilityCheckStartTime = performance.now()
		const VISIBILITY_THRESHOLD = 0.95 // Порог для alpha и scale (почти 1.0, чтобы учесть погрешности)

		while (!tilesVisible && visibilityAttempts < maxVisibilityAttempts) {
			tilesVisible = true
			let invisibleCount = 0
			let animatingCount = 0

			// Проверяем все плитки на видимость
			for (const [, cubeContainer] of this.cubeContainers.entries()) {
				// Проверяем, что контейнер видим
				if (!cubeContainer.container.visible) {
					tilesVisible = false
					invisibleCount++
					continue
				}

				// Проверяем alpha (должен быть >= threshold для полной видимости)
				if (cubeContainer.container.alpha < VISIBILITY_THRESHOLD) {
					tilesVisible = false
					animatingCount++
					continue
				}

				// Проверяем scale (должен быть >= threshold для полной видимости)
				if (
					cubeContainer.container.scale.x < VISIBILITY_THRESHOLD ||
					cubeContainer.container.scale.y < VISIBILITY_THRESHOLD
				) {
					tilesVisible = false
					animatingCount++
					continue
				}

				// Проверяем спрайт
				if (
					!cubeContainer.sprite.visible ||
					cubeContainer.sprite.alpha < VISIBILITY_THRESHOLD
				) {
					tilesVisible = false
					invisibleCount++
					continue
				}
			}

			if (!tilesVisible) {
				visibilityAttempts++
				// Ждем кадр перед следующей проверкой
				await new Promise<void>((resolve) => {
					if (!this.app || !this.app.ticker) {
						resolve()
						return
					}
					requestAnimationFrame(() => {
						this.app!.ticker.addOnce(() => {
							this.forceRender()
							resolve()
						})
					})
				})
			}
		}

		const visibilityCheckDuration = performance.now() - visibilityCheckStartTime
		if (!tilesVisible) {
			console.warn(
				`[GameRenderer] waitForTilesVisible: tiles not fully visible after ${visibilityCheckDuration.toFixed(
					2
				)}ms (${visibilityAttempts} attempts)`
			)
		}

		// 8. КРИТИЧНО: Детерминированное ожидание первого видимого кадра на экране
		// Используем строгую последовательность: requestAnimationFrame -> ticker -> forceRender -> ticker
		// Это гарантирует, что браузер реально отрендерил плитки на экране
		await new Promise<void>((resolve) => {
			if (!this.app || !this.app.renderer || !this.app.ticker) {
				resolve()
				return
			}

			// Синхронизируем с браузером через requestAnimationFrame
			requestAnimationFrame(() => {
				// Ждем кадр ticker для гарантии рендера
				this.app!.ticker.addOnce(() => {
					// Принудительно рендерим кадр
					this.forceRender()
					// Ждем еще один кадр ticker после принудительного рендера
					// Это гарантирует, что GPU реально отрисовал кадр
					this.app!.ticker.addOnce(() => {
						// Финальная проверка bounds
						const bounds = this.gameContainer!.getBounds()
						if (bounds.width > 0 && bounds.height > 0) {
							// Bounds валидны - плитки видны
							resolve()
						} else {
							// Если bounds нулевые, ждем еще один кадр
							this.app!.ticker.addOnce(() => {
								this.forceRender()
								resolve()
							})
						}
					})
				})
			})
		})

		// 9. КРИТИЧНО: Дополнительные кадры для гарантии реального отображения на экране
		// На холодном старте браузеру может потребоваться больше времени для реального рендеринга
		for (let i = 0; i < 2; i++) {
			await new Promise<void>((resolve) => {
				if (!this.app || !this.app.ticker) {
					resolve()
					return
				}
				requestAnimationFrame(() => {
					this.app!.ticker.addOnce(() => {
						this.forceRender()
						resolve()
					})
				})
			})
		}
	}

	/**
	 * Диагностический метод для проверки состояния рендерера
	 * Используется для отладки проблем с отображением
	 */
	debugRenderState(): void {
		if (!this.app) {
			console.error('DEBUG: app is null')
			return
		}

		// Sample first 3 containers for detailed info
		let sampleCount = 0
		for (const [, cubeContainer] of this.cubeContainers.entries()) {
			if (sampleCount >= 3) break

			// Вычисляем мировую видимость вручную
			let containerWorldVisible = cubeContainer.container.visible
			let containerWorldAlpha = cubeContainer.container.alpha
			let parent: Container | null = cubeContainer.container.parent
			while (parent && containerWorldVisible) {
				containerWorldVisible = containerWorldVisible && parent.visible
				containerWorldAlpha *= parent.alpha
				parent = parent.parent
			}

			let spriteWorldVisible = cubeContainer.sprite.visible
			let spriteParent: Container | null = cubeContainer.sprite.parent
			while (spriteParent && spriteWorldVisible) {
				spriteWorldVisible = spriteWorldVisible && spriteParent.visible
				spriteParent = spriteParent.parent
			}

			sampleCount++
		}

		console.groupEnd()
	}

	destroy(): void {
		this.cubeContainers.forEach((cubeContainer) => {
			if (cubeContainer && cubeContainer.container) {
				// КРИТИЧНО: Убиваем все GSAP анимации перед уничтожением,
				// включая tweens на scale (иначе GSAP обратится к уже уничтоженному scale.x)
				gsap.killTweensOf(cubeContainer.container)
				if (cubeContainer.container.scale) {
					gsap.killTweensOf(cubeContainer.container.scale)
				}

				if (cubeContainer.container.parent) {
					cubeContainer.container.parent.removeChild(cubeContainer.container)
				}

				// Проверяем, что контейнер еще существует перед destroy
				if (cubeContainer.container && cubeContainer.container.scale) {
					cubeContainer.container.destroy({ children: true })
				}
			}
		})
		this.cubeContainers.clear()
		this.cubePositions.clear()
		this.positionToCubeId.clear()

		// КРИТИЧНО: НЕ уничтожаем Application - он принадлежит PixiService
		// Просто очищаем ссылки
		this.app = null
		this.gameContainer = null
	}
}
