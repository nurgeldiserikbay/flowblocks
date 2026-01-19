/**
 * Find matches: 3+ same colors in row or column
 */

import type { Cube, Position } from './types'
import { getCube, WIDTH } from './grid'

export function findMatches(grid: (Cube | null)[][]): Position[] {
	const matched = new Set<string>()
	const h = grid.length

	for (let r = 0; r < h; r++) {
		let start = 0
		let lastColor: number | null = null
		
		for (let c = 0; c <= WIDTH; c++) {
			const cube = c < WIDTH ? getCube(grid, r, c) : null
			const currentColor = cube ? cube.color : null

			if (currentColor !== lastColor) {
				// Check if previous segment was a match
				if (lastColor !== null && c - start >= 3) {
					// Add all positions in the matching segment
					for (let i = start; i < c; i++) {
						matched.add(`${r},${i}`)
					}
				}
				start = c
				lastColor = currentColor
			}
		}
	}

	for (let c = 0; c < WIDTH; c++) {
		let start = 0
		let lastColor: number | null = null
		for (let r = 0; r <= h; r++) {
			const cube = r < h ? getCube(grid, r, c) : null
			const currentColor = cube ? cube.color : null

			if (currentColor !== lastColor) {
				// Check if previous segment was a match
				if (lastColor !== null && r - start >= 3) {
					// Add all positions in the matching segment
					for (let i = start; i < r; i++) {
						matched.add(`${i},${c}`)
					}
				}
				start = r
				lastColor = currentColor
			}
		}
	}

	// Convert to positions
	return Array.from(matched).map((key) => {
		const [r, c] = key.split(',').map(Number)
		return { r, c }
	})
}

/**
 * Find matches only among those that touch the given (moved) positions.
 * A match (3+ same color in a row/column) is counted only if at least one
 * of its cells is in `positions` (the moved/swapped tiles).
 */
export function findMatchesAround(
	grid: (Cube | null)[][],
	positions: Position[]
): Position[] {
	const movedSet = new Set(positions.map((p) => `${p.r},${p.c}`))
	const matched = new Set<string>()
	const h = grid.length

	// Helper: does this segment [start, end) in row r contain any moved position?
	const segmentTouchesMovedHorz = (r: number, start: number, end: number): boolean => {
		for (let i = start; i < end; i++) {
			if (movedSet.has(`${r},${i}`)) return true
		}
		return false
	}
	// Helper: does this segment [start, end) in column c contain any moved position?
	const segmentTouchesMovedVert = (c: number, start: number, end: number): boolean => {
		for (let i = start; i < end; i++) {
			if (movedSet.has(`${i},${c}`)) return true
		}
		return false
	}

	const rowsToCheck = new Set(positions.map((p) => p.r))
	const colsToCheck = new Set(positions.map((p) => p.c))

	for (const r of rowsToCheck) {
		if (r < 0 || r >= h) continue

		let start = 0
		let lastColor: number | null = null

		for (let c = 0; c <= WIDTH; c++) {
			const cube = c < WIDTH ? getCube(grid, r, c) : null
			const currentColor = cube ? cube.color : null

			if (currentColor !== lastColor) {
				if (lastColor !== null && c - start >= 3 && segmentTouchesMovedHorz(r, start, c)) {
					for (let i = start; i < c; i++) {
						matched.add(`${r},${i}`)
					}
				}
				start = c
				lastColor = currentColor
			}
		}
	}

	for (const c of colsToCheck) {
		if (c < 0 || c >= WIDTH) continue
		let start = 0
		let lastColor: number | null = null
		for (let r = 0; r <= h; r++) {
			const cube = r < h ? getCube(grid, r, c) : null
			const currentColor = cube ? cube.color : null

			if (currentColor !== lastColor) {
				if (lastColor !== null && r - start >= 3 && segmentTouchesMovedVert(c, start, r)) {
					for (let i = start; i < r; i++) {
						matched.add(`${i},${c}`)
					}
				}
				start = r
				lastColor = currentColor
			}
		}
	}

	return Array.from(matched).map((key) => {
		const [r, c] = key.split(',').map(Number)
		return { r, c }
	})
}
