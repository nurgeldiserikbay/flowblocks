/**
 * Game controller - coordinates store, logic, and renderer
 */

import type { GameRenderer } from './render/GameRenderer'
import { useGameStore } from '@/shared/stores/gameStore'
import {
	createInitialGrid,
	trySwap,
	trySlide,
	applyGravityWithFallTracking,
	resolveAfterMove,
	spawnWave,
	calculateBaseRemovalScore,
	calculateComboBonus,
	getVesselClearBonus,
	cloneGrid,
	expandGrid,
	type Position,
	WIDTH,
} from './logic'
import type { GameEvent } from './logic/types'
import { AudioManager } from './audio/AudioManager'
import { loadBlockTextures, waitForTexturesReady } from './blockTextures'

const COMBO_WINDOW_MS = 2500

export interface GameControllerOptions {
	/** Вызывается после расширения сосуда: переразмер канваса, скролл к низу. */
	onVesselExpanded?: () => void | Promise<void>
	/** Вызывается для скрытия loading overlay. Должен быть вызван после первого кадра с плитками. */
	onHideLoading?: () => void
	/** Вызывается для запуска анимации скроллинга. Должен вернуть Promise, который резолвится после завершения анимации. */
	onStartScrollAnimation?: () => Promise<void>
}

export class GameController {
	private renderer: GameRenderer | null = null
	private store = useGameStore()
	private nextCubeId: number = 1
	private timerInterval: number | null = null
	private lastTickTime: number = 0
	private comboLevel: number = 0
	private comboTimer: ReturnType<typeof setTimeout> | null = null
	private opts: GameControllerOptions

	constructor(renderer: GameRenderer, opts?: GameControllerOptions) {
		this.renderer = renderer
		this.opts = opts ?? {}
	}

	/**
	 * Инициализация контроллера - загрузка текстур блоков
	 * КРИТИЧНО: Если текстуры уже предзагружены (например, на StartPage),
	 * они будут использованы из кэша без повторной загрузки
	 */
	async init(): Promise<void> {
		// Загружаем текстуры (если уже предзагружены, вернется кэш)
		await loadBlockTextures()
		
		// КРИТИЧНО: Убеждаемся, что текстуры полностью готовы к использованию
		// Это особенно важно, если они были предзагружены, но еще не декодированы
		await waitForTexturesReady(5000)
		
		// Ассеты загружены
		this.store.setAssetsReady(true)
	}

