/**
 * Generate initial game grid
 */

import type { Cube } from './types'
import { WIDTH, setCube } from './grid'
import { getNumColorsForLevel, rollMovesForLevel } from '@/shared/stores/gameStore'

export function createInitialGrid(height: number, nextId: number = 1, level: number = 1): {
	grid: (Cube | null)[][]
	nextId: number
} {
	const grid: (Cube | null)[][] = []
	const numColors = getNumColorsForLevel(level)

	// Fill bottom half (rows H/2..H-1) with random cubes
	const startRow = Math.floor(height / 2)
	
	for (let r = startRow; r < height; r++) {
		grid[r] = []
		for (let c = 0; c < WIDTH; c++) {
			// Optimized: use bitwise OR for floor, faster than Math.floor
			const color = (Math.random() * numColors) | 0
			const moves = rollMovesForLevel(level)
			const cube: Cube = {
				id: nextId++,
				color,
				moves,
			}
			setCube(grid, r, c, cube)
		}
	}

	// Initialize empty top rows
	for (let r = 0; r < startRow; r++) {
		grid[r] = []
	}

	return { grid, nextId }
}
