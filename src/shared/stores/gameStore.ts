import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Cube } from '@/game/logic/types'
import { WIDTH, cloneGrid } from '@/game/logic/grid'
const BASE_HEIGHT = 30
const BASE_WAVE_DURATION = 24
const MIN_WAVE_DURATION = 10
const WAVE_DURATION_DECREASE = 0.9
const NUM_COLORS = 8

/** Длительность волны в секундах: с ростом уровня уменьшается (мин. MIN_WAVE_DURATION) */
export function getWaveDuration(level: number): number {
	return Math.max(
		MIN_WAVE_DURATION,
		Math.floor(BASE_WAVE_DURATION - level * WAVE_DURATION_DECREASE),
	)
}

/** Строк спавна за волну: растут быстрее, чтобы держать сессию в 2-3 минуты */
export function getSpawnRowsForLevel(level: number): number {
	return Math.min(11, 4 + Math.floor(level / 2))
}

/** Высота сосуда: каждые 5 уровней +4 ряда для бесконечной игры */
export function getHeightForLevel(level: number): number {
	return BASE_HEIGHT + 4 * Math.floor(level / 5)
}

/** Количество цветов: растет с уровнем от 5 до 8 */
export function getNumColorsForLevel(level: number): number {
	if (level <= 6) return 5
	if (level <= 14) return 6
	if (level <= 24) return 7
	return 8
}

/**
 * Диапазон ходов у новых плиток:
 * в начале выше вариативность, дальше ниже среднее значение для роста давления.
 */
export function getMovesRangeForLevel(level: number): {
	min: number
	max: number
	highMovesChance: number
} {
	if (level <= 3) return { min: 3, max: 8, highMovesChance: 0.08 }
	if (level <= 8) return { min: 2, max: 7, highMovesChance: 0.05 }
	if (level <= 15) return { min: 2, max: 6, highMovesChance: 0.03 }
	return { min: 1, max: 5, highMovesChance: 0.02 }
}

export function rollMovesForLevel(
	level: number,
	rng: () => number = Math.random
): number {
	const { min, max, highMovesChance } = getMovesRangeForLevel(level)
	if (rng() < highMovesChance) {
		return 7 + Math.floor(rng() * 3) // 7..9 редкий "подарок" для вариативности
	}
	return min + Math.floor(rng() * (max - min + 1))
}

