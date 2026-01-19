import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Cube } from '@/game/logic/types'

const WIDTH = 8
const HEIGHT = 20
const WAVE_DURATION = 12 // seconds
const NUM_COLORS = 6

export const useGameStore = defineStore('game', () => {
	const grid = ref<(Cube | null)[][]>([])
	const score = ref(0)
	const waveIndex = ref(0)
	const remainingTime = ref(WAVE_DURATION)
	const spawnRows = ref(2)
	const isLocked = ref(false)
	const isGameOver = ref(false)

	function reset() {
		grid.value = []
		score.value = 0
		waveIndex.value = 0
		remainingTime.value = WAVE_DURATION
		spawnRows.value = 2
		isLocked.value = false
		isGameOver.value = false
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
		isLocked,
		isGameOver,
		// Constants
		WIDTH,
		HEIGHT,
		WAVE_DURATION,
		NUM_COLORS,
		// Actions
		reset,
		setGrid,
		addScore,
		setWaveIndex,
		setRemainingTime,
		setSpawnRows,
		setLocked,
		setGameOver,
	}
})
