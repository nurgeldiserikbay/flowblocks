/**
 * GameControl - управление игрой и рендеринг на canvas
 */

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

export class GameControl {
	private canvas: HTMLCanvasElement
	private ctx: CanvasRenderingContext2D
	private gameState: GameState
	private controls: GameControlOptions['controls']
	private onStateUpdate?: (state: GameState) => void

	// Рендеринг
	private tileSize: number = 0
	private container: HTMLElement | null = null
	private animationFrameId: number | null = null
	private lastUpdateTime: number = 0

	// Взаимодействие
	private selectedTile: { x: number; y: number } | null = null
	private isProcessing: boolean = false

	// Анимации
	private isAnimating: boolean = false

	// Debug overlay (только в dev режиме)
	private showDebugOverlay: boolean = false

	constructor(options: GameControlOptions) {
		this.canvas = options.canvas
		const ctx = this.canvas.getContext('2d')
		if (!ctx) {
			throw new Error('Failed to get canvas context')
		}
		this.ctx = ctx
		this.gameState = options.gameState
		this.controls = options.controls
		this.onStateUpdate = options.onStateUpdate

		this.container = this.canvas.parentElement
		if (!this.container) {
			throw new Error('Container element not found')
		}

		// Включить debug overlay в dev режиме
		this.showDebugOverlay = import.meta.env.DEV

		this.calculateTileSize()
		this.setupEventListeners()
		// Запустить анимационный цикл
		this.startAnimationLoop()
		this.lastUpdateTime = performance.now()
	}

	private calculateTileSize(): void {
		const { width } = this.gameState.config
		// Вычислить размер плитки так, чтобы они полностью заполняли canvas
		this.tileSize = this.canvas.width / width
	}

	private startAnimationLoop(): void {
		const animate = (currentTime: number) => {
			const dt = currentTime - this.lastUpdateTime
			this.lastUpdateTime = currentTime

			// Обновить render для debug overlay (и другие визуальные обновления)
			if (this.showDebugOverlay) {
				this.render()
			}

			this.animationFrameId = requestAnimationFrame(animate)
		}
		this.animationFrameId = requestAnimationFrame(animate)
	}

