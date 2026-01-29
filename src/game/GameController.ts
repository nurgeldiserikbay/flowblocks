/**
 * Game controller - coordinates store, logic, and renderer
 */

import type { GameRenderer } from './render/GameRenderer'
import { useGameStore } from '@/shared/stores/gameStore'
import {
	createInitialGrid,
	trySwap,
	trySlide,
	applyGravityUntilSettled,
	resolveAfterMove,
	spawnWave,
	calculateBaseRemovalScore,
	calculateComboBonus,
	getVesselClearBonus,
	getGreatBonus,
	getNoMovesBonus,
	cloneGrid,
	expandGrid,
	hasPossibleMoves,
	isGridEmpty,
	countCubes,
	getCube,
	type Position,
	type Cube,
	WIDTH,
} from './logic'
import type { GameEvent } from './logic/types'
import { AudioManager } from './audio/AudioManager'
import { loadBlockTextures, waitForTexturesReady } from './blockTextures'
import { PixiService } from '@/pixi/PixiService'

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
	private timerTimeout: ReturnType<typeof setTimeout> | null = null
	private timerStartTime: number = 0 // Время начала текущего таймера
	private expectedNextTick: number = 0 // Ожидаемое время следующего тика
	private comboLevel: number = 0
	private comboTimer: ReturnType<typeof setTimeout> | null = null
	private opts: GameControllerOptions
	private lastStateCheckTime: number = 0 // Время последней проверки состояния игры
	private readonly STATE_CHECK_INTERVAL = 2000 // Проверяем состояние не чаще чем раз в 2 секунды
	private lastHasMovesCheck: { gridHash: string; result: boolean } | null = null // Кэш последней проверки hasPossibleMoves

	constructor(renderer: GameRenderer, opts?: GameControllerOptions) {
		this.renderer = renderer
		this.opts = opts ?? {}
	}

	/**
	 * Инициализация контроллера - загрузка текстур блоков
	 * ОБНОВЛЕНО: Текстуры уже загружены и прогреты в PixiService на StartPage
	 * Просто проверяем готовность и устанавливаем флаги
	 */
	async init(): Promise<void> {
		// КРИТИЧНО: Текстуры уже загружены в PixiService.init() на StartPage
		// Просто проверяем готовность
		if (!PixiService.isReady()) {
			console.warn(
				'[GameController] init: PixiService not ready, attempting to load textures',
			)
			// Fallback: пытаемся загрузить текстуры (не должно происходить)
			await loadBlockTextures()
			await waitForTexturesReady(5000)
		}

		// Ассеты загружены (уже установлено в StartPage, но устанавливаем для совместимости)
		this.store.setAssetsReady(true)
	}

	async startGame(): Promise<void> {
		const startGameTime = performance.now()

		// Очищаем кэш при старте игры
		this.lastHasMovesCheck = null

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

		// КРИТИЧНО: Текстуры уже загружены и прогреты в PixiService на StartPage
		// Просто устанавливаем флаги готовности
		this.store.setAssetsReady(true)
		this.store.setDiagnostic('assetsLoaded', performance.now())

		// Проверяем, что сцена готова (Pixi Application инициализирован)
		if (!this.renderer || !this.renderer.isInitialized()) {
			throw new Error('Renderer or Pixi Application not initialized')
		}
		this.store.setSceneReady(true)
		this.store.setDiagnostic('pixiInit', performance.now())

		// КРИТИЧНО: Текстуры уже прогреты в PixiService.init() на StartPage
		this.store.setTexturesWarmed(true)
		this.store.setDiagnostic('texturesWarmed', performance.now())

		// Create initial grid
		const { grid, nextId } = createInitialGrid(
			this.store.getHeight(),
			1,
			this.store.currentLevel,
		)
		this.nextCubeId = nextId
		this.store.setGrid(grid)

		// Собираем все начальные плитки для анимации появления
		const initialCubes: Array<{
			id: number
			r: number
			c: number
			color: number
		}> = []
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
		const tilesAddedTime = performance.now()
		this.store.setTilesAdded(true)
		this.store.setDiagnostic('tilesAdded', tilesAddedTime)
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
				const waitForVisibleStartTime = performance.now()

				// Ждем видимости плиток (детерминированное ожидание первого видимого кадра)
				// КРИТИЧНО: Вызывается ПОСЛЕ завершения анимации spawn
				await this.renderer.waitForTilesVisible()

				// После реального рендера первого кадра с видимыми плитками
				// Устанавливаем флаг готовности
				this.onFirstFrameRendered()
			} catch (error) {
				console.error(
					'[GameController] startGame: failed to wait for tiles visible',
					error,
				)
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
				await new Promise((resolve) => setTimeout(resolve, 100))
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
				await new Promise((resolve) => requestAnimationFrame(resolve))
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
				console.error(
					'[GameController] bootGame: scroll animation failed',
					error,
				)
				// Продолжаем выполнение даже если скролл не удался
			}
		} else {
			console.warn(
				'[GameController] bootGame: onStartScrollAnimation callback not provided',
			)
		}

		// 4. Запускаем таймер обратного отсчёта
		const timerStartTime = performance.now()
		this.store.setDiagnostic('timerStarted', timerStartTime)
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
		const firstFrameTime = performance.now()
		this.store.setFirstFrameRendered(true)
		this.store.setDiagnostic('firstFrameRendered', firstFrameTime)
	}

	private startTimer(): void {
		const now = Date.now()
		this.timerStartTime = now
		this.expectedNextTick = now + 1000 // Первый тик через 1 секунду
		this.scheduleNextTick()
	}

	private scheduleNextTick(force: boolean = false): void {
		if (this.store.isGameOver) return

		// Защита от двойного запуска
		if (this.timerTimeout !== null) {
			// Не логируем предупреждение, если это нормальный вызов (не force)
			if (force) {
				console.warn(
					'[GameController] scheduleNextTick: timer already scheduled, clearing and rescheduling',
				)
				clearTimeout(this.timerTimeout)
				this.timerTimeout = null
			} else {
				return
			}
		}

		const now = Date.now()
		const delay = Math.max(0, this.expectedNextTick - now)

		// Если задержка слишком большая (больше 2 секунд), значит что-то пошло не так
		// В этом случае сбрасываем ожидаемое время
		if (delay > 2000) {
			console.warn(
				`[GameController] scheduleNextTick: large delay detected: ${delay}ms, resetting timer`,
			)
			this.expectedNextTick = now + 1000
		}

		this.timerTimeout = window.setTimeout(
			() => {
				this.timerTimeout = null // Очищаем перед вызовом tick
				this.tick()
			},
			Math.max(0, this.expectedNextTick - Date.now()),
		)
	}

	private tick(): void {
		if (this.store.isGameOver) {
			// Если игра завершена, останавливаем таймер
			if (this.timerTimeout !== null) {
				clearTimeout(this.timerTimeout)
				this.timerTimeout = null
			}
			return
		}

		// Если игра заблокирована, планируем следующий тик без обновления времени
		// Это позволяет таймеру продолжать работать и возобновиться после разблокировки
		if (this.store.isLocked) {
			const now = Date.now()
			// Планируем следующий тик через 1 секунду от текущего момента
			// Это гарантирует, что таймер продолжит работать даже при длительной блокировке
			this.expectedNextTick = now + 1000
			this.scheduleNextTick()
			return
		}

		const now = Date.now()

		// Всегда вычитаем ровно 1 секунду для точности
		// Это гарантирует, что таймер уменьшается равномерно
		const newTime = this.store.remainingTime - 1
		this.store.setRemainingTime(newTime)

		// Обновляем ожидаемое время следующего тика (ровно через 1 секунду от текущего момента)
		this.expectedNextTick = now + 1000

		if (newTime <= 0) {
			this.onWaveEnd()
		} else {
			// Планируем следующий тик
			this.scheduleNextTick()

			// Check game state between ticks (only if not locked to avoid concurrent checks)
			// КРИТИЧНО: Проверяем состояние только если кубиков <= 32 для оптимизации
			// Также ограничиваем частоту проверок - не чаще чем раз в STATE_CHECK_INTERVAL
			// Используем setTimeout чтобы не блокировать tick
			if (!this.store.isLocked) {
				const now = Date.now()
				const timeSinceLastCheck = now - this.lastStateCheckTime

				// Проверяем состояние только если прошло достаточно времени с последней проверки
				if (timeSinceLastCheck >= this.STATE_CHECK_INTERVAL) {
					setTimeout(() => {
						if (!this.store.isLocked && !this.store.isGameOver) {
							this.lastStateCheckTime = Date.now()
							// Pass current grid from store (will be re-read inside function)
							this.checkGameStateAsync(this.store.grid)
						}
					}, 100) // Small delay to ensure state is stable
				}
			}
		}
	}

	private async onWaveEnd(): Promise<void> {
		if (this.store.isLocked || this.store.isGameOver) return

		// Очищаем кэш при окончании волны
		this.lastHasMovesCheck = null

		if (this.comboTimer !== null) {
			clearTimeout(this.comboTimer)
			this.comboTimer = null
		}
		this.comboLevel = 0

		this.store.setLocked(true)

		const newWaveIndex = this.store.waveIndex + 1
		// Reset timer (длительность волны уменьшается с уровнем)
		this.store.setRemainingTime(this.store.getWaveDuration(newWaveIndex))

		// Spawn wave - это изменяет grid синхронно и создает события для анимации
		const grid = cloneGrid(this.store.grid)
		const result = spawnWave(
			grid,
			this.store.spawnRows,
			this.nextCubeId,
			this.store.currentLevel,
		)
		this.nextCubeId = result.nextId

		// КРИТИЧНО: Обновляем grid в store СРАЗУ после spawnWave
		// Это гарантирует, что grid содержит финальное состояние после всех операций
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
		// КРИТИЧНО: renderGrid вызывается с финальным grid, но исключает новые кубы
		// Это гарантирует, что существующие кубы отображаются в правильных позициях
		await this.renderer?.renderGrid(
			grid,
			this.nextCubeId,
			newCubeIds.size > 0 ? newCubeIds : undefined,
		)

		// КРИТИЧНО: НЕ разблокируем игру до завершения всех анимаций
		// Это гарантирует правильную последовательность: сначала все анимации завершаются, потом игра разблокируется
		// Play spawn sound (once per wave)
		AudioManager.playSpawn()

		// КРИТИЧНО: Обрабатываем события последовательно и ждем завершения всех анимаций
		// Правильный порядок событий: remove -> fall -> spawn -> fall (для новых кубов) -> remove -> fall (каскад)
		if (this.renderer && result.events.length > 0) {
			// Ждем завершения всех анимаций перед разблокировкой игры
			await this.renderer.applyEvents(result.events)

			// Обновляем moves для новых плиток после завершения анимаций
			const newCubeIdsAfterAnim = new Set<number>()
			for (const event of result.events) {
				if (event.type === 'spawn') {
					for (const cell of event.cells) {
						newCubeIdsAfterAnim.add(cell.id)
					}
				}
			}

			// Находим кубы в grid по ID и обновляем их moves
			// После гравитации позиции могут измениться, поэтому ищем по всему grid
			for (let r = 0; r < grid.length; r++) {
				for (let c = 0; c < WIDTH; c++) {
					const cube = grid[r]?.[c]
					if (cube && newCubeIdsAfterAnim.has(cube.id) && cube.moves > 0) {
						this.renderer?.updateCubeMoves(cube.id, cube.moves)
					}
				}
			}

			// КРИТИЧНО: Синхронизируем позиции после всех анимаций
			// Это гарантирует, что все спрайты находятся в правильных позициях
			await this.renderer?.syncGridPositions(grid)
		}

		// КРИТИЧНО: Разблокируем игру ТОЛЬКО после завершения всех анимаций
		// Это гарантирует правильную последовательность операций
		this.store.setLocked(false)

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

		// Check game over
		if (result.gameOver) {
			this.store.setGameOver(true)
			// Play game over sound
			AudioManager.playGameOver()
		}

		// КРИТИЧНО: Перезапускаем таймер ПОСЛЕ разблокировки игры, чтобы избежать скачков
		// Таймер должен запуститься только если игра не завершена
		if (!result.gameOver) {
			this.restartTimer()
		}
	}

	async applyUserAction(
		action: 'swap' | 'slide',
		from: Position,
		to: Position,
	): Promise<void> {
		if (this.store.isLocked || this.store.isGameOver) return

		// Очищаем кэш проверки hasPossibleMoves при действии пользователя
		this.lastHasMovesCheck = null

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
				const cubeMoved = grid[to.r]?.[to.c] // бывший в from
				// Двигаемый: -1 обычно; -2 если блок с которым меняли не имел ходов
				if (cubeMoved) {
					const delta = replacedHadNoMoves ? 2 : 1
					cubeMoved.moves = Math.max(0, cubeMoved.moves - delta)
					if (this.renderer)
						this.renderer.updateCubeMoves(cubeMoved.id, cubeMoved.moves)
				}
				if (cubeReplaced) {
					cubeReplaced.moves = Math.max(0, cubeReplaced.moves - 1)
					if (this.renderer)
						this.renderer.updateCubeMoves(cubeReplaced.id, cubeReplaced.moves)
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
		// КРИТИЧНО: Применяем гравитацию до полного заполнения всех пустот
		if (action === 'slide' && success) {
			const fallItems = applyGravityUntilSettled(grid)
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
			const movedCubeFell = fallItems.some(
				(f) => f.from.r === to.r && f.from.c === to.c,
			)
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

		// Check game state: cubes finished or no moves
		await this.checkGameState(grid)

		this.store.setLocked(false)
	}

	/**
	 * Check game state: cubes finished or no moves left
	 * Called after resolveAfterMove (game is already locked)
	 */
	private async checkGameState(grid: (Cube | null)[][]): Promise<void> {
		if (this.store.isGameOver) return

		// Use current grid from store (may have changed since call)
		const currentGrid = this.store.grid
		if (!currentGrid || currentGrid.length === 0) return

		const isEmpty = isGridEmpty(currentGrid)
		const remainingTime = this.store.remainingTime

		// Case 1: Cubes finished and timer still running
		if (isEmpty && remainingTime > 0) {
			// Show "Great" message and add bonus
			const greatBonus = getGreatBonus(currentGrid)
			this.store.addScore(greatBonus)
			AudioManager.playClear()
			await this.renderer?.showGreatMessage(greatBonus)

			// Spawn new wave with half vessel height rows
			const halfHeight = Math.floor(this.store.getHeight() / 2)
			await this.spawnMidWave(currentGrid, halfHeight)
			return
		}

		// Case 2: Cubes finished (timer expired)
		if (isEmpty) {
			// Show "Great" message and add bonus
			const greatBonus = getGreatBonus(currentGrid)
			this.store.addScore(greatBonus)
			AudioManager.playClear()
			await this.renderer?.showGreatMessage(greatBonus)
			return
		}

		// Case 3: Cubes exist but no moves left
		// КРИТИЧНО: Проверяем наличие ходов только если кубиков <= 32 для оптимизации
		// Это предотвращает ненужные проверки когда кубиков много
		if (!isEmpty && remainingTime > 0) {
			// Подсчитываем количество кубиков
			const cubeCount = countCubes(currentGrid)

			// Проверяем наличие ходов только если кубиков <= 32
			// Если кубиков больше, значит игра еще активна и ходы точно есть
			if (cubeCount <= 32) {
				// Используем кэш для оптимизации
				const gridHash = this.getGridHash(currentGrid)
				let hasMoves: boolean

				if (
					this.lastHasMovesCheck &&
					this.lastHasMovesCheck.gridHash === gridHash
				) {
					hasMoves = this.lastHasMovesCheck.result
				} else {
					hasMoves = hasPossibleMoves(currentGrid)
					this.lastHasMovesCheck = { gridHash, result: hasMoves }
				}

				if (!hasMoves) {
					// Очищаем кэш перед спавном
					this.lastHasMovesCheck = null
					// Show "No moves" message and add bonus based on remaining time
					const noMovesBonus = getNoMovesBonus(remainingTime)
					this.store.addScore(noMovesBonus)
					await this.renderer?.showNoMovesMessage(noMovesBonus)
					// Spawn new wave with half vessel height rows
					const halfHeight = Math.floor(this.store.getHeight() / 2)
					await this.spawnMidWave(currentGrid, halfHeight)
					return
				}
			}
			// Если кубиков > 32, не проверяем наличие ходов - игра продолжается
		}
	}

	/**
	 * Async version for checking game state (called from tick)
	 * Doesn't lock the game, just checks and handles if needed
	 * КРИТИЧНО: Проверяет наличие ходов только если кубиков <= 32 для оптимизации
	 */
	private async checkGameStateAsync(grid: (Cube | null)[][]): Promise<void> {
		// Защита от проверки во время блокировки или завершения игры
		if (this.store.isLocked || this.store.isGameOver) return

		// Use current grid from store (may have changed since call)
		const currentGrid = this.store.grid
		if (!currentGrid || currentGrid.length === 0) return

		const isEmpty = isGridEmpty(currentGrid)
		const remainingTime = this.store.remainingTime

		// Case 1: Cubes finished and timer still running
		if (isEmpty && remainingTime > 0) {
			// Дополнительная проверка: убеждаемся что игра не заблокирована
			if (this.store.isLocked || this.store.isGameOver) return

			this.store.setLocked(true)
			try {
				// Show "Great" message and add bonus
				const greatBonus = getGreatBonus(currentGrid)
				this.store.addScore(greatBonus)
				await this.renderer?.showGreatMessage(greatBonus)
				AudioManager.playClear()

				// Spawn new wave with half vessel height rows
				const halfHeight = Math.floor(this.store.getHeight() / 2)
				await this.spawnMidWave(currentGrid, halfHeight)
			} finally {
				this.store.setLocked(false)
			}
			return
		}

		// Case 2: Cubes exist but no moves left
		// КРИТИЧНО: Проверяем наличие ходов только если кубиков <= 32 для оптимизации
		// Это предотвращает ненужные проверки когда кубиков много
		if (!isEmpty && remainingTime > 0) {
			// Подсчитываем количество кубиков
			const cubeCount = countCubes(currentGrid)

			// Оптимизация: если кубиков очень мало (меньше 8), скорее всего нет ходов
			// Но все равно проверяем, чтобы быть уверенными
			if (cubeCount <= 32) {
				// Оптимизация: используем простой хэш grid для кэширования проверки
				// Это позволяет избежать повторных проверок одного и того же состояния
				const gridHash = this.getGridHash(currentGrid)
				let hasMoves: boolean

				// Проверяем кэш
				if (
					this.lastHasMovesCheck &&
					this.lastHasMovesCheck.gridHash === gridHash
				) {
					hasMoves = this.lastHasMovesCheck.result
				} else {
					// Выполняем проверку только один раз
					hasMoves = hasPossibleMoves(currentGrid)
					this.lastHasMovesCheck = { gridHash, result: hasMoves }
				}

				if (!hasMoves) {
					// Перед блокировкой убеждаемся что игра не заблокирована
					if (this.store.isLocked || this.store.isGameOver) return

					// Очищаем кэш перед спавном (grid изменится)
					this.lastHasMovesCheck = null

					this.store.setLocked(true)
					try {
						// Show "No moves" message and add bonus based on remaining time
						const noMovesBonus = getNoMovesBonus(remainingTime)
						this.store.addScore(noMovesBonus)
						await this.renderer?.showNoMovesMessage(noMovesBonus)
						// Spawn new wave with half vessel height rows
						const halfHeight = Math.floor(this.store.getHeight() / 2)
						await this.spawnMidWave(currentGrid, halfHeight)
					} finally {
						this.store.setLocked(false)
					}
					return
				}
			}
			// Если кубиков > 32, не проверяем наличие ходов - игра продолжается
		}
	}

	/**
	 * Spawn mid-wave: spawn new cubes with specified number of rows
	 * Used when cubes finish or no moves left but timer still running
	 * Note: Game should already be locked when calling this
	 * ОПТИМИЗИРОВАНО: Разблокируем игру сразу после обновления grid, анимации продолжаются в фоне
	 */
	private async spawnMidWave(
		grid: (Cube | null)[][],
		spawnRows: number,
	): Promise<void> {
		if (this.store.isGameOver) return

		// Очищаем кэш перед спавном (grid изменится)
		this.lastHasMovesCheck = null

		// Spawn wave with specified number of rows
		// maxFilledRows ensures maximum filled rows equals half vessel height
		const result = spawnWave(
			grid,
			spawnRows,
			this.nextCubeId,
			this.store.currentLevel,
			spawnRows,
		)
		this.nextCubeId = result.nextId

		// Update grid
		this.store.setGrid(grid)

		// Оптимизация: собираем newCubeIds только один раз и используем для всех операций
		const newCubeIds = new Set<number>()
		for (const event of result.events) {
			if (event.type === 'spawn') {
				for (const cell of event.cells) {
					newCubeIds.add(cell.id)
				}
			}
		}

		// Re-render grid, excluding new cubes
		await this.renderer?.renderGrid(
			grid,
			this.nextCubeId,
			newCubeIds.size > 0 ? newCubeIds : undefined,
		)

		// КРИТИЧНО: Разблокируем игру СРАЗУ после обновления grid
		// Это позволяет пользователю двигать плитки даже во время анимации спавна
		// Анимации будут продолжаться в фоне без блокировки игры
		this.store.setLocked(false)

		// Play spawn sound
		AudioManager.playSpawn()

		// Animate spawn events (анимации продолжаются в фоне, игра уже разблокирована)
		if (this.renderer && result.events.length > 0) {
			// Запускаем анимации асинхронно, не блокируя игру
			this.renderer
				.applyEvents(result.events)
				.then(() => {
					// После завершения анимаций обновляем moves для новых кубиков
					for (const event of result.events) {
						if (event.type === 'spawn') {
							for (const cell of event.cells) {
								// Находим кубик в grid по ID (после гравитации позиция может измениться)
								for (let r = 0; r < grid.length; r++) {
									for (let c = 0; c < WIDTH; c++) {
										const cube = grid[r]?.[c]
										if (cube && cube.id === cell.id && cube.moves > 0) {
											this.renderer?.updateCubeMoves(cube.id, cube.moves)
											break
										}
									}
								}
							}
						}
					}
					// Sync positions after spawn animations
					this.renderer?.syncGridPositions(grid)
				})
				.catch((error) => {
					console.error('[GameController] spawnMidWave: animation error', error)
				})
		}

		// Check game over
		if (result.gameOver) {
			this.store.setGameOver(true)
			AudioManager.playGameOver()
		}

		// Обновляем таймер и waveIndex, чтобы избежать двойного спавна
		// Это нужно делать после спавна, чтобы таймер не истек и не вызвал onWaveEnd()
		const newWaveIndex = this.store.waveIndex + 1
		this.store.setWaveIndex(newWaveIndex)
		// Сбрасываем таймер на полную длительность новой волны
		this.store.setRemainingTime(this.store.getWaveDuration(newWaveIndex))
		// КРИТИЧНО: Перезапускаем таймер с новым временем, чтобы избежать скачков
		this.restartTimer()
		// Обновляем количество строк спавна для следующего уровня
		this.store.setSpawnRows(this.store.getSpawnRowsForLevel(newWaveIndex))
	}

	private restartTimer(): void {
		// Останавливаем текущий таймер
		if (this.timerTimeout !== null) {
			clearTimeout(this.timerTimeout)
			this.timerTimeout = null
		}
		// Перезапускаем с новым временем (принудительно, даже если игра заблокирована)
		const now = Date.now()
		this.timerStartTime = now
		this.expectedNextTick = now + 1000
		this.scheduleNextTick(true) // Принудительный запуск
	}

	/**
	 * Простой хэш grid для кэширования проверки hasPossibleMoves
	 * Использует только позиции и цвета кубиков с moves > 0
	 */
	private getGridHash(grid: (Cube | null)[][]): string {
		const h = grid.length
		const parts: string[] = []
		for (let r = 0; r < h; r++) {
			for (let c = 0; c < WIDTH; c++) {
				const cube = getCube(grid, r, c)
				if (cube && cube.moves > 0) {
					parts.push(`${r},${c}:${cube.color}:${cube.moves}`)
				}
			}
		}
		return parts.join('|')
	}

	stop(): void {
		if (this.timerTimeout !== null) {
			clearTimeout(this.timerTimeout)
			this.timerTimeout = null
		}
		if (this.comboTimer !== null) {
			clearTimeout(this.comboTimer)
			this.comboTimer = null
		}
		// Очищаем кэш при остановке
		this.lastHasMovesCheck = null
	}

	destroy(): void {
		this.stop()
		this.renderer?.destroy()
		this.renderer = null
	}
}
