/**
 * GameControl - управление игрой и рендеринг на Pixi.js
 */

import {
	Application,
	Graphics,
	Container,
	Text,
	TextStyle,
	Point,
} from 'pixi.js'
import { gsap } from 'gsap'
import type { GameState, GameAction } from '@/features/game/core/types'
import { applyMove } from '@/features/game/core/game'
import { countTiles } from '@/features/game/core/state'

export interface GameControlOptions {
	canvas: HTMLCanvasElement
	gameState: GameState
	controls: {
		gameStart?: () => void
		setScore?: (
			tilesCount: number,
			overlapArea?: number,
			tileArea?: number
		) => void
		end?: () => void
	}
	onStateUpdate?: (state: GameState) => void
	getScrollOffset?: () => number
}

// Цвета для плиток (базовая палитра)
const TILE_COLORS = [
	'#FF6B6B', // Красный
	'#4ECDC4', // Бирюзовый
	'#45B7D1', // Голубой
	'#FFA07A', // Лососевый
	'#98D8C8', // Мятный
	'#F7DC6F', // Желтый
	'#BB8FCE', // Фиолетовый
	'#85C1E2', // Светло-голубой
]

// Тип для спрайта плитки
interface TileSprite extends Container {
	tileId: number
	gridX: number
	gridY: number
	background: Graphics
	text: Text | null
	highlight: Graphics | null
}

export class GameControl {
	private canvas: HTMLCanvasElement
	private app: Application | null = null
	private gameState: GameState
	private controls: GameControlOptions['controls']
	private onStateUpdate?: (state: GameState) => void
	private getScrollOffset?: () => number

	// Рендеринг
	private tileSize: number = 0
	private container: HTMLElement | null = null
	private gameContainer: Container | null = null
	private tileSprites: Map<number, TileSprite> = new Map() // Map<id, sprite>
	private debugText: Text | null = null

	// Взаимодействие
	private selectedTile: { x: number; y: number } | null = null
	private isProcessing: boolean = false
	private lastClickTime: number = 0
	private lastClickTile: { x: number; y: number } | null = null

	// Анимации
	private isAnimating: boolean = false

	// Debug overlay (только в dev режиме)
	private showDebugOverlay: boolean = false

	constructor(options: GameControlOptions) {
		this.canvas = options.canvas
		this.gameState = options.gameState
		this.controls = options.controls
		this.onStateUpdate = options.onStateUpdate
		this.getScrollOffset = options.getScrollOffset

		this.container = this.canvas.parentElement
		if (!this.container) {
			throw new Error('Container element not found')
		}

		// Включить debug overlay в dev режиме
		this.showDebugOverlay = import.meta.env.DEV

		// Вычислить размер плитки (будет пересчитан после инициализации app)
		this.calculateTileSize()
	}

	private calculateTileSize(): void {
		const { width } = this.gameState.config
		// Вычислить размер плитки так, чтобы они полностью заполняли canvas
		// В Pixi.js с autoDensity=true, canvas.width уже учитывает devicePixelRatio
		// Но нам нужен логический размер (без учета resolution)
		if (this.app) {
			const resolution = this.app.renderer.resolution
			const logicalWidth = this.canvas.width / resolution
			this.tileSize = logicalWidth / width
		} else {
			// Fallback для случая, когда app еще не инициализирован
			this.tileSize = this.canvas.width / width
		}
	}

	async init(): Promise<void> {
		// Создать Pixi.js Application
		this.app = new Application()
		await this.app.init({
			canvas: this.canvas,
			width: this.canvas.width,
			height: this.canvas.height,
			backgroundColor: 0x000000,
			backgroundAlpha: 0, // Прозрачный фон
			resolution: window.devicePixelRatio || 1,
			autoDensity: true,
		})

		// Создать контейнер для игры
		this.gameContainer = new Container()
		this.app.stage.addChild(this.gameContainer)

		// Создать debug overlay если нужно
		if (this.showDebugOverlay) {
			this.debugText = new Text({
				text: '',
				style: new TextStyle({
					fontFamily: 'monospace',
					fontSize: 14,
					fill: 0xffffff,
				}),
			})
			this.debugText.x = 10
			this.debugText.y = 10
			this.app.stage.addChild(this.debugText)
		}

		// Пересчитать размер плитки с учетом resolution
		this.calculateTileSize()

		// Настроить обработчики событий
		this.setupEventListeners()

		// Начальный рендер
		this.render()
	}