	private setupEventListeners(): void {
		// Mouse events для кликов
		this.canvas.addEventListener('click', this.handleClick.bind(this))
		this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this))
	}

	private getTileAtPosition(
		clientX: number,
		clientY: number
	): {
		x: number
		y: number
	} | null {
		if (!this.container) return null

		const canvasRect = this.canvas.getBoundingClientRect()
		// Получить скролл из контейнера (теперь скролл управляется MomentumScroll)
		const scrollY = this.container.scrollTop

		// Учесть скролл контейнера
		const x = clientX - canvasRect.left
		const y = clientY - canvasRect.top + scrollY

		const gridX = Math.floor(x / this.tileSize)
		const gridY = Math.floor(y / this.tileSize)

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

		this.handleTileSelect(tile.x, tile.y)
	}

	private handleMouseMove(_e: MouseEvent): void {
		// Можно добавить hover эффекты
	}

	private handleTileSelect(x: number, y: number): void {
		const tile = this.gameState.grid[x]?.[y]
		if (!tile) return

		// Если плитка заблокирована (moves === 0), нельзя начинать ход с неё
		if (tile.moves === 0 && !this.selectedTile) {
			return
		}

		if (!this.selectedTile) {
			// Выбор первой плитки
			if (tile.moves > 0) {
				this.selectedTile = { x, y }
				this.render()
			}
		} else {
			// Выбор второй плитки для обмена
			const fromX = this.selectedTile.x
			const fromY = this.selectedTile.y

			// Проверка, что плитки соседние
			const dx = Math.abs(x - fromX)
			const dy = Math.abs(y - fromY)
			const isAdjacent = (dx === 1 && dy === 0) || (dx === 0 && dy === 1)

			if (isAdjacent) {
				this.performMove(fromX, fromY, x, y)
			}

			this.selectedTile = null
			this.render()
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
		_action: GameAction & { type: 'swap' }
	): Promise<void> {
		// Простая задержка для визуализации
		await new Promise((resolve) => setTimeout(resolve, 200))
		this.render()
	}

	private async animateRemove(
		_action: GameAction & { type: 'remove' }
	): Promise<void> {
		// Простая задержка
		await new Promise((resolve) => setTimeout(resolve, 150))
		this.render()
	}

	private async animateFall(
		_action: GameAction & { type: 'fall' }
	): Promise<void> {
		// Простая задержка
		await new Promise((resolve) => setTimeout(resolve, 300))
		this.render()
	}

	private async animateSpawn(
		_action: GameAction & { type: 'spawn' }
	): Promise<void> {
		// Простая задержка
		await new Promise((resolve) => setTimeout(resolve, 150))
		this.render()
	}

	private updateScore(): void {
		const tilesCount = countTiles(this.gameState)
		this.controls.setScore?.(tilesCount, 0, 0)
	}

	private render(): void {
		const { width, height } = this.gameState.config

		// Очистить canvas прозрачным фоном (фон будет виден из контейнера)
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

		// Рендерить все плитки (canvas теперь имеет полную высоту игрового поля)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const tile = this.gameState.grid[x]?.[y]
				if (!tile) {
					continue
				}

				const px = x * this.tileSize
				const py = y * this.tileSize

				// Цвет плитки
				const colorIndex = tile.color % TILE_COLORS.length
				const color = TILE_COLORS[colorIndex]

				// Рисовать плитку на всю ширину/высоту ячейки
				this.ctx.fillStyle = color
				this.ctx.fillRect(px, py, this.tileSize, this.tileSize)

				// Тонкая обводка для разделения плиток
				this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'
				this.ctx.lineWidth = 1
				this.ctx.strokeRect(px, py, this.tileSize, this.tileSize)

				// Выделение выбранной плитки
				if (
					this.selectedTile &&
					this.selectedTile.x === x &&
					this.selectedTile.y === y
				) {
					this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
					this.ctx.lineWidth = 3
					this.ctx.strokeRect(px, py, this.tileSize, this.tileSize)
				}

				// Показать количество ходов
				if (tile.moves > 0) {
					this.ctx.fillStyle = 'white'
					this.ctx.font = `${Math.max(10, this.tileSize / 3)}px Arial`
					this.ctx.textAlign = 'center'
					this.ctx.textBaseline = 'middle'
					this.ctx.fillText(
						String(tile.moves),
						px + this.tileSize / 2,
						py + this.tileSize / 2
					)
				}
			}
		}

		// Debug overlay (только в dev режиме)
		if (this.showDebugOverlay) {
			this.renderDebugOverlay()
		}
	}

	private renderDebugOverlay(): void {
		const scrollY = this.container?.scrollTop ?? 0

		// Полупрозрачный фон для текста
		this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
		this.ctx.fillRect(10, 10, 200, 60)

		// Текст
		this.ctx.fillStyle = 'white'
		this.ctx.font = '14px monospace'
		this.ctx.textAlign = 'left'
		this.ctx.textBaseline = 'top'

		this.ctx.fillText(`scrollY: ${scrollY.toFixed(1)}px`, 15, 15)
		this.ctx.fillText(`tileSize: ${this.tileSize.toFixed(1)}px`, 15, 35)
	}

	start(): void {
		this.controls.gameStart?.()
		this.render()
	}

	adaptive(): void {
		this.calculateTileSize()
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
		// Остановить анимационный цикл
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId)
			this.animationFrameId = null
		}

		// Удалить обработчики событий
		this.canvas.removeEventListener('click', this.handleClick.bind(this))
		this.canvas.removeEventListener(
			'mousemove',
			this.handleMouseMove.bind(this)
		)
	}
}
