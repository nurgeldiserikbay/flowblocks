/**
 * Find matches: 3+ same colors in row or column
 */

import type { Cube, Position } from './types'
import { getCube, WIDTH } from './grid'
import { MIN_BLOCKS_FOR_LINE_MATCH } from './matchConstants'

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
				if (lastColor !== null && c - start >= MIN_BLOCKS_FOR_LINE_MATCH) {
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
				if (lastColor !== null && r - start >= MIN_BLOCKS_FOR_LINE_MATCH) {
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
	const segmentTouchesMovedHorz = (
		r: number,
		start: number,
		end: number
	): boolean => {
		for (let i = start; i < end; i++) {
			if (movedSet.has(`${r},${i}`)) return true
		}
		return false
	}
	// Helper: does this segment [start, end) in column c contain any moved position?
	const segmentTouchesMovedVert = (
		c: number,
		start: number,
		end: number
	): boolean => {
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
				if (
					lastColor !== null &&
					c - start >= MIN_BLOCKS_FOR_LINE_MATCH &&
					segmentTouchesMovedHorz(r, start, c)
				) {
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
				if (
					lastColor !== null &&
					r - start >= MIN_BLOCKS_FOR_LINE_MATCH &&
					segmentTouchesMovedVert(c, start, r)
				) {
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

/**
 * Find matches that include BOTH new cubes AND existing cubes (by ID).
 * Used after spawn to only remove matches that involve both newly spawned cubes and existing cubes.
 * A match is counted only if:
 * 1. It touches the given positions (new cubes positions)
 * 2. At least one cube in the match has an ID in newCubeIds (new cube)
 * 3. At least one cube in the match has an ID in existingCubeIds (existing cube)
 *
 * КРИТИЧНО: Плитки должны исчезать только если они образовали пару из НОВЫХ и СУЩЕСТВУЮЩИХ плиток.
 * Плитки, которые образовали пару только из существующих плиток (до спавна) - НЕ должны исчезать.
 * Плитки, которые образовали пару только из новых плиток - НЕ должны исчезать.
 */
export function findMatchesIncludingNewCubes(
	grid: (Cube | null)[][],
	positions: Position[],
	newCubeIds: Set<number>,
	existingCubeIds?: Set<number>
): Position[] {
	const movedSet = new Set(positions.map((p) => `${p.r},${p.c}`))
	const matched = new Set<string>()
	const h = grid.length

	// Helper: does this segment [start, end) in row r contain any moved position?
	const segmentTouchesMovedHorz = (
		r: number,
		start: number,
		end: number
	): boolean => {
		for (let i = start; i < end; i++) {
			if (movedSet.has(`${r},${i}`)) return true
		}
		return false
	}
	// Helper: does this segment [start, end) in column c contain any moved position?
	const segmentTouchesMovedVert = (
		c: number,
		start: number,
		end: number
	): boolean => {
		for (let i = start; i < end; i++) {
			if (movedSet.has(`${i},${c}`)) return true
		}
		return false
	}

	// Helper: does this segment [start, end) in row r contain any new cube?
	const segmentContainsNewCubeHorz = (
		r: number,
		start: number,
		end: number
	): boolean => {
		for (let i = start; i < end; i++) {
			const cube = getCube(grid, r, i)
			if (cube && newCubeIds.has(cube.id)) return true
		}
		return false
	}
	// Helper: does this segment [start, end) in column c contain any new cube?
	const segmentContainsNewCubeVert = (
		c: number,
		start: number,
		end: number
	): boolean => {
		for (let i = start; i < end; i++) {
			const cube = getCube(grid, i, c)
			if (cube && newCubeIds.has(cube.id)) return true
		}
		return false
	}

	// Helper: does this segment [start, end) in row r contain any existing cube?
	const segmentContainsExistingCubeHorz = (
		r: number,
		start: number,
		end: number
	): boolean => {
		if (!existingCubeIds) return true // Если не переданы existingCubeIds, считаем что все существующие
		for (let i = start; i < end; i++) {
			const cube = getCube(grid, r, i)
			if (cube && existingCubeIds.has(cube.id)) return true
		}
		return false
	}
	// Helper: does this segment [start, end) in column c contain any existing cube?
	const segmentContainsExistingCubeVert = (
		c: number,
		start: number,
		end: number
	): boolean => {
		if (!existingCubeIds) return true // Если не переданы existingCubeIds, считаем что все существующие
		for (let i = start; i < end; i++) {
			const cube = getCube(grid, i, c)
			if (cube && existingCubeIds.has(cube.id)) return true
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
				// КРИТИЧНО: Match must touch moved positions AND include BOTH new AND existing cubes
				// Это гарантирует, что исчезают только пары из новых и существующих плиток
				if (
					lastColor !== null &&
					c - start >= MIN_BLOCKS_FOR_LINE_MATCH &&
					segmentTouchesMovedHorz(r, start, c) &&
					segmentContainsNewCubeHorz(r, start, c) &&
					segmentContainsExistingCubeHorz(r, start, c)
				) {
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
				// КРИТИЧНО: Match must touch moved positions AND include BOTH new AND existing cubes
				// Это гарантирует, что исчезают только пары из новых и существующих плиток
				if (
					lastColor !== null &&
					r - start >= MIN_BLOCKS_FOR_LINE_MATCH &&
					segmentTouchesMovedVert(c, start, r) &&
					segmentContainsNewCubeVert(c, start, r) &&
					segmentContainsExistingCubeVert(c, start, r)
				) {
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