	private setupEventListeners(): void {
		if (!this.app) return

		// Используем Pixi.js события
		this.app.canvas.addEventListener('click', this.handleClick.bind(this))
		this.app.canvas.addEventListener(
			'mousemove',
			this.handleMouseMove.bind(this)
		)
		this.app.canvas.addEventListener(
			'pointerup',
			this.handlePointerUp.bind(this),
			{
				passive: true,
			}
		)
		this.app.canvas.addEventListener(
			'touchend',
			this.handleTouchEnd.bind(this),
			{
				passive: true,
			}
		)
	}

	private getTileAtPosition(
		clientX: number,
		clientY: number
	): {
		x: number
		y: number
	} | null {
		if (!this.app || !this.gameContainer) return null

		const canvasRect = this.canvas.getBoundingClientRect()
		const scrollOffset = this.getScrollOffset?.() ?? 0

		// Получить координаты относительно canvas в CSS пикселях
		const cssX = clientX - canvasRect.left
		// Учитываем scroll offset: когда контент скроллится через transform,
		// getBoundingClientRect() уже учитывает transform, поэтому canvasRect.top
		// показывает видимую позицию canvas. Чтобы получить координату относительно
		// начала canvas (его логической позиции), нужно добавить scrollOffset
		const cssY = clientY - canvasRect.top + scrollOffset

		// Преобразовать CSS координаты в координаты canvas
		// В Pixi.js v8 с autoDensity=true, canvas.width уже учитывает devicePixelRatio
		// Но getBoundingClientRect возвращает CSS размеры
		// Поэтому нужно учесть resolution
		const resolution = this.app.renderer.resolution
		const canvasWidth = this.canvas.width / resolution
		const canvasHeight = this.canvas.height / resolution

		const scaleX = canvasWidth / canvasRect.width
		const scaleY = canvasHeight / canvasRect.height

		const x = cssX * scaleX
		const y = cssY * scaleY

		// Преобразовать в локальные координаты игрового контейнера
		// (на случай если контейнер имеет трансформации)
		const globalPoint = new Point(x, y)
		const localPoint = this.gameContainer.toLocal(globalPoint)

		const gridX = Math.floor(localPoint.x / this.tileSize)
		const gridY = Math.floor(localPoint.y / this.tileSize)

		if (
			gridX >= 0 &&
			gridX < this.gameState.config.width &&
			gridY >= 0 &&
			gridY < this.gameState.config.height
		) {
			return { x: gridX, y: gridY }
		}

		return null
	}

	private handleClick(e: MouseEvent): void {
		if (this.isProcessing || this.isAnimating) return

		const tile = this.getTileAtPosition(e.clientX, e.clientY)
		if (!tile) return

		// Защита от двойной обработки (click и pointerup могут сработать оба)
		const now = Date.now()
		if (
			now - this.lastClickTime < 100 &&
			this.lastClickTile &&
			this.lastClickTile.x === tile.x &&
			this.lastClickTile.y === tile.y
		) {
			return
		}

		this.lastClickTime = now
		this.lastClickTile = tile
		this.handleTileSelect(tile.x, tile.y)
	}

	private handlePointerUp(e: PointerEvent): void {
		// Обрабатываем pointerup для случаев, когда click событие может быть заблокировано
		if (this.isProcessing || this.isAnimating) return
		if (e.button !== 0 && e.pointerType === 'mouse') return

		const tile = this.getTileAtPosition(e.clientX, e.clientY)
		if (!tile) return

		// Защита от двойной обработки (click и pointerup могут сработать оба)
		const now = Date.now()
		if (
			now - this.lastClickTime < 100 &&
			this.lastClickTile &&
			this.lastClickTile.x === tile.x &&
			this.lastClickTile.y === tile.y
		) {
			return
		}

		this.lastClickTime = now
		this.lastClickTile = tile
		this.handleTileSelect(tile.x, tile.y)
	}

	private handleTouchEnd(e: TouchEvent): void {
		if (this.isProcessing || this.isAnimating) return
		if (e.touches.length > 0) return // Если еще есть активные касания, игнорируем

		const touch = e.changedTouches[0]
		if (!touch) return

		const tile = this.getTileAtPosition(touch.clientX, touch.clientY)
		if (!tile) return

		this.handleTileSelect(tile.x, tile.y)
	}

	private handleMouseMove(_e: MouseEvent): void {
		// Можно добавить hover эффекты
	}

