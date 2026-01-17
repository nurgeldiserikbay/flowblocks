/**
 * Spawn wave: shift down and fill top rows
 */

import type { Cube, GameEvent, SpawnResult } from './types'
import { HEIGHT, WIDTH, getCube, setCube } from './grid'
import { applyGravity } from './gravity'
import { findMatches } from './matches'

const NUM_COLORS = 6

export function spawnWave(
	grid: (Cube | null)[][],
	spawnRows: number,
	nextId: number
): SpawnResult {
	const events: GameEvent[] = []

	// Create new cubes that will fall from above
	// Existing cubes stay in place, new ones spawn above and fall
	const newCubes: Array<{ cube: Cube; startRow: number; targetRow: number; c: number }> = []
	
	// Find the topmost occupied row for each column (or HEIGHT if column is empty)
	const topRows: number[] = []
	for (let c = 0; c < WIDTH; c++) {
		let topRow = HEIGHT // Default: column is empty
		for (let r = 0; r < HEIGHT; r++) {
			if (getCube(grid, r, c) !== null) {
				topRow = r
				break
			}
		}
		topRows[c] = topRow
	}

	// Create new cubes that will spawn above and fall
	for (let spawnIndex = 0; spawnIndex < spawnRows; spawnIndex++) {
		for (let c = 0; c < WIDTH; c++) {
			const color = Math.floor(Math.random() * NUM_COLORS)
			const moves = Math.floor(Math.random() * 20) + 1 // 1-20
			const cube: Cube = {
				id: nextId++,
				color,
				moves,
			}
			
			// Calculate where cube should land
			// If column has cubes, place above them; otherwise place at top
			const targetRow = Math.max(0, topRows[c] - spawnRows + spawnIndex)
			
			// Start from above the grid (negative row for animation)
			const startRow = -spawnRows + spawnIndex
			
			newCubes.push({ cube, startRow, targetRow, c })
		}
	}

	// Create spawn event BEFORE placing cubes (for animation)
	if (newCubes.length > 0) {
		const spawnCells = newCubes.map(({ cube, startRow, targetRow, c }) => ({
			r: targetRow,
			c,
			color: cube.color,
			fromRow: startRow, // Starting position above grid
			toRow: targetRow, // Target position
		}))
		
		events.push({
			type: 'spawn',
			cells: spawnCells,
		})
	}

	// Place new cubes at their target positions (after gravity calculation)
	// They will be animated falling from above
	for (const { cube, targetRow, c } of newCubes) {
		if (targetRow >= 0 && targetRow < HEIGHT) {
			setCube(grid, targetRow, c, cube)
		}
	}

	// Apply gravity to settle everything (existing cubes may shift)
	applyGravity(grid)

	// Resolve any immediate matches after gravity
	let hasChanges = true
	while (hasChanges) {
		const matches = findMatches(grid)
		if (matches.length > 0) {
			const removeCells: Array<{ r: number; c: number; color: number; id: number }> = []
			for (const { r, c } of matches) {
				const cube = getCube(grid, r, c)
				if (cube) {
					removeCells.push({ r, c, color: cube.color, id: cube.id })
					setCube(grid, r, c, null)
				}
			}
			events.push({
				type: 'remove',
				cells: removeCells,
			})
			applyGravity(grid)
			hasChanges = matches.length > 0
		} else {
			hasChanges = false
		}
	}

	// Check game over: any cube in row 0 (top visible row)
	let gameOver = false
	for (let c = 0; c < WIDTH; c++) {
		if (getCube(grid, 0, c) !== null) {
			gameOver = true
			break
		}
	}

	if (gameOver) {
		events.push({ type: 'gameover' })
	}

	return { events, gameOver, nextId }
}
