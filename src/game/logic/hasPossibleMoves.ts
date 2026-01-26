/**
 * Check if there are any possible moves that can create matches
 */

import type { Cube, Position } from './types'
import { getCube, WIDTH, isAdjacent, swapCubes } from './grid'
import { findMatches } from './matches'

/**
 * Check if swapping two cubes would create a match
 */
function wouldCreateMatchAfterSwap(
	grid: (Cube | null)[][],
	a: Position,
	b: Position
): boolean {
	// Clone grid to test swap
	const testGrid = grid.map((row) => (row ? [...row] : []))
	
	// Perform swap
	const cubeA = getCube(testGrid, a.r, a.c)
	const cubeB = getCube(testGrid, b.r, b.c)
	if (!cubeA || !cubeB) return false
	
	testGrid[a.r][a.c] = cubeB
	testGrid[b.r][b.c] = cubeA
	
	// Check for matches
	const matches = findMatches(testGrid)
	return matches.length > 0
}

/**
 * Check if sliding a cube would create a match
 */
function wouldCreateMatchAfterSlide(
	grid: (Cube | null)[][],
	from: Position,
	to: Position
): boolean {
	// Clone grid to test slide
	const testGrid = grid.map((row) => (row ? [...row] : []))
	
	const cube = getCube(testGrid, from.r, from.c)
	if (!cube) return false
	
	// Perform slide
	testGrid[from.r][from.c] = null
	testGrid[to.r][to.c] = cube
	
	// Check for matches
	const matches = findMatches(testGrid)
	return matches.length > 0
}

/**
 * Check if there are any possible moves that can create matches
 * A possible move is:
 * - Swap: cube A has moves > 0, swap with adjacent cube B, creates match
 * - Slide: cube A has moves > 0, slide to adjacent empty cell, creates match
 */
export function hasPossibleMoves(grid: (Cube | null)[][]): boolean {
	const h = grid.length
	const directions: Position[] = [
		{ r: 0, c: -1 }, // left
		{ r: 0, c: 1 },  // right
		{ r: -1, c: 0 }, // up
		{ r: 1, c: 0 },  // down
	]

	// Check every cube for possible moves
	for (let r = 0; r < h; r++) {
		for (let c = 0; c < WIDTH; c++) {
			const cube = getCube(grid, r, c)
			if (!cube || cube.moves === 0) {
				continue // Cannot start move from this cube
			}

			// Check all 4 adjacent directions
			for (const dir of directions) {
				const toR = r + dir.r
				const toC = c + dir.c

				// Check bounds
				if (toR < 0 || toR >= h || toC < 0 || toC >= WIDTH) {
					continue
				}

				const from: Position = { r, c }
				const to: Position = { r: toR, c: toC }
				const targetCube = getCube(grid, toR, toC)

				// Try swap if target has a cube
				if (targetCube && isAdjacent(from, to)) {
					if (wouldCreateMatchAfterSwap(grid, from, to)) {
						return true
					}
				}

				// Try slide if target is empty and horizontally adjacent
				if (!targetCube && dir.r === 0 && Math.abs(dir.c) === 1) {
					if (wouldCreateMatchAfterSlide(grid, from, to)) {
						return true
					}
				}
			}
		}
	}

	return false
}

/**
 * Check if grid is empty (no cubes)
 */
export function isGridEmpty(grid: (Cube | null)[][]): boolean {
	for (let r = 0; r < grid.length; r++) {
		for (let c = 0; c < WIDTH; c++) {
			if (getCube(grid, r, c) !== null) {
				return false
			}
		}
	}
	return true
}
