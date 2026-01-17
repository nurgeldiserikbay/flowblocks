/**
 * Generate initial game grid
 */

import type { Cube } from './types'
import { HEIGHT, WIDTH, setCube } from './grid'

const NUM_COLORS = 6

export function createInitialGrid(nextId: number = 1): {
	grid: (Cube | null)[][]
	nextId: number
} {
	const grid: (Cube | null)[][] = []

	// Fill bottom half (rows H/2..H-1) with random cubes
	const startRow = Math.floor(HEIGHT / 2)
	for (let r = startRow; r < HEIGHT; r++) {
		grid[r] = []
		for (let c = 0; c < WIDTH; c++) {
			const color = Math.floor(Math.random() * NUM_COLORS)
			const moves = Math.floor(Math.random() * 20) + 1 // 1-20
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

export { NUM_COLORS }
