/**
 * Pixi.js game renderer - handles rendering and animations
 */

import { Application, Container, Sprite, Text, TextStyle, Graphics } from 'pixi.js'
import { gsap } from 'gsap'
import type { GameEvent, Cube } from '../logic/types'
import { getBlockTexture } from '../blockTextures'
import { WIDTH } from '../logic/grid'

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
}

export class GameRenderer {
	private canvas: HTMLCanvasElement
	private app: Application | null = null
	private gameContainer: Container | null = null
	private tileSize: number
	private cubeContainers: Map<number, CubeContainer> = new Map() // Map<cubeId, container>
	private cubePositions: Map<number, { r: number; c: number }> = new Map() // Map<cubeId, position>
	private nextCubeId: number = 1
	private selectedPosition: { r: number; c: number } | null = null
	private gridHeight: number = 0 // Высота grid для расчета позиций снизу

	constructor(options: GameRendererOptions) {
		this.canvas = options.canvas
		this.tileSize = options.tileSize
	}

	async init(): Promise<void> {
		this.app = new Application()
		// Используем devicePixelRatio для четкого рендеринга на мобильных устройствах
		const devicePixelRatio = window.devicePixelRatio || 1
		
		// КРИТИЧНО: Получаем логические размеры из CSS стилей или getBoundingClientRect
		// Если CSS размеры не установлены, используем размеры из DOM
		let logicalWidth = parseInt(this.canvas.style.width)
		let logicalHeight = parseInt(this.canvas.style.height)
		
		// Если размеры не установлены в CSS, получаем из DOM
		if (!logicalWidth || !logicalHeight) {
			const rect = this.canvas.getBoundingClientRect()
			logicalWidth = logicalWidth || rect.width || 320
			logicalHeight = logicalHeight || rect.height || 400
		}
		
		// Минимальные размеры для предотвращения ошибок инициализации
		logicalWidth = Math.max(logicalWidth, 320)
		logicalHeight = Math.max(logicalHeight, 400)
		
		await this.app.init({
			canvas: this.canvas,
			width: logicalWidth,
			height: logicalHeight,
			backgroundColor: 0x000000,
			backgroundAlpha: 0,
			resolution: devicePixelRatio, // Используем devicePixelRatio для четкости
			autoDensity: true, // Включаем автоматическое масштабирование для правильного отображения
		})

		// КРИТИЧНО: Проверяем, что renderer инициализирован корректно
		if (!this.app.renderer) {
			throw new Error('PixiJS renderer failed to initialize')
		}
		
		// КРИТИЧНО: Проверяем размеры renderer
		if (this.app.renderer.width <= 0 || this.app.renderer.height <= 0) {
			console.warn('PixiJS renderer has invalid dimensions:', {
				width: this.app.renderer.width,
				height: this.app.renderer.height,
				canvasWidth: logicalWidth,
				canvasHeight: logicalHeight
			})
		}
		
		// КРИТИЧНО: Проверяем, что ticker запущен (по умолчанию должен быть запущен)
		if (!this.app.ticker.started) {
			console.warn('PixiJS ticker is not started, starting manually')
			this.app.ticker.start()
		}

		this.gameContainer = new Container()
		this.app.stage.addChild(this.gameContainer)
		
		// КРИТИЧНО: Убеждаемся, что gameContainer добавлен в stage
		if (!this.gameContainer.parent || this.gameContainer.parent !== this.app.stage) {
			throw new Error('Failed to add gameContainer to stage')
		}
		
		// КРИТИЧНО: Принудительно рендерим первый кадр для проверки
		this.forceRender()
	}