	async startGame(): Promise<void> {
		// Reset store
		this.store.reset()

		// Reset audio flags
		AudioManager.resetOnceFlags()

		// Сбрасываем состояния готовности
		this.store.setAssetsReady(false)
		this.store.setSceneReady(false)
		this.store.setTexturesWarmed(false)
		this.store.setTilesAdded(false)
		this.store.setFirstFrameRendered(false)
		this.store.setGameStarted(false)

		// КРИТИЧНО: Убеждаемся, что текстуры загружены перед проверкой готовности
		// Это особенно важно при обновлении страницы, когда кэш может быть очищен
		await loadBlockTextures()
		this.store.setAssetsReady(true)
		this.store.setDiagnostic('assetsLoaded', performance.now())

		await waitForTexturesReady()

		// Проверяем, что сцена готова (Pixi Application инициализирован)
		if (!this.renderer || !this.renderer.isInitialized()) {
			throw new Error('Renderer or Pixi Application not initialized')
		}
		this.store.setSceneReady(true)
		this.store.setDiagnostic('pixiInit', performance.now())

		// КРИТИЧНО: Прогреваем текстуры - создаем тестовые спрайты и рендерим их
		// Это заставляет GPU загрузить текстуры в память и подготовить их к быстрому отображению
		// Loading overlay будет показываться во время прогрева
		if (this.renderer) {
			try {
				await this.renderer.warmUpTextures()
				this.store.setTexturesWarmed(true)
				this.store.setDiagnostic('texturesWarmed', performance.now())
			} catch (error) {
				console.warn('[GameController] startGame: texture warm-up failed', error)
				// Продолжаем выполнение - текстуры все равно будут работать, но могут быть медленнее
				this.store.setTexturesWarmed(true) // Помечаем как прогретые даже при ошибке
			}
		}  

		// Create initial grid
		const { grid, nextId } = createInitialGrid(this.store.getHeight(), 1)
		this.nextCubeId = nextId
		this.store.setGrid(grid)

		// Собираем все начальные плитки для анимации появления
		const initialCubes: Array<{ id: number; r: number; c: number; color: number }> = []
		for (let r = 0; r < grid.length; r++) {
			for (let c = 0; c < WIDTH; c++) {
				const cube = grid[r]?.[c]
				if (cube) {
					initialCubes.push({
						id: cube.id,
						r,
						c,
						color: cube.color,
					})
				}
			}
		}

		// Создаем событие spawn для начальных плиток (без fromRow, чтобы они появлялись на месте)
		const initialSpawnEvent: GameEvent = {
			type: 'spawn',
			cells: initialCubes.map((cube) => ({
				id: cube.id,
				r: cube.r,
				c: cube.c,
				color: cube.color,
				// Без fromRow - плитки будут появляться на месте с анимацией scale/alpha
			})),
		}

		// Render initial grid БЕЗ создания спрайтов для начальных плиток
		// Они будут созданы в animateSpawn с правильными начальными состояниями
		const initialCubeIds = new Set(initialCubes.map((c) => c.id))
		this.store.setTilesAdded(true)
		this.store.setDiagnostic('tilesAdded', performance.now())
		await this.renderer?.renderGrid(grid, this.nextCubeId, initialCubeIds)

		// КРИТИЧНО: Ждем дополнительный кадр перед запуском анимации
		// Это гарантирует, что PixiJS успел отрендерить пустой grid и готов к созданию новых спрайтов
		// Особенно важно при первой загрузке страницы, когда браузер еще инициализируется
		if (this.renderer && initialCubes.length > 0) {
			await this.renderer.waitForNextFrame()
		}

		// Анимируем появление начальных плиток
		if (this.renderer && initialCubes.length > 0) {
			await this.renderer.applyEvents([initialSpawnEvent])
			
			// Обновляем moves для начальных плиток (они были созданы с moves=0)
			for (const cube of initialCubes) {
				const actualCube = grid[cube.r]?.[cube.c]
				if (actualCube && actualCube.moves > 0) {
					this.renderer.updateCubeMoves(actualCube.id, actualCube.moves)
				}
			}
		}
		
		// КРИТИЧНО: Ждем, пока плитки реально видны на экране ПОСЛЕ завершения анимации
		// Это гарантирует, что первый кадр с видимыми плитками уже отрендерен
		// Только после этого можно скрывать loading overlay и запускать таймер
		if (this.renderer) {
			try {
				// Ждем видимости плиток (детерминированное ожидание первого видимого кадра)
				// КРИТИЧНО: Вызывается ПОСЛЕ завершения анимации spawn
				await this.renderer.waitForTilesVisible()
				
				// После реального рендера первого кадра с видимыми плитками
				// Устанавливаем флаг готовности
				this.onFirstFrameRendered()
			} catch (error) {
				console.error('[GameController] startGame: failed to wait for tiles visible', error)
				// Продолжаем выполнение, но это может привести к проблемам с отображением
				// Устанавливаем флаг в любом случае, чтобы не заблокировать игру
				this.onFirstFrameRendered()
			}
		} else {
			// Если renderer отсутствует, все равно устанавливаем флаг
			this.onFirstFrameRendered()
		}
	}

