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
	checkMatchesAfterSpawn,
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
	private readonly isAndroidDevice = /Android/i.test(navigator.userAgent)
	/**
	 * Promise for the post-swap cascade chain (fall + remove + resolve).
	 * Runs after the swap animation completes while input is already unlocked.
	 * Any new applyUserAction awaits this before proceeding.
	 */
	private pendingChainPromise: Promise<void> | null = null

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
				'[GameController] init: PixiService not ready, attempting to load textures'
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
			this.store.currentLevel
		)
		this.nextCubeId = nextId
		this.store.setGrid(grid)

		// КРИТИЧНО: Обновляем размеры canvas после создания grid
		// Это особенно важно при возврате на страницу, когда canvas может быть инициализирован с неправильной высотой
		if (this.renderer) {
			const gridHeight = grid.length
			const canvas = this.renderer.getCanvas()
			if (canvas) {
				const canvasWidth =
					parseInt(canvas.style.width) ||
					canvas.getBoundingClientRect().width ||
					320
				const tileSize = canvasWidth / WIDTH
				const canvasHeight = gridHeight * tileSize

				// Обновляем CSS высоту canvas
				canvas.style.height = `${canvasHeight}px`

				// Обновляем размеры через renderer
				this.renderer.resizeCanvas(canvasWidth, canvasHeight, gridHeight)
			}
		}

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
					error
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
		await this.waitRendererFrames(this.isAndroidDevice ? 1 : 2)

		// 2. КРИТИЧНО: Скрываем loading overlay ПОСЛЕ того, как плитки видны, но ДО скролла
		// Это гарантирует правильный порядок: tiles visible → loading disappears → scroll → timer
		if (this.opts.onHideLoading) {
			this.store.setDiagnostic('loaderHidden', performance.now())
			this.opts.onHideLoading()
		}

		// 3. Запускаем анимацию скроллинга
		if (this.opts.onStartScrollAnimation) {
			try {
				this.store.setDiagnostic('scrollStarted', performance.now())
				await this.opts.onStartScrollAnimation()
			} catch (error) {
				console.error(
					'[GameController] bootGame: scroll animation failed',
					error
				)
				// Продолжаем выполнение даже если скролл не удался
			}
		} else {
			console.warn(
				'[GameController] bootGame: onStartScrollAnimation callback not provided'
			)
		}

		// 4. Запускаем таймер обратного отсчёта
		const timerStartTime = performance.now()
		this.store.setDiagnostic('timerStarted', timerStartTime)
		this.startTimer()

		// Логируем диагностику после завершения boot-цепочки
		// Loading уже скрыт на шаге 2, поэтому просто логируем
		this.store.logDiagnostics()

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
					'[GameController] scheduleNextTick: timer already scheduled, clearing and rescheduling'
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
				`[GameController] scheduleNextTick: large delay detected: ${delay}ms, resetting timer`
			)
			this.expectedNextTick = now + 1000
		}

		this.timerTimeout = window.setTimeout(() => {
			this.timerTimeout = null // Очищаем перед вызовом tick
			this.tick()
		}, Math.max(0, this.expectedNextTick - Date.now()))
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

		// Treat an active post-move chain the same as a lock so that onWaveEnd
		// is never triggered while fall/remove animations are still playing.
		if (this.store.isLocked || this.pendingChainPromise !== null) {
			const now = Date.now()
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
				const stateCheckInterval = this.isAndroidDevice
					? this.STATE_CHECK_INTERVAL + 1200
					: this.STATE_CHECK_INTERVAL

				// Проверяем состояние только если прошло достаточно времени с последней проверки
				if (timeSinceLastCheck >= stateCheckInterval) {
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
		// КРИТИЧНО: Проверка перед началом операции
		if (this.store.isLocked || this.store.isGameOver) return

		// Очищаем кэш при окончании волны
		this.lastHasMovesCheck = null

		if (this.comboTimer !== null) {
			clearTimeout(this.comboTimer)
			this.comboTimer = null
		}
		this.comboLevel = 0

		// КРИТИЧНО: Блокируем игру и используем try-finally для гарантированной разблокировки
		this.store.setLocked(true)

		try {
			const newWaveIndex = this.store.waveIndex + 1
			// Reset timer (длительность волны уменьшается с уровнем)
			this.store.setRemainingTime(this.store.getWaveDuration(newWaveIndex))

			// Spawn wave - это изменяет grid синхронно и создает события для анимации
			const grid = cloneGrid(this.store.grid)
			const result = spawnWave(
				grid,
				this.store.spawnRows,
				this.nextCubeId,
				this.store.currentLevel
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
				newCubeIds.size > 0 ? newCubeIds : undefined
			)

			// КРИТИЧНО: НЕ разблокируем игру до завершения всех анимаций
			// Это гарантирует правильную последовательность: сначала все анимации завершаются, потом игра разблокируется
			// Play spawn sound (once per wave)
			AudioManager.playSpawn()

			// КРИТИЧНО: Обрабатываем события последовательно и ждем завершения всех анимаций
			// Правильный порядок событий: fall (существующие) -> spawn -> fall (новые кубы) -> пауза -> remove (матчи) -> fall (каскад)
			let hasGameOver = false
			if (this.renderer && result.events.length > 0) {
				// ШАГ 1: Сначала собираем ID новых кубов из spawn событий
				const newCubeIds = new Set<number>()
				for (const event of result.events) {
					if (event.type === 'spawn') {
						for (const cell of event.cells) {
							newCubeIds.add(cell.id)
						}
					}
				}

				// ШАГ 2: Разделяем события на группы для правильной последовательности обработки
				const spawnEvents: GameEvent[] = []
				const newCubesFallEvents: GameEvent[] = []
				const otherEvents: GameEvent[] = []

				for (const event of result.events) {
					if (event.type === 'spawn') {
						spawnEvents.push(event)
					} else if (event.type === 'fall') {
						// Проверяем, является ли это fall для новых кубов
						const isNewCubesFall = event.items.some(
							(item) => item.id !== undefined && newCubeIds.has(item.id)
						)
						if (isNewCubesFall) {
							newCubesFallEvents.push(event)
						} else {
							otherEvents.push(event)
						}
					} else {
						otherEvents.push(event)
					}
				}

				// ШАГ 1.1: Обрабатываем другие события (fall для существующих кубов и т.д.)
				if (otherEvents.length > 0) {
					await this.renderer.applyEvents(otherEvents)
				}

				// ШАГ 1.2: Обрабатываем spawn события и ждем их завершения
				if (spawnEvents.length > 0) {
					await this.renderer.applyEvents(spawnEvents)
					await this.waitRendererFrames(1)
				}

				// ШАГ 1.3: КРИТИЧНО: Обрабатываем fall для новых кубов и ждем их полного завершения
				if (newCubesFallEvents.length > 0) {
					await this.renderer.applyEvents(newCubesFallEvents)
					await this.waitRendererFrames(this.isAndroidDevice ? 1 : 2)
				}

				// Обновляем moves для новых плиток после завершения всех анимаций
				const newCubeIdsAfterAnim = new Set<number>()
				for (const event of spawnEvents) {
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

				// КРИТИЧНО: Синхронизируем позиции после всех анимаций spawn и fall
				// Это гарантирует, что все спрайты находятся в правильных позициях перед проверкой матчей
				await this.renderer?.syncGridPositions(grid)

				// ШАГ 2: КРИТИЧНО: Пауза после завершения анимации падения новых блоков перед проверкой матчей
				// Это дает пользователю время понять, что произошло после спавна и падения
				// На Android уменьшаем задержку, чтобы игра ощущалась отзывчивее.
				const SPAWN_MATCH_CHECK_DELAY = this.isAndroidDevice ? 220 : 320
				await new Promise((resolve) =>
					setTimeout(resolve, SPAWN_MATCH_CHECK_DELAY)
				)

				// ШАГ 3: КРИТИЧНО: После завершения всех анимаций и паузы запускаем проверку матчей
				// Проверка матчей теперь происходит ПОСЛЕ завершения всех анимаций, чтобы пользователь
				// видел, как плитки установились правильно перед проверкой совпадений
				const matchEvents = checkMatchesAfterSpawn(
					grid,
					result.newCubeIds,
					result.existingCubeIds
				)
				// Обновляем grid после проверки матчей
				this.store.setGrid(grid)

				// Запускаем анимацию исчезновения плиток
				if (matchEvents.length > 0) {
					await this.renderer.applyEvents(matchEvents)

					// Синхронизируем позиции после проверки матчей
					await this.renderer?.syncGridPositions(grid)
				}

				// Check game over (проверяется в checkMatchesAfterSpawn и добавляется в matchEvents)
				hasGameOver = matchEvents.some((e) => e.type === 'gameover')
				if (hasGameOver) {
					this.store.setGameOver(true)
					AudioManager.playGameOver()
				}
			}

			this.store.setWaveIndex(newWaveIndex)
			// С ростом уровня растёт количество строк спавна (макс. 8)
			this.store.setSpawnRows(this.store.getSpawnRowsForLevel(newWaveIndex))

			// Расширение сосуда каждые 5 уровней для бесконечной игры
			if (!hasGameOver) {
				const newHeight = this.store.getHeightForLevel(newWaveIndex)
				if (newHeight > this.store.getHeight()) {
					expandGrid(grid, newHeight)
					this.store.setHeight(newHeight)
					// Явный вызов: переразмер канваса и скролл к низу (watch может не успеть / не сработать)
					await Promise.resolve(this.opts.onVesselExpanded?.())
				}
			}

			// Check game over (проверяется в matchEvents выше)
			// Не нужно проверять здесь, так как gameOver уже обработан в matchEvents

			// КРИТИЧНО: Перезапускаем таймер ПОСЛЕ разблокировки игры, чтобы избежать скачков
			// Таймер должен запуститься только если игра не завершена
			if (!hasGameOver) {
				this.restartTimer()
			}
		} catch (error) {
			console.error('[GameController] onWaveEnd: error during wave end', error)
			// В случае ошибки все равно разблокируем игру через finally
		} finally {
			// КРИТИЧНО: Гарантированная разблокировка игры в любом случае
			// Это предотвращает зависание игры при ошибках
			this.store.setLocked(false)
		}
	}

	async applyUserAction(
		action: 'swap' | 'slide',
		from: Position,
		to: Position
	): Promise<void> {
		// Wait for any ongoing post-move cascade chain before starting a new action.
		// This prevents grid state conflicts while keeping input visually responsive.
		if (this.pendingChainPromise) {
			await this.pendingChainPromise
		}

		if (this.store.isLocked || this.store.isGameOver) return

		// Clear hasPossibleMoves cache on user action
		this.lastHasMovesCheck = null

		this.store.setLocked(true)

		try {
			const grid = cloneGrid(this.store.grid)
			let success = false
			let moveEvent: GameEvent | null = null

			// Perform move
			if (action === 'swap') {
				const replacedHadNoMoves = (grid[to.r]?.[to.c]?.moves ?? 0) === 0
				success = trySwap(grid, from, to)
				if (success) {
					const cubeReplaced = grid[from.r]?.[from.c]
					const cubeMoved = grid[to.r]?.[to.c]
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
						cube.moves = Math.max(0, cube.moves - 1)
						if (this.renderer)
							this.renderer.updateCubeMoves(cube.id, cube.moves)
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

			if (!success || !moveEvent) return

			AudioManager.playMove()

			// Animate the swap/move — user sees blocks physically move (0.22s)
			if (this.renderer) {
				await this.renderer.applyEvents([moveEvent])
			}

			// Sync grid state after move animation
			this.store.setGrid(grid)

			// Unlock input immediately after the visual swap.
			// The cascade chain (gravity → match resolve → remove → fall) runs in the background.
			// The next applyUserAction will await pendingChainPromise before proceeding.
			this.store.setLocked(false)

			this.pendingChainPromise = this._postMoveChain(grid, action, from, to)
			this.pendingChainPromise
				.catch((err) => {
					console.error('[GameController] _postMoveChain error:', err)
				})
				.finally(() => {
					this.pendingChainPromise = null
				})
		} catch (error) {
			console.error('[GameController] applyUserAction: error during move', error)
		} finally {
			// Only unlock if we never reached the early-unlock above (e.g. early return / error)
			if (this.store.isLocked) {
				this.store.setLocked(false)
			}
		}
	}

	/**
	 * Runs the cascade chain after the swap/move animation completes.
	 * Executes while input is already unlocked so the player can queue the next move.
	 * The next applyUserAction awaits this promise before touching the grid.
	 */
	private async _postMoveChain(
		grid: (Cube | null)[][],
		action: 'swap' | 'slide',
		from: Position,
		to: Position
	): Promise<void> {
		if (!this.renderer) return

		let checkPositions: Position[] = [from, to]

		// For slide: apply gravity to fill the vacated cell
		if (action === 'slide') {
			const fallItems = applyGravityUntilSettled(grid)
			this.store.setGrid(grid)

			if (fallItems.length > 0 && this.renderer) {
				const fallEvent: GameEvent = { type: 'fall', items: fallItems }
				await this.renderer.applyEvents([fallEvent])
				await this.renderer.syncGridPositions(grid)
			}

			const movedCubeFell = fallItems.some(
				(f) => f.from.r === to.r && f.from.c === to.c
			)
			checkPositions = fallItems.map((f) => f.to)
			if (!movedCubeFell) checkPositions.push(to)
		}

		if (this.store.isGameOver) return

		// Resolve matches and cascades
		const resolveResult = resolveAfterMove(grid, checkPositions)
		this.store.setGrid(grid)

		// Enrich remove events with score
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
			ev.chainIndex = chainIndex
			this.store.addScore(baseScore + comboBonus)
		}

		if (this.renderer && resolveResult.events.length > 0) {
			await this.renderer.applyEvents(resolveResult.events)
			await this.renderer.syncGridPositions(grid)
		}

		if (this.store.isGameOver) return

		// Check vessel clear bonus
		if (isGridEmpty(grid)) {
			const clearBonus = getVesselClearBonus(grid)
			this.store.addScore(clearBonus)
			await this.renderer?.showGreatMessage(clearBonus)
			AudioManager.playClear()
		}

		// Check game state: cubes finished or no moves
		await this.checkGameState(grid)
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
	 * КРИТИЧНО ИСПРАВЛЕНО: Добавлена защита от race conditions с applyUserAction
	 */
	private async checkGameStateAsync(grid: (Cube | null)[][]): Promise<void> {
		// КРИТИЧНО: Защита от проверки во время блокировки или завершения игры
		// Проверяем дважды для предотвращения race conditions
		if (this.store.isLocked || this.store.isGameOver) return

		// Use current grid from store (may have changed since call)
		const currentGrid = this.store.grid
		if (!currentGrid || currentGrid.length === 0) return

		// КРИТИЧНО: Повторная проверка после чтения grid (может измениться)
		if (this.store.isLocked || this.store.isGameOver) return

		const isEmpty = isGridEmpty(currentGrid)
		const remainingTime = this.store.remainingTime

		// Case 1: Cubes finished and timer still running
		if (isEmpty && remainingTime > 0) {
			// КРИТИЧНО: Дополнительная проверка перед блокировкой
			// Предотвращает race conditions с applyUserAction
			if (this.store.isLocked || this.store.isGameOver) return

			// КРИТИЧНО: Используем атомарную проверку и блокировку
			// Если игра уже заблокирована, не продолжаем
			if (this.store.isLocked) return

			this.store.setLocked(true)
			try {
				// КРИТИЧНО: Повторная проверка после блокировки (может измениться состояние)
				if (this.store.isGameOver) return

				// Show "Great" message and add bonus
				const greatBonus = getGreatBonus(currentGrid)
				this.store.addScore(greatBonus)
				await this.renderer?.showGreatMessage(greatBonus)
				AudioManager.playClear()

				// Spawn new wave with half vessel height rows
				// КРИТИЧНО: spawnMidWave уже заблокирует игру, но мы используем try-finally для гарантии
				const halfHeight = Math.floor(this.store.getHeight() / 2)
				await this.spawnMidWave(currentGrid, halfHeight)
			} catch (error) {
				console.error(
					'[GameController] checkGameStateAsync: error in Case 1',
					error
				)
				// В случае ошибки разблокируем через finally
			} finally {
				// КРИТИЧНО: Гарантированная разблокировка
				// spawnMidWave также разблокирует игру, но это безопасно (idempотентно)
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
					// КРИТИЧНО: Повторная проверка перед блокировкой
					// Предотвращает race conditions с applyUserAction
					if (this.store.isLocked || this.store.isGameOver) return

					// КРИТИЧНО: Используем атомарную проверку и блокировку
					// Если игра уже заблокирована, не продолжаем
					if (this.store.isLocked) return

					// Очищаем кэш перед спавном (grid изменится)
					this.lastHasMovesCheck = null

					this.store.setLocked(true)
					try {
						// КРИТИЧНО: Повторная проверка после блокировки (может измениться состояние)
						if (this.store.isGameOver) return

						// Show "No moves" message and add bonus based on remaining time
						const noMovesBonus = getNoMovesBonus(remainingTime)
						this.store.addScore(noMovesBonus)
						await this.renderer?.showNoMovesMessage(noMovesBonus)
						// Spawn new wave with half vessel height rows
						// КРИТИЧНО: spawnMidWave уже заблокирует игру, но мы используем try-finally для гарантии
						const halfHeight = Math.floor(this.store.getHeight() / 2)
						await this.spawnMidWave(currentGrid, halfHeight)
					} catch (error) {
						console.error(
							'[GameController] checkGameStateAsync: error in Case 2',
							error
						)
						// В случае ошибки разблокируем через finally
					} finally {
						// КРИТИЧНО: Гарантированная разблокировка
						// spawnMidWave также разблокирует игру, но это безопасно (idempотентно)
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
	 * КРИТИЧНО ИСПРАВЛЕНО: Разблокируем игру ТОЛЬКО после завершения всех анимаций
	 * Это предотвращает race conditions и зависания игры
	 */
	private async spawnMidWave(
		grid: (Cube | null)[][],
		spawnRows: number
	): Promise<void> {
		if (this.store.isGameOver) {
			// Если игра завершена, разблокируем (на случай если была заблокирована)
			this.store.setLocked(false)
			return
		}

		// Очищаем кэш перед спавном (grid изменится)
		this.lastHasMovesCheck = null

		try {
			// Spawn wave with specified number of rows
			// maxFilledRows ensures maximum filled rows equals half vessel height
			const result = spawnWave(
				grid,
				spawnRows,
				this.nextCubeId,
				this.store.currentLevel,
				spawnRows
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
				newCubeIds.size > 0 ? newCubeIds : undefined
			)

			// Play spawn sound
			AudioManager.playSpawn()

			// КРИТИЧНО: Обрабатываем события последовательно и ждем завершения всех анимаций
			// Правильный порядок событий: spawn -> fall (новые кубы) -> пауза -> remove (матчи) -> fall (каскад)
			if (this.renderer && result.events.length > 0) {
				// ШАГ 1: Сначала собираем ID новых кубов из spawn событий
				const newCubeIds = new Set<number>()
				for (const event of result.events) {
					if (event.type === 'spawn') {
						for (const cell of event.cells) {
							newCubeIds.add(cell.id)
						}
					}
				}

				// ШАГ 2: Разделяем события на группы для правильной последовательности обработки
				const spawnEvents: GameEvent[] = []
				const newCubesFallEvents: GameEvent[] = []
				const otherEvents: GameEvent[] = []

				for (const event of result.events) {
					if (event.type === 'spawn') {
						spawnEvents.push(event)
					} else if (event.type === 'fall') {
						// Проверяем, является ли это fall для новых кубов
						const isNewCubesFall = event.items.some(
							(item) => item.id !== undefined && newCubeIds.has(item.id)
						)
						if (isNewCubesFall) {
							newCubesFallEvents.push(event)
						} else {
							otherEvents.push(event)
						}
					} else {
						otherEvents.push(event)
					}
				}

				// ШАГ 1.1: Обрабатываем другие события (если есть)
				if (otherEvents.length > 0) {
					await this.renderer.applyEvents(otherEvents)
				}

				// ШАГ 1.2: Обрабатываем spawn события и ждем их завершения
				if (spawnEvents.length > 0) {
					await this.renderer.applyEvents(spawnEvents)
					await this.waitRendererFrames(1)
				}

				// ШАГ 1.3: КРИТИЧНО: Обрабатываем fall для новых кубов и ждем их полного завершения
				if (newCubesFallEvents.length > 0) {
					await this.renderer.applyEvents(newCubesFallEvents)
					await this.waitRendererFrames(this.isAndroidDevice ? 1 : 2)
				}

				// Обновляем moves для новых плиток после завершения всех анимаций
				const newCubeIdsAfterAnim = new Set<number>()
				for (const event of spawnEvents) {
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

				// КРИТИЧНО: Синхронизируем позиции после всех анимаций spawn и fall
				// Это гарантирует, что все спрайты находятся в правильных позициях
				await this.renderer?.syncGridPositions(grid)

				// Check game over (проверяется в spawnWave)
				if (result.gameOver) {
					this.store.setGameOver(true)
					AudioManager.playGameOver()
				}
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
		} catch (error) {
			console.error('[GameController] spawnMidWave: error during spawn', error)
			// В случае ошибки все равно разблокируем игру, чтобы не зависнуть
		} finally {
			// КРИТИЧНО: Разблокируем игру ТОЛЬКО после завершения всех операций
			// Это гарантирует правильную последовательность: сначала все анимации завершаются, потом игра разблокируется
			this.store.setLocked(false)
		}
	}

	private async waitRendererFrames(frames: number): Promise<void> {
		if (frames <= 0) return

		for (let i = 0; i < frames; i++) {
			if (this.renderer && this.renderer.isInitialized()) {
				await this.renderer.waitForNextFrame()
			} else {
				await new Promise((resolve) => requestAnimationFrame(resolve))
			}
		}
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
		// Drop any pending chain reference (animations may still finish, but we ignore the result)
		this.pendingChainPromise = null
		this.lastHasMovesCheck = null
	}

	destroy(): void {
		this.stop()
		this.renderer?.destroy()
		this.renderer = null
	}
}