	private handleTileSelect(x: number, y: number): void {
		const tile = this.gameState.grid[x]?.[y]
		if (!tile) {
			// Клик вне блока - сброс выделения
			if (this.selectedTile) {
				this.selectedTile = null
			}
			return
		}

		// Если плитка заблокирована (moves === 0), нельзя начинать ход с неё
		if (tile.moves === 0 && !this.selectedTile) {
			// Сброс выделения при клике на заблокированную плитку
			if (this.selectedTile) {
				this.selectedTile = null
			}
			return
		}

		if (!this.selectedTile) {
			// Выбор первой плитки
			if (tile.moves > 0) {
				this.selectedTile = { x, y }
			}
		} else {
			// Если кликнули на ту же плитку - сброс выделения
			if (this.selectedTile.x === x && this.selectedTile.y === y) {
				this.selectedTile = null
				return
			}

			// Выбор второй плитки для обмена
			const fromX = this.selectedTile.x
			const fromY = this.selectedTile.y

			// Проверка, что плитки соседние
			const dx = Math.abs(x - fromX)
			const dy = Math.abs(y - fromY)
			const isAdjacent = (dx === 1 && dy === 0) || (dx === 0 && dy === 1)

			if (isAdjacent) {
				this.performMove(fromX, fromY, x, y)
				this.selectedTile = null
			} else {
				// Если кликнули на другую плитку (не соседнюю), выбираем новую
				if (tile.moves > 0) {
					this.selectedTile = { x, y }
				} else {
					this.selectedTile = null
				}
			}
		}
	}

	private async performMove(
		fromX: number,
		fromY: number,
		toX: number,
		toY: number
	): Promise<void> {
		if (this.isProcessing) return

		this.isProcessing = true

		try {
			const result = applyMove(this.gameState, fromX, fromY, toX, toY)

			if (!result.success) {
				// Неудачный ход (невалидный)
				this.isProcessing = false
				return
			}

			// Обновить состояние
			this.gameState = result.newState
			this.onStateUpdate?.(this.gameState)

			// Обработать действия (анимации)
			if (result.actions.length > 0) {
				await this.processActions(result.actions)
			}

			// Обновить счет
			this.updateScore()

			// Проверить окончание игры
			if (this.gameState.isEnded) {
				this.controls.end?.()
			}
		} catch (error) {
			console.error('Error performing move:', error)
		} finally {
			this.isProcessing = false
			this.render()
		}
	}

	private async processActions(actions: GameAction[]): Promise<void> {
		this.isAnimating = true

		for (const action of actions) {
			switch (action.type) {
				case 'swap':
					// Простая анимация обмена (можно улучшить)
					await this.animateSwap(action)
					break
				case 'remove':
					// Анимация удаления
					await this.animateRemove(action)
					break
				case 'fall':
					// Анимация падения
					await this.animateFall(action)
					break
				case 'spawn':
					// Анимация появления
					await this.animateSpawn(action)
					break
				case 'score':
					// Обновление счета уже обработано
					break
				case 'combo':
					// Можно добавить визуальный эффект комбо
					break
				case 'end':
					// Игра окончена
					break
			}
		}

		this.isAnimating = false
	}

	private async animateSwap(
		action: GameAction & { type: 'swap' }
	): Promise<void> {
		const spriteA = this.tileSprites.get(action.aId)
		const spriteB = this.tileSprites.get(action.bId)

		if (!spriteA || !spriteB) {
			this.render()
			return
		}

		// Анимация обмена с помощью GSAP
		const fromAX = spriteA.x
		const fromAY = spriteA.y
		const fromBX = spriteB.x
		const fromBY = spriteB.y

		await Promise.all([
			new Promise<void>((resolve) => {
				gsap.to(spriteA, {
					x: fromBX,
					y: fromBY,
					duration: 0.2,
					ease: 'power2.out',
					onComplete: () => resolve(),
				})
			}),
			new Promise<void>((resolve) => {
				gsap.to(spriteB, {
					x: fromAX,
					y: fromAY,
					duration: 0.2,
					ease: 'power2.out',
					onComplete: () => resolve(),
				})
			}),
		])

		// Обновить позиции в спрайтах
		spriteA.gridX = action.aTo.x
		spriteA.gridY = action.aTo.y
		spriteB.gridX = action.bTo.x
		spriteB.gridY = action.bTo.y

		this.render()
	}

	private async animateRemove(
		action: GameAction & { type: 'remove' }
	): Promise<void> {
		const sprites = action.ids
			.map((id) => this.tileSprites.get(id))
			.filter((s): s is TileSprite => s !== undefined)

		if (sprites.length === 0) {
			this.render()
			return
		}

		// Анимация удаления: масштабирование и исчезновение
		await Promise.all(
			sprites.map(
				(sprite) =>
					new Promise<void>((resolve) => {
						gsap.to(sprite, {
							alpha: 0,
							scale: 0,
							duration: 0.15,
							ease: 'back.in',
							onComplete: () => resolve(),
						})
					})
			)
		)

		// Удалить спрайты
		sprites.forEach((sprite) => {
			this.tileSprites.delete(sprite.tileId)
			if (sprite.parent) {
				sprite.parent.removeChild(sprite)
			}
			sprite.destroy()
		})

		this.render()
	}