	/**
	 * Единая boot-цепочка для детерминированного запуска игры
	 * Правильный порядок:
	 * 1) Плитки реально появляются на экране (первый кадр рендера с плитками)
	 * 2) Лоадинг исчезает
	 * 3) Запускается анимация скроллинга (auto-scroll / scrollToBottomAnimated)
	 * 4) Стартует таймер обратного отсчёта (wave timer)
	 * 
	 * КРИТИЧНО: startGame() должен быть вызван ДО этой функции
	 */
	async bootGame(): Promise<void> {
		// 1. Проверяем, что плитки готовы (startGame уже должен был это сделать)
		if (!this.store.isFirstFrameRendered) {
			// Ждем готовности
			let attempts = 0
			while (!this.store.isFirstFrameRendered && attempts < 50) {
				await new Promise(resolve => setTimeout(resolve, 100))
				attempts++
			}
			if (!this.store.isFirstFrameRendered) {
				throw new Error('First frame not rendered after waiting')
			}
		}

		// Ждем несколько дополнительных кадров рендера
		if (this.renderer && this.renderer.isInitialized()) {
			// Используем renderer для ожидания дополнительных кадров
			for (let i = 0; i < 2; i++) {
				await this.renderer.waitForNextFrame()
			}
		} else {
			// Fallback: ждем через requestAnimationFrame
			for (let i = 0; i < 2; i++) {
				await new Promise(resolve => requestAnimationFrame(resolve))
			}
		}

		// 2. Скрытие loader теперь происходит внутри logDiagnostics() при условии firstFrameRendered
		// Это гарантирует, что loader скрывается только после того, как плитки реально видны

		// 3. Запускаем анимацию скроллинга
		if (this.opts.onStartScrollAnimation) {
			try {
				this.store.setDiagnostic('scrollStarted', performance.now())
				await this.opts.onStartScrollAnimation()
			} catch (error) {
				console.error('[GameController] bootGame: scroll animation failed', error)
				// Продолжаем выполнение даже если скролл не удался
			}
		} else {
			console.warn('[GameController] bootGame: onStartScrollAnimation callback not provided')
		}

		// 4. Запускаем таймер обратного отсчёта
		this.store.setDiagnostic('timerStarted', performance.now())
		this.startTimer()
		
		// Логируем диагностику после завершения boot-цепочки
		// КРИТИЧНО: Скрытие loader происходит внутри logDiagnostics() при условии firstFrameRendered
		this.store.logDiagnostics(this.opts.onHideLoading)

		// Игра запущена
		this.store.setGameStarted(true)
	}

	/**
	 * Вызывается после первого реального рендера плиток
	 * КРИТИЧНО: Вызывается только после waitForTilesVisible()
	 * Устанавливает флаг готовности, но НЕ запускает таймер
	 * Таймер запускается позже в bootGame() после скролла
	 */
	private onFirstFrameRendered(): void {
		// Первый кадр отрендерен
		this.store.setFirstFrameRendered(true)
		this.store.setDiagnostic('firstFrameRendered', performance.now())
	}

	private startTimer(): void {
		this.lastTickTime = Date.now()
		this.timerInterval = window.setInterval(() => {
			this.tick()
		}, 1000) // Update every second
	}

	private tick(): void {
		if (this.store.isGameOver || this.store.isLocked) return

		const now = Date.now()
		const dt = (now - this.lastTickTime) / 1000 // seconds
		this.lastTickTime = now

		const newTime = this.store.remainingTime - dt
		this.store.setRemainingTime(newTime)

		if (newTime <= 0) {
			this.onWaveEnd()
		}
	}