	async renderGrid(grid: (Cube | null)[][], nextCubeId: number = 1): Promise<void> {
		if (!this.gameContainer) return

		this.nextCubeId = nextCubeId
		// Сохраняем высоту grid для расчета позиций снизу
		this.gridHeight = grid.length

		// Clear existing containers
		this.cubeContainers.forEach((cubeContainer) => {
			if (cubeContainer.container.parent) {
				cubeContainer.container.parent.removeChild(cubeContainer.container)
			}
			cubeContainer.container.destroy({ children: true })
		})
		this.cubeContainers.clear()
		this.cubePositions.clear()

		// Render all cubes
		for (let r = 0; r < grid.length; r++) {
			for (let c = 0; c < WIDTH; c++) {
				const cube = grid[r]?.[c]
				if (cube) {
					this.createCubeSprite(cube, r, c)
				}
			}
		}

		// Restore selection if it exists
		if (this.selectedPosition) {
			this.setSelectedPosition(this.selectedPosition.r, this.selectedPosition.c)
		}

		// Force render to ensure tiles appear immediately
		this.forceRender()
	}

	/**
	 * Рассчитать позицию Y для строки r, выровненную снизу сосуда
	 * @param r - индекс строки в grid (0 = верх, gridHeight-1 = низ)
	 * @param gridHeight - высота grid
	 * @returns позиция Y в пикселях, выровненная снизу
	 */
	private calculateYFromBottom(r: number): number {
		// Выравниваем снизу: строка 0 (верх) внизу, строка gridHeight-1 (низ) вверху
		return (r) * this.tileSize
	}

