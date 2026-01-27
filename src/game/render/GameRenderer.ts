/**
 * Pixi.js game renderer - handles rendering and animations
 */

import { Container, Sprite, Text, TextStyle, Graphics } from 'pixi.js'
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
		const initStartTime = performance.now()
		console.log('[GameRenderer] init: starting initialization')

		// КРИТИЧНО: Используем PixiService вместо создания нового Application
		if (!PixiService.isReady()) {
			throw new Error('PixiService not initialized. Call PixiService.init() on StartPage first.')
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
				height: this.app.renderer.height
			})
		}
		
		// КРИТИЧНО: Проверяем, что ticker запущен (по умолчанию должен быть запущен)
		if (!this.app.ticker.started) {
			console.warn('PixiJS ticker is not started, starting manually')
			this.app.ticker.start()
		}
		
		// КРИТИЧНО: Принудительно рендерим первый кадр для проверки
		this.forceRender()

		console.log(`[GameRenderer] init: completed in ${(performance.now() - initStartTime).toFixed(2)}ms`)
	}

	/**
	 * КРИТИЧНО: Прогрев текстур - создание тестовых спрайтов и рендеринг для подготовки GPU
	 * ОБНОВЛЕНО: Текстуры уже прогреты в PixiService.init(), этот метод больше не нужен
	 * Оставлен для обратной совместимости, но ничего не делает
	 */
	async warmUpTextures(): Promise<void> {
		// Текстуры уже прогреты в PixiService.init() на StartPage
		console.log('[GameRenderer] warmUpTextures: textures already warmed in PixiService, skipping')
		return Promise.resolve()
	}

	async renderGrid(grid: (Cube | null)[][], nextCubeId: number = 1, excludeCubeIds?: Set<number>): Promise<void> {
		if (!this.gameContainer || !this.app) return

		this.nextCubeId = nextCubeId
		// Сохраняем высоту grid для расчета позиций снизу
		this.gridHeight = grid.length

		// Clear existing containers
		this.cubeContainers.forEach((cubeContainer) => {
			if (cubeContainer && cubeContainer.container) {
				// КРИТИЧНО: Убиваем все GSAP анимации перед уничтожением
				gsap.killTweensOf(cubeContainer.container)
				
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

		// Render all cubes, excluding new ones that will be created in animateSpawn
		for (let r = 0; r < grid.length; r++) {
			for (let c = 0; c < WIDTH; c++) {
				const cube = grid[r]?.[c]
				if (cube) {
					// Пропускаем новые кубы - они будут созданы в animateSpawn
					if (excludeCubeIds && excludeCubeIds.has(cube.id)) {
						continue
					}
					this.createCubeSprite(cube, r, c)
				}
			}
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
		return (r) * this.tileSize
	}

	private createCubeSprite(cube: Cube, r: number, c: number, initialAlpha: number = 1, initialScale: number = 1): CubeContainer {
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
				textureSource: texture.source ? 'exists' : 'missing'
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
							src: img.src.substring(0, 50) + '...'
						})
					}
				}
			} catch (e) {
				// Игнорируем ошибки доступа
			}
		}

		// Create container for cube
		const container = new Container()
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
		items: Array<{ id?: number; from: { r: number; c: number }; to: { r: number; c: number }; color: number }>
	): Promise<void> {
		const animations = items.map((item) => {
			// Use ID if available (more reliable), otherwise fall back to position lookup
			let cubeId: number | null = null
			if (item.id !== undefined) {
				cubeId = item.id
			} else {
				// Fallback: try to find cube by position (for backward compatibility)
				cubeId = this.findCubeIdAt(item.from.r, item.from.c)
			}
			
			if (cubeId === null) {
				// Cube not found - skip animation (may have been removed or already moved)
				return Promise.resolve()
			}

			const cubeContainer = this.cubeContainers.get(cubeId)
			if (!cubeContainer) {
				// Container not found - skip animation
				return Promise.resolve()
			}

			// Update position immediately to prevent duplicate lookups
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
						// КРИТИЧНО: Проверяем, что контейнер еще существует
						if (!cubeContainer || !cubeContainer.container) {
							resolve()
							return
						}

						const container = cubeContainer.container
						
						gsap.to(container, {
							alpha: 0,
							scale: 0,
							duration: 0.15,
							ease: 'back.in',
							onComplete: () => {
								// КРИТИЧНО: Проверяем, что контейнер еще существует и не уничтожен
								if (!container || !container.scale) {
									resolve()
									return
								}
								
								// КРИТИЧНО: Убиваем все GSAP анимации на контейнере перед уничтожением
								gsap.killTweensOf(container)
								
								if (container.parent) {
									container.parent.removeChild(container)
								}
								
								// Проверяем еще раз перед destroy
								if (container && container.scale) {
									container.destroy({ children: true })
								}
								
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
		if (!this.gameContainer) return

		// Текстуры уже должны быть прогреты в warmUpTextures(), поэтому не ждем здесь

		// КРИТИЧНО: Сначала создаем все спрайты синхронно
		// Это гарантирует, что все спрайты добавлены в контейнер перед запуском анимации
		for (const cell of cells) {
			let cubeContainer = this.cubeContainers.get(cell.id)
			
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
					cubeContainer = this.createCubeSprite(tempCube, targetRow, cell.c, 1, 1)
				} else {
					// Для появления на месте: создаем с alpha=0, scale=0 (будет анимироваться scale/alpha)
					// Используем 0, но убедимся, что спрайт видим перед анимацией
					cubeContainer = this.createCubeSprite(tempCube, targetRow, cell.c, 0, 0)
				}
				
				// КРИТИЧНО: Проверяем, что спрайт создан и добавлен в контейнер
				if (!cubeContainer || !cubeContainer.container.parent) {
					console.error(`Failed to create sprite for cell ${cell.id} at row ${targetRow}, col ${cell.c}`)
				} else {
					// Проверяем готовность текстуры после создания спрайта
					const createdTexture = cubeContainer.sprite.texture
					if (!createdTexture || createdTexture.width <= 0 || createdTexture.height <= 0) {
						console.error(`Sprite created but texture not ready for cell ${cell.id}, color ${cell.color}`, {
							textureWidth: createdTexture?.width,
							textureHeight: createdTexture?.height
						})
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
				// КРИТИЧНО: Устанавливаем начальную позицию ПЕРЕД анимацией
				const container = cubeContainer.container
				
				if (!container) {
					return Promise.resolve()
				}
				
				container.y = startY
				container.visible = true
				cubeContainer.sprite.visible = true
				
				return new Promise<void>((resolve) => {
					gsap.to(container, {
						y: targetY,
						duration: 0.6,
						ease: 'power2.out',
						onComplete: () => {
							// КРИТИЧНО: Проверяем, что контейнер еще существует
							if (container && container.y !== undefined) {
								container.y = targetY
							}
							resolve()
						},
					})
				})
			} else {
				// Для появления на месте: спрайт уже создан с alpha=0, scale=0
				// КРИТИЧНО: Убеждаемся, что контейнер видим перед анимацией
				cubeContainer.container.visible = true
				cubeContainer.sprite.visible = true
				
				// Убеждаемся, что начальные значения установлены правильно
				cubeContainer.container.alpha = 0
				if (cubeContainer.container.scale) {
					cubeContainer.container.scale.set(0)
				}
				
				// Анимируем от 0 до 1 (текстуры уже прогреты в warmUpTextures)
				return new Promise<void>((resolve) => {
					const container = cubeContainer.container
					
					gsap.to(container, {
						alpha: 1,
						scale: 1,
						duration: 0.15,
						ease: 'back.out',
						onComplete: () => {
							// КРИТИЧНО: Проверяем, что контейнер еще существует перед установкой значений
							if (!container || !container.scale) {
								resolve()
								return
							}
							
							// Убеждаемся, что финальные значения установлены
							container.alpha = 1
							container.scale.set(1)
							resolve()
						},
					})
				})
			}
		})
		
		// Ждем один кадр перед запуском всех анимаций для синхронизации
		await this.waitForNextFrame()
		
		await Promise.all(animations)
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
				gsap.to(popup.scale, { x: 1.2, y: 1.2, duration: 0.3, ease: 'back.out' })
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
		// Center on screen (viewport) instead of canvas
		const screenWidth = this.app.screen.width || window.innerWidth
		const screenHeight = this.app.screen.height || window.innerHeight
		popup.x = screenWidth / 2
		popup.y = screenHeight * 0.6 // Position lower than center

		const t = new Text({
			text: `Great! +${bonus}`,
			style: new TextStyle({
				fontFamily: 'Arial',
				fontSize: Math.max(18, this.tileSize * 0.7),
				fill: 0x00ff00,
				align: 'center',
				fontWeight: 'bold',
			}),
		})
		t.resolution = window.devicePixelRatio || 1
		t.anchor.set(0.5)
		t.x = 0
		t.y = 0
		t.style.stroke = { color: 0x000000, width: 2 }
		popup.addChild(t)

		popup.alpha = 0
		if (popup.scale) {
			popup.scale.set(0.5)
		}
		this.app.stage.addChild(popup)

		// Воспроизводим звук combo5 в момент появления надписи
		AudioManager.playCombo5()

		await new Promise<void>((resolve) => {
			gsap.to(popup, {
				alpha: 1,
				duration: 0.3,
				ease: 'back.out',
			})
			if (popup.scale) {
				gsap.to(popup.scale, { x: 1.1, y: 1.1, duration: 0.3, ease: 'back.out' })
			}
			gsap.to(popup, {
				alpha: 0,
				y: popup.y - 30,
				duration: 1.0,
				delay: 1.5,
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

	async showNoMovesMessage(bonus: number): Promise<void> {
		if (!this.app) return

		const popup = new Container()
		// Center on screen (viewport) instead of canvas
		const screenWidth = this.app.screen.width || window.innerWidth
		const screenHeight = this.app.screen.height || window.innerHeight
		popup.x = screenWidth / 2
		popup.y = screenHeight * 0.6 // Position lower than center

		// "No Moves" text
		const noMovesText = new Text({
			text: 'No Moves',
			style: new TextStyle({
				fontFamily: 'Arial',
				fontSize: Math.max(18, this.tileSize * 0.7),
				fill: 0xffaa00,
				align: 'center',
				fontWeight: 'bold',
			}),
		})
		noMovesText.resolution = window.devicePixelRatio || 1
		noMovesText.anchor.set(0.5)
		noMovesText.x = 0
		noMovesText.y = -12 // Position above bonus text
		noMovesText.style.stroke = { color: 0x000000, width: 2 }
		popup.addChild(noMovesText)

		// Timer bonus text (separate, below "No Moves")
		const bonusText = new Text({
			text: `+${bonus}`,
			style: new TextStyle({
				fontFamily: 'Arial',
				fontSize: Math.max(16, this.tileSize * 0.6),
				fill: 0x00ff00,
				align: 'center',
				fontWeight: 'bold',
			}),
		})
		bonusText.resolution = window.devicePixelRatio || 1
		bonusText.anchor.set(0.5)
		bonusText.x = 0
		bonusText.y = 12 // Position below "No Moves" text
		bonusText.style.stroke = { color: 0x000000, width: 2 }
		popup.addChild(bonusText)

		popup.alpha = 0
		if (popup.scale) {
			popup.scale.set(0.5)
		}
		this.app.stage.addChild(popup)

		// Воспроизводим звук combo4 в момент появления надписи
		AudioManager.playCombo4()

		await new Promise<void>((resolve) => {
			gsap.to(popup, {
				alpha: 1,
				duration: 0.3,
				ease: 'back.out',
			})
			if (popup.scale) {
				gsap.to(popup.scale, { x: 1.1, y: 1.1, duration: 0.3, ease: 'back.out' })
			}
			gsap.to(popup, {
				alpha: 0,
				y: popup.y - 30,
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
			if (cubeContainer && cubeContainer.container) {
				// КРИТИЧНО: Убиваем все GSAP анимации перед уничтожением
				gsap.killTweensOf(cubeContainer.container)
				
				// Only remove if still in parent (wasn't already removed by animateRemove)
				if (cubeContainer.container.parent) {
					cubeContainer.container.parent.removeChild(cubeContainer.container)
				}
				
				// Проверяем, что контейнер еще существует перед destroy
				if (cubeContainer.container && cubeContainer.container.scale) {
					cubeContainer.container.destroy({ children: true })
				}
				
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
		console.log('[GameRenderer] waitForTilesVisible: starting')
		
		if (!this.app || !this.gameContainer) {
			console.warn('waitForTilesVisible: app or gameContainer not initialized')
			return
		}

		// 1. Проверяем, что renderer инициализирован и имеет валидные размеры
		if (!this.app.renderer || this.app.renderer.width <= 0 || this.app.renderer.height <= 0) {
			console.warn('waitForTilesVisible: renderer has invalid dimensions', {
				width: this.app.renderer?.width,
				height: this.app.renderer?.height
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

		const canvasRect = this.canvas.getBoundingClientRect()
		if (canvasRect.width <= 0 || canvasRect.height <= 0) {
			console.warn('waitForTilesVisible: canvas has zero dimensions', {
				width: canvasRect.width,
				height: canvasRect.height
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
				console.warn(`[GameRenderer] waitForTilesVisible: sprite or texture missing for cube ${cubeId}`)
				throw new Error(`Sprite or texture missing for cube ${cubeId}`)
			}

			if (cubeContainer.sprite.texture.width <= 0 || cubeContainer.sprite.texture.height <= 0) {
				console.warn(`[GameRenderer] waitForTilesVisible: texture has invalid dimensions for cube ${cubeId}`, {
					width: cubeContainer.sprite.texture.width,
					height: cubeContainer.sprite.texture.height
				})
				throw new Error(`Texture has invalid dimensions for cube ${cubeId}`)
			}

			if (!cubeContainer.container.parent || cubeContainer.container.parent !== this.gameContainer) {
				console.warn(`[GameRenderer] waitForTilesVisible: container not in gameContainer for cube ${cubeId}`)
				throw new Error(`Container not in gameContainer for cube ${cubeId}`)
			}
		}

		// 7. КРИТИЧНО: Проверяем, что плитки реально видны и анимация завершена
		// Для плиток, появляющихся на месте (alpha/scale анимация), проверяем что alpha === 1 и scale === 1
		// Это гарантирует, что анимация spawn полностью завершена и плитки отображаются
		let tilesVisible = false
		let attempts = 0
		const maxAttempts = 30 // Увеличиваем количество попыток для холодного старта
		const visibilityCheckStartTime = performance.now()
		const VISIBILITY_THRESHOLD = 0.95 // Порог для alpha и scale (почти 1.0, чтобы учесть погрешности)
		
		while (!tilesVisible && attempts < maxAttempts) {
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
				if (cubeContainer.container.scale.x < VISIBILITY_THRESHOLD || cubeContainer.container.scale.y < VISIBILITY_THRESHOLD) {
					tilesVisible = false
					animatingCount++
					continue
				}
				
				// Проверяем спрайт
				if (!cubeContainer.sprite.visible || cubeContainer.sprite.alpha < VISIBILITY_THRESHOLD) {
					tilesVisible = false
					invisibleCount++
					continue
				}
			}
			
			if (!tilesVisible) {
				attempts++
				if (attempts % 5 === 0) {
					console.log(`[GameRenderer] waitForTilesVisible: waiting for tiles visibility (attempt ${attempts}/${maxAttempts}, ${invisibleCount} invisible, ${animatingCount} animating)`)
				}
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
		if (tilesVisible) {
			console.log(`[GameRenderer] waitForTilesVisible: tiles became fully visible after ${visibilityCheckDuration.toFixed(2)}ms (${attempts} attempts)`)
		} else {
			console.warn(`[GameRenderer] waitForTilesVisible: tiles not fully visible after ${visibilityCheckDuration.toFixed(2)}ms (${attempts} attempts)`)
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

		const duration = performance.now() - startTime
		console.log(`[GameRenderer] waitForTilesVisible: completed in ${duration.toFixed(2)}ms`)
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
				// КРИТИЧНО: Убиваем все GSAP анимации перед уничтожением
				gsap.killTweensOf(cubeContainer.container)
				
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

		// КРИТИЧНО: НЕ уничтожаем Application - он принадлежит PixiService
		// Просто очищаем ссылки
		this.app = null
		this.gameContainer = null
	}
}