	private async onWaveEnd(): Promise<void> {
		if (this.store.isLocked || this.store.isGameOver) return

		if (this.comboTimer !== null) {
			clearTimeout(this.comboTimer)
			this.comboTimer = null
		}
		this.comboLevel = 0

		this.store.setLocked(true)

		const newWaveIndex = this.store.waveIndex + 1
		// Reset timer (длительность волны уменьшается с уровнем)
		this.store.setRemainingTime(this.store.getWaveDuration(newWaveIndex))

		// Spawn wave
		const grid = cloneGrid(this.store.grid)
		const result = spawnWave(grid, this.store.spawnRows, this.nextCubeId)
		this.nextCubeId = result.nextId

		// Update grid (new cubes are already placed)
		this.store.setGrid(grid)

		// Собираем ID новых кубов из событий spawn, чтобы не создавать для них спрайты в renderGrid
		// Они будут созданы в animateSpawn с правильными начальными состояниями
		const newCubeIds = new Set<number>()
		for (const event of result.events) {
			if (event.type === 'spawn') {
				for (const cell of event.cells) {
					newCubeIds.add(cell.id)
				}
			}
		}

		// Re-render grid, исключая новые кубы (они будут созданы в animateSpawn)
		await this.renderer?.renderGrid(grid, this.nextCubeId, newCubeIds.size > 0 ? newCubeIds : undefined)

		// Play spawn sound (once per wave)
		AudioManager.playSpawn()

		// Then animate spawn events (falling from above)
		// animateSpawn создаст спрайты для новых кубов с правильными начальными состояниями
		if (this.renderer && result.events.length > 0) {
			await this.renderer.applyEvents(result.events)
			
			// Обновляем moves для новых плиток (они были созданы с moves=0)
			// Собираем ID новых кубов из событий spawn
			const newCubeIds = new Set<number>()
			for (const event of result.events) {
				if (event.type === 'spawn') {
					for (const cell of event.cells) {
						newCubeIds.add(cell.id)
					}
				}
			}
			
			// Находим кубы в grid по ID и обновляем их moves
			// После гравитации позиции могут измениться, поэтому ищем по всему grid
			for (let r = 0; r < grid.length; r++) {
				for (let c = 0; c < WIDTH; c++) {
					const cube = grid[r]?.[c]
					if (cube && newCubeIds.has(cube.id) && cube.moves > 0) {
						this.renderer.updateCubeMoves(cube.id, cube.moves)
					}
				}
			}
		}

		this.store.setWaveIndex(newWaveIndex)
		// С ростом уровня растёт количество строк спавна (макс. 8)
		this.store.setSpawnRows(this.store.getSpawnRowsForLevel(newWaveIndex))

		// Расширение сосуда каждые 5 уровней для бесконечной игры
		if (!result.gameOver) {
			const newHeight = this.store.getHeightForLevel(newWaveIndex)
			if (newHeight > this.store.getHeight()) {
				expandGrid(grid, newHeight)
				this.store.setHeight(newHeight)
				// Явный вызов: переразмер канваса и скролл к низу (watch может не успеть / не сработать)
				await Promise.resolve(this.opts.onVesselExpanded?.())
			}
		}

		// Sync positions after spawn animations
		await this.renderer?.syncGridPositions(grid)

		// Check game over
		if (result.gameOver) {
			this.store.setGameOver(true)
			// Play game over sound
			AudioManager.playGameOver()
		}

		this.store.setLocked(false)
	}