	private createCubeSprite(cube: Cube, r: number, c: number): CubeContainer {
		if (!this.gameContainer) {
			throw new Error('Game container not initialized')
		}

		const texture = getBlockTexture(cube.color)

		if (!texture) {
			throw new Error(`Texture not found for color ${cube.color}`)
		}
		
		// КРИТИЧНО: Проверяем размеры текстуры (в PixiJS v8 нет texture.valid)
		if (texture.width <= 0 || texture.height <= 0) {
			console.warn(`Texture for color ${cube.color} has invalid dimensions`, {
				width: texture.width,
				height: texture.height
			})
		}

		// Create container for cube
		const container = new Container()
		container.x = c * this.tileSize
		container.y = this.calculateYFromBottom(r)
		
		// КРИТИЧНО: Убеждаемся, что контейнер видим
		container.visible = true
		container.alpha = 1
		container.scale.set(1)

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
				parentMatches: sprite.parent === container
			})
		}

		// Create text for moves
		let text: Text | null = null
		if (cube.moves > 0) {
			text = new Text({
				text: String(cube.moves),
				style: new TextStyle({
					fontFamily: 'Arial',
					fontSize: Math.max(10, this.tileSize / 3),
					fill: 0xffffff,
					align: 'center',
					fontWeight: 'bold',
				}),
			})
			text.style.stroke = { color: 0x000000, width: 2 }
			text.resolution = window.devicePixelRatio || 1 // Улучшаем качество текста
			text.anchor.set(0.5)
			text.x = this.tileSize / 2
			text.y = this.tileSize / 2
			container.addChild(text)
		}

		// Create highlight (initially hidden)
		const highlight = new Graphics()
		highlight.rect(TILE_PADDING, TILE_PADDING, spriteSize, spriteSize)
		highlight.stroke({ color: 0xffffff, width: 4, alpha: 1 })
		highlight.rect(TILE_PADDING + 2, TILE_PADDING + 2, spriteSize - 4, spriteSize - 4)
		highlight.stroke({ color: 0x000000, width: 2, alpha: 0.5 })
		highlight.visible = false
		container.addChild(highlight)
		this.gameContainer.addChild(container)

		// Проверяем, что контейнер добавлен в gameContainer (только для отладки)
		if (!container.parent || container.parent !== this.gameContainer) {
			console.error('Failed to add container to gameContainer', {
				cubeId: cube.id,
				position: { r, c },
				hasParent: !!container.parent,
				parentMatches: container.parent === this.gameContainer
			})
		}
		
		this.cubeContainers.set(cube.id, { container, sprite, text, highlight })
		this.cubePositions.set(cube.id, { r, c })

		// Update highlight if this position is selected
		if (this.selectedPosition && this.selectedPosition.r === r && this.selectedPosition.c === c) {
			highlight.visible = true
		}

		return { container, sprite, text, highlight }
	}

	updateCubeMoves(cubeId: number, moves: number): void {
		const cubeContainer = this.cubeContainers.get(cubeId)
		if (!cubeContainer) return

		if (moves > 0) {
			if (!cubeContainer.text) {
				// Create text if it doesn't exist
				cubeContainer.text = new Text({
					text: String(moves),
					style: new TextStyle({
						fontFamily: 'Arial',
						fontSize: Math.max(10, this.tileSize / 3),
						fill: 0xffffff,
						align: 'center',
						fontWeight: 'bold',
					}),
				})
				cubeContainer.text.style.stroke = { color: 0x000000, width: 2 }
				cubeContainer.text.resolution = window.devicePixelRatio || 1 // Улучшаем качество текста
				cubeContainer.text.anchor.set(0.5)
				cubeContainer.text.x = this.tileSize / 2
				cubeContainer.text.y = this.tileSize / 2
				cubeContainer.container.addChild(cubeContainer.text)
			} else {
				// Update existing text
				cubeContainer.text.text = String(moves)
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
		// Remove previous selection: clear highlight on ALL cubes.
		// We cannot use findCubeIdAt(selectedPosition) because after swap/move
		// the highlighted cube has moved to another cell; the cube now at
		// selectedPosition is a different one, so the old highlight would stay.
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

	private async animateSwap(a: { r: number; c: number }, b: { r: number; c: number }): Promise<void> {
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
		this.cubePositions.set(cubeIdA, { r: b.r, c: b.c })
		this.cubePositions.set(cubeIdB, { r: a.r, c: a.c })

		await Promise.all([
			new Promise<void>((resolve) => {
				gsap.to(containerA.container, {
					x: posBX,
					y: posBY,
					duration: 0.2,
					ease: 'power2.out',
					onComplete: resolve,
				})
			}),
			new Promise<void>((resolve) => {
				gsap.to(containerB.container, {
					x: posAX,
					y: posAY,
					duration: 0.2,
					ease: 'power2.out',
					onComplete: resolve,
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
		this.cubePositions.set(cubeId, { r: to.r, c: to.c })

		const targetX = to.c * this.tileSize
		const targetY = this.calculateYFromBottom(to.r)

		await new Promise<void>((resolve) => {
			gsap.to(cubeContainer.container, {
				x: targetX,
				y: targetY,
				duration: 0.2,
				ease: 'power2.out',
				onComplete: resolve,
			})
		})
	}

	private async animateFall(
		items: Array<{ from: { r: number; c: number }; to: { r: number; c: number }; color: number }>
	): Promise<void> {
		const animations = items.map((item) => {
			const cubeId = this.findCubeIdAt(item.from.r, item.from.c)
			if (cubeId === null) return Promise.resolve()

			const cubeContainer = this.cubeContainers.get(cubeId)
			if (!cubeContainer) return Promise.resolve()

			// Update position
			this.cubePositions.set(cubeId, { r: item.to.r, c: item.to.c })

			const targetX = item.to.c * this.tileSize
			const targetY = this.calculateYFromBottom(item.to.r)

			return new Promise<void>((resolve) => {
				gsap.to(cubeContainer.container, {
					x: targetX,
					y: targetY,
					duration: 0.3,
					ease: 'power2.out',
					onComplete: resolve,
				})
			})
		})

		await Promise.all(animations)
	}

	private async animateRemove(
		cells: Array<{ r: number; c: number; color: number; id: number; moves?: number }>,
		baseScore?: number,
		comboBonus?: number
	): Promise<void> {
		// Use cube IDs directly from the event instead of finding by position
		const cubeIdsToRemove: number[] = cells.map((cell) => cell.id)

		const containers = cubeIdsToRemove
			.map((id) => this.cubeContainers.get(id))
			.filter((c): c is CubeContainer => c !== undefined)

		if (containers.length === 0) return

		// Score popup at centroid of removed cells
		if (
			this.gameContainer &&
			cells.length > 0 &&
			(baseScore !== undefined || (comboBonus !== undefined && (comboBonus ?? 0) > 0))
		) {
			const avgC = cells.reduce((s, c) => s + c.c, 0) / cells.length
			const avgR = cells.reduce((s, c) => s + c.r, 0) / cells.length
			const cx = (avgC + 0.5) * this.tileSize
			const cy = this.calculateYFromBottom(avgR) + this.tileSize / 2

			const popup = new Container()
			popup.x = cx
			popup.y = cy

			const baseVal = baseScore ?? 0
			if (baseVal > 0) {
				const t = new Text({
					text: `+${baseVal}`,
					style: new TextStyle({
						fontFamily: 'Arial',
						fontSize: Math.max(14, this.tileSize / 2),
						fill: 0x7cff7c,
						align: 'center',
						fontWeight: 'bold',
					}),
				})
				t.resolution = window.devicePixelRatio || 1 // Улучшаем качество текста
				t.anchor.set(0.5)
				t.x = 0
				t.y = 0
				t.style.stroke = { color: 0x000000, width: 2 }
				popup.addChild(t)
			}
			const comboVal = comboBonus ?? 0
			if (comboVal > 0) {
				const t = new Text({
					text: `+${comboVal} COMBO`,
					style: new TextStyle({
						fontFamily: 'Arial',
						fontSize: Math.max(12, this.tileSize / 2.5),
						fill: 0xffaa00,
						align: 'center',
						fontWeight: 'bold',
					}),
				})
				t.resolution = window.devicePixelRatio || 1 // Улучшаем качество текста
				t.anchor.set(0.5)
				t.x = 0
				t.y = baseVal > 0 ? -22 : 0
				t.style.stroke = { color: 0x000000, width: 2 }
				popup.addChild(t)
			}

			this.gameContainer.addChild(popup)
			gsap.to(popup, {
				y: cy - 45,
				alpha: 0,
				duration: 2.0,
				ease: 'power2.out',
				onComplete: () => {
					if (popup.parent) popup.parent.removeChild(popup)
					popup.destroy({ children: true })
				},
			})
		}

		await Promise.all(
			containers.map(
				(cubeContainer) =>
					new Promise<void>((resolve) => {
						gsap.to(cubeContainer.container, {
							alpha: 0,
							scale: 0,
							duration: 0.15,
							ease: 'back.in',
							onComplete: () => {
								if (cubeContainer.container.parent) {
									cubeContainer.container.parent.removeChild(cubeContainer.container)
								}
								cubeContainer.container.destroy({ children: true })
								resolve()
							},
						})
					})
			)
		)

		// Remove from maps
		cubeIdsToRemove.forEach((id) => {
			this.cubeContainers.delete(id)
			this.cubePositions.delete(id)
		})
	}

	private async animateSpawn(cells: Array<{ id: number; r: number; c: number; color: number; fromRow?: number; toRow?: number }>): Promise<void> {
		const animations = cells.map((cell) => {
			const cubeContainer = this.cubeContainers.get(cell.id)
			if (!cubeContainer) return Promise.resolve() // removed in resolve

			const pos = this.cubePositions.get(cell.id)
			if (!pos) return Promise.resolve()

			const targetRow = pos.r
			const targetY = this.calculateYFromBottom(targetRow)

			if (cell.fromRow !== undefined && cell.fromRow < 0) {
				// Для спавна сверху: fromRow отрицательный (например, -1, -2)
				// Рассчитываем позицию сверху canvas: отрицательные значения означают строки выше видимой области
				// Позиция сверху = (gridHeight - 1 + |fromRow|) * tileSize, но это будет выше canvas
				// Для визуального эффекта падения сверху используем отрицательную позицию
				const startY = -Math.abs(cell.fromRow) * this.tileSize
				cubeContainer.container.y = startY
				cubeContainer.container.alpha = 1
				cubeContainer.container.scale.set(1)
				return new Promise<void>((resolve) => {
					gsap.to(cubeContainer.container, {
						y: targetY,
						duration: 0.6,
						ease: 'power2.out',
						onComplete: () => {
							cubeContainer.container.y = targetY
							resolve()
						},
					})
				})
			} else {
				cubeContainer.container.alpha = 0
				cubeContainer.container.scale.set(0)
				return new Promise<void>((resolve) => {
					gsap.to(cubeContainer.container, {
						alpha: 1,
						scale: 1,
						duration: 0.15,
						ease: 'back.out',
						onComplete: resolve,
					})
				})
			}
		})
		await Promise.all(animations)
	}

	private findSpriteAt(r: number, c: number): Sprite | null {
		// Find cube ID at this position
		for (const [cubeId, pos] of this.cubePositions.entries()) {
			if (pos.r === r && pos.c === c) {
				return this.cubeContainers.get(cubeId)?.sprite || null
			}
		}
		return null
	}

	private findCubeIdAt(r: number, c: number): number | null {
		for (const [cubeId, pos] of this.cubePositions.entries()) {
			if (pos.r === r && pos.c === c) {
				return cubeId
			}
		}
		return null
	}

	updateTileSize(newTileSize: number, forceUpdatePositions = false, gridHeight?: number): void {
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
						cubeContainer.text.style.fontSize = Math.max(10, this.tileSize / 3)
						cubeContainer.text.resolution = window.devicePixelRatio || 1 // Улучшаем качество текста
						cubeContainer.text.x = this.tileSize / 2
						cubeContainer.text.y = this.tileSize / 2
					}

					// Обновить highlight (если есть)
					if (cubeContainer.highlight) {
						cubeContainer.highlight.clear()
						cubeContainer.highlight.rect(TILE_PADDING, TILE_PADDING, spriteSize, spriteSize)
						cubeContainer.highlight.stroke({ color: 0xffffff, width: 4, alpha: 1 })
						cubeContainer.highlight.rect(TILE_PADDING + 2, TILE_PADDING + 2, spriteSize - 4, spriteSize - 4)
						cubeContainer.highlight.stroke({ color: 0x000000, width: 2, alpha: 0.5 })
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

		const t = new Text({
			text: `CLEAR! +${bonus}`,
			style: new TextStyle({
				fontFamily: 'Arial',
				fontSize: Math.max(28, this.tileSize * 1.2),
				fill: 0xffdd00,
				align: 'center',
				fontWeight: 'bold',
			}),
		})
		t.resolution = window.devicePixelRatio || 1 // Улучшаем качество текста
		t.anchor.set(0.5)
		t.x = 0
		t.y = 0
		t.style.stroke = { color: 0x000000, width: 4 }
		popup.addChild(t)

		popup.alpha = 0
		popup.scale.set(0.5)
		this.app.stage.addChild(popup)

		await new Promise<void>((resolve) => {
			gsap.to(popup, {
				alpha: 1,
				duration: 0.3,
				ease: 'back.out',
			})
			gsap.to(popup.scale, { x: 1.2, y: 1.2, duration: 0.3, ease: 'back.out' })
			gsap.to(popup, {
				alpha: 0,
				y: popup.y - 60,
				duration: 1.0,
				delay: 1.4,
				ease: 'power2.in',
				onComplete: () => {
					if (popup.parent) popup.parent.removeChild(popup)
					popup.destroy({ children: true })
					resolve()
				},
			})
		})
	}

	async syncGridPositions(grid: (Cube | null)[][], forceUpdate = false): Promise<void> {
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
					// Update position if cube exists
					const cubeContainer = this.cubeContainers.get(cube.id)
					if (cubeContainer) {
						const pos = this.cubePositions.get(cube.id)
						if (forceUpdate || !pos || pos.r !== r || pos.c !== c) {
							// Position changed - update it (but don't animate, just set)
							this.cubePositions.set(cube.id, { r, c })
							cubeContainer.container.x = c * this.tileSize
							cubeContainer.container.y = this.calculateYFromBottom(r)
						}
					}
					// Don't create missing cubes here - they should be created by renderGrid or spawn events
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
			if (cubeContainer) {
				// Only remove if still in parent (wasn't already removed by animateRemove)
				if (cubeContainer.container.parent) {
					cubeContainer.container.parent.removeChild(cubeContainer.container)
				}
				cubeContainer.container.destroy({ children: true })
				this.cubeContainers.delete(cubeId)
				this.cubePositions.delete(cubeId)
			}
		}

		// Restore selection if it exists
		if (this.selectedPosition) {
			this.setSelectedPosition(this.selectedPosition.r, this.selectedPosition.c)
		}
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
			if (cubeContainer.sprite.texture.width <= 0 || cubeContainer.sprite.texture.height <= 0) {
				console.warn(`areTilesReady: texture has invalid dimensions for cube ${cubeId}`)
				return false
			}
			
			// Проверяем, что контейнер добавлен в gameContainer
			if (!cubeContainer.container.parent || cubeContainer.container.parent !== this.gameContainer) {
				console.warn(`areTilesReady: container not in gameContainer for cube ${cubeId}`)
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
	 * Диагностический метод для проверки состояния рендерера
	 * Используется для отладки проблем с отображением
	 */
	debugRenderState(): void {
		if (!this.app) {
			console.error('DEBUG: app is null')
			return
		}
		
		console.group('PixiJS Render State Debug')
		
		// Application state
		console.log('Application:', {
			initialized: !!this.app.renderer,
			tickerStarted: this.app.ticker.started,
			tickerSpeed: this.app.ticker.speed
		})
		
		// Renderer state
		if (this.app.renderer) {
			console.log('Renderer:', {
				width: this.app.renderer.width,
				height: this.app.renderer.height,
				resolution: this.app.renderer.resolution,
				type: this.app.renderer.type
			})
		} else {
			console.error('Renderer is null')
		}
		
		// Canvas state
		console.log('Canvas:', {
			width: this.canvas.width,
			height: this.canvas.height,
			styleWidth: this.canvas.style.width,
			styleHeight: this.canvas.style.height,
			clientWidth: this.canvas.clientWidth,
			clientHeight: this.canvas.clientHeight,
			offsetWidth: this.canvas.offsetWidth,
			offsetHeight: this.canvas.offsetHeight,
			inDOM: document.body.contains(this.canvas)
		})
		
		// Stage state
		if (this.app.stage) {
		console.log('Stage:', {
			children: this.app.stage.children.length,
			visible: this.app.stage.visible,
			alpha: this.app.stage.alpha
		})
		}
		
		// Game container state
		if (this.gameContainer) {
		console.log('GameContainer:', {
			children: this.gameContainer.children.length,
			visible: this.gameContainer.visible,
			alpha: this.gameContainer.alpha,
			parent: this.gameContainer.parent ? 'exists' : 'null'
		})
		} else {
			console.error('GameContainer is null')
		}
		
		// Cube containers state
		console.log('Cube Containers:', {
			count: this.cubeContainers.size,
			positions: this.cubePositions.size
		})
		
		// Sample first 3 containers for detailed info
		let sampleCount = 0
		for (const [cubeId, cubeContainer] of this.cubeContainers.entries()) {
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
			
			console.log(`Cube ${cubeId}:`, {
				position: this.cubePositions.get(cubeId),
				containerVisible: cubeContainer.container.visible,
				containerWorldVisible: containerWorldVisible,
				containerAlpha: cubeContainer.container.alpha,
				containerWorldAlpha: containerWorldAlpha,
				spriteVisible: cubeContainer.sprite.visible,
				spriteWorldVisible: spriteWorldVisible,
				spriteTexture: cubeContainer.sprite.texture ? {
					width: cubeContainer.sprite.texture.width,
					height: cubeContainer.sprite.texture.height
				} : 'null',
				parent: cubeContainer.container.parent ? 'exists' : 'null',
				bounds: cubeContainer.container.getBounds()
			})
			sampleCount++
		}
		
		console.groupEnd()
	}

	destroy(): void {
		this.cubeContainers.forEach((cubeContainer) => {
			if (cubeContainer.container.parent) {
				cubeContainer.container.parent.removeChild(cubeContainer.container)
			}
			cubeContainer.container.destroy({ children: true })
		})
		this.cubeContainers.clear()

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