export const useGameStore = defineStore('game', () => {
	const grid = ref<(Cube | null)[][]>([])
	const score = ref(0)
	const waveIndex = ref(0)
	const remainingTime = ref(BASE_WAVE_DURATION)
	const spawnRows = ref(2)
	const height = ref(BASE_HEIGHT)
	const currentLevel = ref(1) // Текущий уровень (1-based)
	const isLocked = ref(false)
	const isGameOver = ref(false)
	const gamesPlayed = ref(0) // Счетчик запущенных игр для показа рекламы

	// Toast-сообщение во время игры (New blocks incoming!, Great! и т.д.)
	const gameMessageToast = ref<{ text: string; bonus: number } | null>(null)

	// Состояния готовности для правильного старта игры
	const isAssetsReady = ref(false)
	const isSceneReady = ref(false)
	const isTexturesWarmed = ref(false)
	const isTilesAdded = ref(false)
	const isFirstFrameRendered = ref(false)
	const isGameStarted = ref(false)

	// Диагностические метки времени для отслеживания задержек
	const diagnostics = ref<{
		assetsLoaded?: number
		texturesWarmed?: number
		pixiInit?: number
		tilesAdded?: number
		firstFrameRendered?: number
		loaderHidden?: number
		scrollStarted?: number
		timerStarted?: number
	}>({})

	function getHeight(): number {
		return height.value
	}

	function setHeight(h: number) {
		height.value = h
	}

	function reset() {
		grid.value = []
		score.value = 0
		waveIndex.value = 0
		remainingTime.value = getWaveDuration(0)
		spawnRows.value = getSpawnRowsForLevel(0)
		height.value = BASE_HEIGHT
		currentLevel.value = 1
		isLocked.value = false
		isGameOver.value = false
		gameMessageToast.value = null
		// Сбрасываем состояния готовности
		isAssetsReady.value = false
		isSceneReady.value = false
		isTexturesWarmed.value = false
		isTilesAdded.value = false
		isFirstFrameRendered.value = false
		isGameStarted.value = false
		diagnostics.value = {}
		// Не сбрасываем gamesPlayed - он должен сохраняться между играми
	}

	/**
	 * Полный сброс состояния игры как при самом первом запуске приложения.
	 * Используется при явном выходе из игры в меню.
	 */
	function resetHard() {
		reset()
		gamesPlayed.value = 0
	}

	function incrementGamesPlayed() {
		gamesPlayed.value++
	}

	function shouldShowInterstitial(): boolean {
		// Периодический показ: каждую 3-ю запущенную игру (3, 6, 9, ...)
		return gamesPlayed.value % 3 === 0 && gamesPlayed.value > 0
	}

	function setCurrentLevel(level: number) {
		currentLevel.value = level
	}

	function setAssetsReady(ready: boolean) {
		isAssetsReady.value = ready
	}

	function setSceneReady(ready: boolean) {
		isSceneReady.value = ready
	}

	function setTilesAdded(added: boolean) {
		isTilesAdded.value = added
	}

	function setFirstFrameRendered(rendered: boolean) {
		isFirstFrameRendered.value = rendered
	}

	function setGameStarted(started: boolean) {
		isGameStarted.value = started
	}

	function setTexturesWarmed(warmed: boolean) {
		isTexturesWarmed.value = warmed
	}

	function setDiagnostic(
		key: keyof typeof diagnostics.value,
		timestamp: number,
	) {
		diagnostics.value[key] = timestamp
	}

	function logDiagnostics(onHideLoading?: () => void) {
		const d = diagnostics.value
		const baseTime = d.assetsLoaded || 0

		if (!baseTime) {
			console.warn('[GameStore] Diagnostics: assetsLoaded timestamp not found')
			return
		}

		const formatTime = (timestamp?: number): string => {
			if (!timestamp) return 'N/A'
			const diff = timestamp - baseTime
			return `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}ms`
		}

		// Дополнительная информация о критических интервалах
		// ОБНОВЛЕНО: Loading теперь скрывается в GameController.bootGame() перед scroll
		// Этот код оставлен для обратной совместимости и fallback случаев
		if (d.firstFrameRendered && !d.loaderHidden) {
			// Плитки видны, но loader еще не скрыт - скрываем его сейчас (fallback)
			if (onHideLoading) {
				setDiagnostic('loaderHidden', performance.now())
				onHideLoading()
			} else {
				console.warn(
					'[GameStore] Warning: firstFrameRendered is set but loaderHidden is not - onHideLoading callback not provided!',
				)
			}
		}
	}

	function setGrid(newGrid: (Cube | null)[][]) {
		// КРИТИЧНО: Всегда создаём новую ссылку, чтобы Vue обнаружил изменение.
		// При мутации grid in-place и setGrid(grid) с той же ссылкой computed (topmostRow и т.д.)
		// могли не пересчитываться — особенно после исчезновения блоков или спавна.
		grid.value = cloneGrid(newGrid)
	}

	function addScore(points: number) {
		score.value += points
	}

	function setWaveIndex(index: number) {
		waveIndex.value = index
	}

	function setRemainingTime(time: number) {
		remainingTime.value = Math.max(0, time)
	}

	function setSpawnRows(rows: number) {
		spawnRows.value = rows
	}

	function setLocked(locked: boolean) {
		isLocked.value = locked
	}

	function setGameOver(over: boolean) {
		isGameOver.value = over
	}

	function setGameMessageToast(msg: { text: string; bonus: number } | null) {
		gameMessageToast.value = msg
	}

	return {
		// State
		grid,
		score,
		waveIndex,
		remainingTime,
		spawnRows,
		height,
		currentLevel,
		isLocked,
		isGameOver,
		gamesPlayed,
		gameMessageToast,
		setGameMessageToast,
		// Readiness states
		isAssetsReady,
		isSceneReady,
		isTexturesWarmed,
		isTilesAdded,
		isFirstFrameRendered,
		isGameStarted,
		diagnostics,
		// Constants
		WIDTH,
		BASE_HEIGHT,
		NUM_COLORS,
		// Actions
		reset,
		resetHard,
		setGrid,
		addScore,
		setWaveIndex,
		setRemainingTime,
		setSpawnRows,
		setHeight,
		getHeight,
		setCurrentLevel,
		setLocked,
		setGameOver,
		setAssetsReady,
		setSceneReady,
		setTilesAdded,
		setFirstFrameRendered,
		setGameStarted,
		setTexturesWarmed,
		setDiagnostic,
		logDiagnostics,
		incrementGamesPlayed,
		shouldShowInterstitial,
		getWaveDuration,
		getSpawnRowsForLevel,
		getHeightForLevel,
		getNumColorsForLevel,
		getMovesRangeForLevel,
		rollMovesForLevel,
	}
})