	private async animateFall(
		action: GameAction & { type: 'fall' }
	): Promise<void> {
		const animations: Promise<void>[] = []

		for (const move of action.moves) {
			const sprite = this.tileSprites.get(move.id)
			if (!sprite) continue

			const fromX = move.from.x * this.tileSize
			const fromY = move.from.y * this.tileSize
			const toX = move.to.x * this.tileSize
			const toY = move.to.y * this.tileSize

			// Установить начальную позицию
			sprite.x = fromX
			sprite.y = fromY

			// Анимация падения
			animations.push(
				new Promise<void>((resolve) => {
					gsap.to(sprite, {
						x: toX,
						y: toY,
						duration: 0.3,
						ease: 'power2.out',
						onComplete: () => {
							sprite.gridX = move.to.x
							sprite.gridY = move.to.y
							resolve()
						},
					})
				})
			)
		}

		await Promise.all(animations)
		this.render()
	}

	private async animateSpawn(
		action: GameAction & { type: 'spawn' }
	): Promise<void> {
		const animations: Promise<void>[] = []

		for (const item of action.items) {
			const sprite = this.createTileSprite(
				item.id,
				item.to.x,
				item.to.y,
				item.color,
				item.moves
			)

			// Начальное состояние: невидимый и маленький
			sprite.alpha = 0
			sprite.scale.set(0)

			// Анимация появления
			animations.push(
				new Promise<void>((resolve) => {
					gsap.to(sprite, {
						alpha: 1,
						scale: 1,
						duration: 0.15,
						ease: 'back.out',
						onComplete: () => resolve(),
					})
				})
			)
		}

		await Promise.all(animations)
		this.render()
	}

	private updateScore(): void {
		const tilesCount = countTiles(this.gameState)
		this.controls.setScore?.(tilesCount, 0, 0)
	}

	private createTileSprite(
		id: number,
		x: number,
		y: number,
		color: number,
		moves: number
	): TileSprite {
		if (!this.gameContainer) {
			throw new Error('Game container not initialized')
		}

		const container = new Container() as TileSprite
		container.tileId = id
		container.gridX = x
		container.gridY = y

		// Фон плитки
		const background = new Graphics()
		const colorIndex = color % TILE_COLORS.length
		const colorHex = parseInt(TILE_COLORS[colorIndex].replace('#', ''), 16)

		background.rect(0, 0, this.tileSize, this.tileSize)
		background.fill(colorHex)
		background.stroke({ color: 0x000000, width: 1, alpha: 0.2 })
		container.background = background
		container.addChild(background)

		// Текст с количеством ходов
		let text: Text | null = null
		if (moves > 0) {
			text = new Text({
				text: String(moves),
				style: new TextStyle({
					fontFamily: 'Arial',
					fontSize: Math.max(10, this.tileSize / 3),
					fill: 0xffffff,
					align: 'center',
				}),
			})
			text.anchor.set(0.5)
			text.x = this.tileSize / 2
			text.y = this.tileSize / 2
			container.text = text
			container.addChild(text)
		} else {
			container.text = null
		}

		// Выделение (создается при необходимости)
		container.highlight = null

		// Позиция
		container.x = x * this.tileSize
		container.y = y * this.tileSize

		this.gameContainer.addChild(container)
		this.tileSprites.set(id, container)

		return container
	}

	private updateTileSprite(
		sprite: TileSprite,
		tile: { color: number; moves: number }
	): void {
		// Обновить цвет
		const colorIndex = tile.color % TILE_COLORS.length
		const colorHex = parseInt(TILE_COLORS[colorIndex].replace('#', ''), 16)
		sprite.background.clear()
		sprite.background.rect(0, 0, this.tileSize, this.tileSize)
		sprite.background.fill(colorHex)
		sprite.background.stroke({ color: 0x000000, width: 1, alpha: 0.2 })

		// Обновить текст
		if (tile.moves > 0) {
			if (!sprite.text) {
				sprite.text = new Text({
					text: String(tile.moves),
					style: new TextStyle({
						fontFamily: 'Arial',
						fontSize: Math.max(10, this.tileSize / 3),
						fill: 0xffffff,
						align: 'center',
					}),
				})
				sprite.text.anchor.set(0.5)
				sprite.text.x = this.tileSize / 2
				sprite.text.y = this.tileSize / 2
				sprite.addChild(sprite.text)
			} else {
				sprite.text.text = String(tile.moves)
			}
		} else {
			if (sprite.text) {
				sprite.removeChild(sprite.text)
				sprite.text.destroy()
				sprite.text = null
			}
		}
	}

