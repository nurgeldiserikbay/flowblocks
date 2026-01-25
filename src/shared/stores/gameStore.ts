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
	const isTilesAdded = ref(false)
	const isFirstFrameRendered = ref(false)
	const isGameStarted = ref(false)

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
		isTilesAdded.value = false
		isFirstFrameRendered.value = false
		isGameStarted.value = false
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
		isTilesAdded,
		isFirstFrameRendered,
		isGameStarted,
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
		getWaveDuration,
		getSpawnRowsForLevel,
		getHeightForLevel,
	}
})
