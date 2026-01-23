/**
 * Spawn wave: shift down and fill top rows
 */

import type { Cube, GameEvent, SpawnResult } from './types'
import { WIDTH, getCube, setCube } from './grid'
import { applyGravityWithFallTracking } from './gravity'
import { findMatchesAround } from './matches'

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
	
	const h = grid.length
	// Find the topmost occupied row for each column (or h if column is empty)
	const topRows: number[] = []
	for (let c = 0; c < WIDTH; c++) {
		let topRow = h
		for (let r = 0; r < h; r++) {
			if (getCube(grid, r, c) !== null) {
				topRow = r
				break
			}
		}
		topRows[c] = topRow
	}

	// For each column, track which rows are already assigned to new cubes (to avoid overwriting)
	const usedRowsByCol: Map<number, Set<number>> = new Map()
	for (let c = 0; c < WIDTH; c++) {
		usedRowsByCol.set(c, new Set())
	}

	// Create new cubes — only in truly empty rows (never overwrite existing — avoids "changing colors")
	for (let spawnIndex = 0; spawnIndex < spawnRows; spawnIndex++) {
		for (let c = 0; c < WIDTH; c++) {
			// Desired row: above existing blocks. Can be negative when column is almost full.
			let targetRow = topRows[c] - spawnRows + spawnIndex
			const used = usedRowsByCol.get(c)!
			// If negative or already taken by another new cube, pick the next free *empty* row (0..topRows[c]-1)
			if (targetRow < 0 || used.has(targetRow)) {
				let found = false
				for (let r = 0; r < topRows[c]; r++) {
					if (!used.has(r)) {
						targetRow = r
						found = true
						break
					}
				}
				if (!found) continue // no empty row — skip this cube to avoid overwriting existing
			}
			used.add(targetRow)

			const color = Math.floor(Math.random() * NUM_COLORS)
			const moves = Math.floor(Math.random() * 9) + 1 // 1-9
			const cube: Cube = { id: nextId++, color, moves }
			const startRow = -spawnRows + spawnIndex
			newCubes.push({ cube, startRow, targetRow, c })
		}
	}

	// Create spawn event before place/gravity/resolve (for animation; id lets renderer find cube after its final position is known)
	if (newCubes.length > 0) {
		const spawnCells = newCubes.map(({ cube, startRow, targetRow, c }) => ({
			id: cube.id,
			r: targetRow,
			c,
			color: cube.color,
			fromRow: startRow,
			toRow: targetRow,
		}))
		events.push({ type: 'spawn', cells: spawnCells })
	}

	// Place new cubes at their target positions (after gravity calculation)
	// They will be animated falling from above
	for (const { cube, targetRow, c } of newCubes) {
		if (targetRow >= 0 && targetRow < h) {
			setCube(grid, targetRow, c, cube)
		}
	}

	// Gravity: settle everything; only matches that touch moved blocks are removed (like resolveAfterMove)
	const fallItems = applyGravityWithFallTracking(grid)
	let checkPositions = fallItems.map((f) => f.to)

	let hasChanges = true
	while (hasChanges) {
		const matches = findMatchesAround(grid, checkPositions)
		if (matches.length > 0) {
			for (const { r, c } of matches) {
				const cube = getCube(grid, r, c)
				if (cube) setCube(grid, r, c, null)
			}
			const nextFall = applyGravityWithFallTracking(grid)
			checkPositions = nextFall.map((f) => f.to)
			hasChanges = true
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
