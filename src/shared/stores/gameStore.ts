import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Cube } from '@/game/logic/types'
import { WIDTH } from '@/game/logic/grid'
const BASE_HEIGHT = 30
const BASE_WAVE_DURATION = 30
const MIN_WAVE_DURATION = 14 // Увеличено с 10 до 14 для более длительной игры
const WAVE_DURATION_DECREASE = 0.6 // Уменьшено с 1.5 до 0.6 для более плавного снижения
const NUM_COLORS = 8

/** Длительность волны в секундах: с ростом уровня уменьшается (мин. MIN_WAVE_DURATION) */
export function getWaveDuration(level: number): number {
	return Math.max(
		MIN_WAVE_DURATION,
		Math.floor(BASE_WAVE_DURATION - level * WAVE_DURATION_DECREASE),
	)
}

/** Строк спавна за волну: с ростом уровня растёт (макс. 10) - более плавный рост */
export function getSpawnRowsForLevel(level: number): number {
	// Изменено с level/2 на level/3 для более постепенного увеличения сложности
	return Math.min(10, 3 + Math.floor(level / 3))
}

/** Высота сосуда: каждые 5 уровней +4 ряда для бесконечной игры */
export function getHeightForLevel(level: number): number {
	return BASE_HEIGHT + 4 * Math.floor(level / 5)
}

/** Количество цветов: растет с уровнем от 5 до 8 */
export function getNumColorsForLevel(level: number): number {
	// Level 1-12: 5 colors
	// Level 13-25: 6 colors
	// Level 26-37: 7 colors
	// Level 38-50: 8 colors
	if (level <= 12) return 5
	if (level <= 25) return 6
	if (level <= 37) return 7
	return 8
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
		// Показываем рекламу каждые 3 игры (на 3-й, 6-й, 9-й и т.д.)
		return gamesPlayed.value > 0 && gamesPlayed.value % 3 === 0
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
		grid.value = newGrid
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
	}
})