	async applyUserAction(
		action: 'swap' | 'slide',
		from: Position,
		to: Position
	): Promise<void> {
		if (this.store.isLocked || this.store.isGameOver) return

		this.store.setLocked(true)

		const grid = cloneGrid(this.store.grid)
		let success = false
		let moveEvent: GameEvent | null = null

		// Perform move
		if (action === 'swap') {
			// Запомнить, был ли у куба в to 0 ходов (до обмена)
			const replacedHadNoMoves = (grid[to.r]?.[to.c]?.moves ?? 0) === 0
			success = trySwap(grid, from, to)
			if (success) {
				// После swap: from = куб с которым меняли, to = куб которого двигали
				const cubeReplaced = grid[from.r]?.[from.c] // бывший в to
				const cubeMoved = grid[to.r]?.[to.c]       // бывший в from
				// Двигаемый: -1 обычно; -2 если блок с которым меняли не имел ходов
				if (cubeMoved) {
					const delta = replacedHadNoMoves ? 2 : 1
					cubeMoved.moves = Math.max(0, cubeMoved.moves - delta)
					if (this.renderer) this.renderer.updateCubeMoves(cubeMoved.id, cubeMoved.moves)
				}
				if (cubeReplaced) {
					cubeReplaced.moves = Math.max(0, cubeReplaced.moves - 1)
					if (this.renderer) this.renderer.updateCubeMoves(cubeReplaced.id, cubeReplaced.moves)
				}
				moveEvent = { type: 'swap', a: from, b: to }
			}
		} else if (action === 'slide') {
			success = trySlide(grid, from, to)
			if (success) {
				const cube = grid[to.r]?.[to.c]
				if (cube) {
					// Слайд: цель пустая, «блок с которым заменили» нет — минус 1 ход
					cube.moves = Math.max(0, cube.moves - 1)
					if (this.renderer) this.renderer.updateCubeMoves(cube.id, cube.moves)
					moveEvent = {
						type: 'move',
						from,
						to,
						color: cube.color,
						kind: 'slide',
					}
				}
			}
		}

		if (!success || !moveEvent) {
			this.store.setLocked(false)
			return
		}

		// Play move sound
		AudioManager.playMove()

		// Animate move first (this updates positions in renderer)
		if (this.renderer) {
			await this.renderer.applyEvents([moveEvent])
		}

		// Update store grid AFTER animation completes
		// This ensures renderer cubePositions are synced with grid before resolveAfterMove
		this.store.setGrid(grid)

		// Positions of moved tiles for match resolution (only matches touching these are removed)
		let checkPositions: Position[] = [from, to]

		// After slide move: from is always empty — blocks above it must fall. Always apply gravity.
		if (action === 'slide' && success) {
			const fallItems = applyGravityWithFallTracking(grid)
			this.store.setGrid(grid)

			if (fallItems.length > 0 && this.renderer) {
				const fallEvent: GameEvent = {
					type: 'fall',
					items: fallItems,
				}
				await this.renderer.applyEvents([fallEvent])
				await this.renderer.syncGridPositions(grid)
			}

			// For resolve: all landing positions; add to if the moved cube did not fall
			const movedCubeFell = fallItems.some((f) => f.from.r === to.r && f.from.c === to.c)
			checkPositions = fallItems.map((f) => f.to)
			if (!movedCubeFell) checkPositions.push(to)
		}

		// Apply gravity and resolve matches
		// Note: resolveAfterMove works on grid where cubes are already swapped/moved
		// On first check, only matches that touch moved positions are removed
		const resolveResult = resolveAfterMove(grid, checkPositions)
		this.store.setGrid(grid)

		// Enrich remove events with baseScore/comboBonus and add score
		// Store chainIndex in events for sound playback during animation
		let removeEventIndex = 0
		for (const ev of resolveResult.events) {
			if (ev.type !== 'remove') continue
			removeEventIndex++
			const chainIndex = removeEventIndex

			const baseScore = calculateBaseRemovalScore(ev.cells)
			let comboBonus = 0
			if (this.comboTimer !== null) {
				this.comboLevel++
				comboBonus = calculateComboBonus(this.comboLevel, ev.cells.length)
				clearTimeout(this.comboTimer)
			} else {
				this.comboLevel = 1
			}
			this.comboTimer = setTimeout(() => {
				this.comboTimer = null
				this.comboLevel = 0
			}, COMBO_WINDOW_MS)
			ev.baseScore = baseScore
			ev.comboBonus = comboBonus
			ev.chainIndex = chainIndex // Сохраняем chainIndex для воспроизведения звука во время анимации
			this.store.addScore(baseScore + comboBonus)
		}

		// Apply resolve events (remove, fall, etc.)
		// Note: We don't re-render grid after events because:
		// 1. Remove events already remove sprites by ID
		// 2. Fall events already animate sprites to new positions
		// 3. Re-rendering would recreate all sprites and lose animations
		// Only sync positions after animations complete
		if (this.renderer && resolveResult.events.length > 0) {
			await this.renderer.applyEvents(resolveResult.events)
			// After animations, sync positions with grid state
			// This will update positions of cubes that moved due to gravity
			// animateRemove already removed cubes from maps, so syncGridPositions won't try to remove them again
			await this.renderer.syncGridPositions(grid)
		}

		// Check for vessel clear bonus
		let isEmpty = true
		for (let r = 0; r < grid.length; r++) {
			for (let c = 0; c < WIDTH; c++) {
				if (grid[r]?.[c]) {
					isEmpty = false
					break
				}
			}
			if (!isEmpty) break
		}

		if (isEmpty) {
			const clearBonus = getVesselClearBonus(grid)
			this.store.addScore(clearBonus)
			await this.renderer?.showFullClearBonus(clearBonus)
			// Play clear sound
			AudioManager.playClear()
		}

		this.store.setLocked(false)
	}


	stop(): void {
		if (this.timerInterval) {
			window.clearInterval(this.timerInterval)
			this.timerInterval = null
		}
		if (this.comboTimer !== null) {
			clearTimeout(this.comboTimer)
			this.comboTimer = null
		}
	}

	destroy(): void {
		this.stop()
		this.renderer?.destroy()
		this.renderer = null
	}
}
