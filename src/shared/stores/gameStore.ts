import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Cube } from '@/game/logic/types'
import { WIDTH } from '@/game/logic/grid'
const BASE_HEIGHT = 30
const BASE_WAVE_DURATION = 30
const MIN_WAVE_DURATION = 10
const WAVE_DURATION_DECREASE = 1.5
const NUM_COLORS = 6

/** Длительность волны в секундах: с ростом уровня уменьшается (мин. MIN_WAVE_DURATION) */
export function getWaveDuration(level: number): number {
	return Math.max(MIN_WAVE_DURATION, Math.floor(BASE_WAVE_DURATION - level * WAVE_DURATION_DECREASE))
}

/** Строк спавна за волну: с ростом уровня растёт (макс. 8) */
export function getSpawnRowsForLevel(level: number): number {
	return Math.min(10, 4 + Math.floor(level / 2))
}

/** Высота сосуда: каждые 5 уровней +4 ряда для бесконечной игры */
export function getHeightForLevel(level: number): number {
	return BASE_HEIGHT + 4 * Math.floor(level / 5)
}

export const useGameStore = defineStore('game', () => {
	const grid = ref<(Cube | null)[][]>([])
	const score = ref(0)
	const waveIndex = ref(0)
	const remainingTime = ref(BASE_WAVE_DURATION)
	const spawnRows = ref(2)
	const height = ref(BASE_HEIGHT)
	const isLocked = ref(false)
	const isGameOver = ref(false)
	
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
	
	function setDiagnostic(key: keyof typeof diagnostics.value, timestamp: number) {
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
		
		console.log('[GameStore] Diagnostics (relative to assetsLoaded):', {
			assetsLoaded: '0.00ms (base)',
			texturesWarmed: formatTime(d.texturesWarmed),
			pixiInit: formatTime(d.pixiInit),
			tilesAdded: formatTime(d.tilesAdded),
			firstFrameRendered: formatTime(d.firstFrameRendered),
			loaderHidden: formatTime(d.loaderHidden),
			scrollStarted: formatTime(d.scrollStarted),
			timerStarted: formatTime(d.timerStarted),
		})
		
		// Дополнительная информация о критических интервалах
		// КРИТИЧНО: Скрываем loader только внутри этого условия
		if (d.firstFrameRendered && !d.loaderHidden) {
			// Плитки видны, но loader еще не скрыт - скрываем его сейчас
			if (onHideLoading) {
				setDiagnostic('loaderHidden', performance.now())
				onHideLoading()
			} else {
				console.warn('[GameStore] Critical: firstFrameRendered is set but loaderHidden is not - onHideLoading callback not provided!')
			}
		}
		
		if (d.firstFrameRendered && d.loaderHidden) {
			const tilesToLoader = d.loaderHidden - d.firstFrameRendered
			console.log('[GameStore] Critical interval:', {
				'tiles visible → loader hidden': `${tilesToLoader.toFixed(2)}ms`,
			})
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
		isLocked,
		isGameOver,
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
		setGrid,
		addScore,
		setWaveIndex,
		setRemainingTime,
		setSpawnRows,
		setHeight,
		getHeight,
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
		getWaveDuration,
		getSpawnRowsForLevel,
		getHeightForLevel,
	}
})