	private updateHighlight(sprite: TileSprite, isSelected: boolean): void {
		if (isSelected) {
			if (!sprite.highlight) {
				const highlight = new Graphics()
				highlight.rect(0, 0, this.tileSize, this.tileSize)
				highlight.fill({ color: 0xffffff, alpha: 0.3 })
				highlight.stroke({ color: 0xffffff, width: 4 })
				highlight.rect(2, 2, this.tileSize - 4, this.tileSize - 4)
				highlight.stroke({ color: 0x000000, width: 2, alpha: 0.5 })
				sprite.highlight = highlight
				sprite.addChild(highlight)
			}
		} else {
			if (sprite.highlight) {
				sprite.removeChild(sprite.highlight)
				sprite.highlight.destroy()
				sprite.highlight = null
			}
		}
	}

	private render(): void {
		if (!this.gameContainer) return

		const { width, height } = this.gameState.config

		// Создать или обновить спрайты для всех плиток
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const tile = this.gameState.grid[x]?.[y]
				if (!tile) {
					// Удалить спрайт если плитка отсутствует
					const existingSprite = Array.from(this.tileSprites.values()).find(
						(s) => s.gridX === x && s.gridY === y
					)
					if (existingSprite) {
						this.tileSprites.delete(existingSprite.tileId)
						if (existingSprite.parent) {
							existingSprite.parent.removeChild(existingSprite)
						}
						existingSprite.destroy()
					}
					continue
				}

				// Найти или создать спрайт
				let sprite = this.tileSprites.get(tile.id)
				if (!sprite) {
					sprite = this.createTileSprite(tile.id, x, y, tile.color, tile.moves)
				} else {
					// Обновить позицию если изменилась
					if (sprite.gridX !== x || sprite.gridY !== y) {
						sprite.x = x * this.tileSize
						sprite.y = y * this.tileSize
						sprite.gridX = x
						sprite.gridY = y
					}
					// Обновить визуал
					this.updateTileSprite(sprite, tile)
				}

				// Обновить выделение
				const isSelected = Boolean(
					this.selectedTile &&
						this.selectedTile.x === x &&
						this.selectedTile.y === y
				)
				this.updateHighlight(sprite, isSelected)
			}
		}

		// Debug overlay
		if (this.showDebugOverlay && this.debugText) {
			this.debugText.text = `tileSize: ${this.tileSize.toFixed(
				1
			)}px\nSprites: ${this.tileSprites.size}`
		}
	}

	start(): void {
		this.controls.gameStart?.()
		this.render()
	}

	adaptive(): void {
		this.calculateTileSize()
		if (this.app) {
			this.app.renderer.resize(this.canvas.width, this.canvas.height)
		}
		// Обновить все спрайты с новым размером
		this.tileSprites.forEach((sprite) => {
			sprite.x = sprite.gridX * this.tileSize
			sprite.y = sprite.gridY * this.tileSize
			// Пересоздать графику с новым размером
			const tile = this.gameState.grid[sprite.gridX]?.[sprite.gridY]
			if (tile) {
				this.updateTileSprite(sprite, tile)
			}
		})
		this.render()
	}

	reload(): void {
		// Перезапуск игры (можно использовать для рестарта после рекламы)
		this.selectedTile = null
		this.isProcessing = false
		this.isAnimating = false
		this.render()
	}

	destroy(): void {
		// Удалить все спрайты
		this.tileSprites.forEach((sprite) => {
			if (sprite.parent) {
				sprite.parent.removeChild(sprite)
			}
			sprite.destroy()
		})
		this.tileSprites.clear()

		// Удалить обработчики событий
		if (this.app) {
			this.app.canvas.removeEventListener('click', this.handleClick.bind(this))
			this.app.canvas.removeEventListener(
				'mousemove',
				this.handleMouseMove.bind(this)
			)
			this.app.canvas.removeEventListener(
				'pointerup',
				this.handlePointerUp.bind(this)
			)
			this.app.canvas.removeEventListener(
				'touchend',
				this.handleTouchEnd.bind(this)
			)
		}

		// Уничтожить Pixi.js приложение
		if (this.app) {
			this.app.destroy(true, {
				children: true,
				texture: true,
				textureSource: true,
			})
			this.app = null
		}
	}
}
