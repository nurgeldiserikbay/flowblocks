/**
 * Gravity: cubes fall down until they land
 */

import type { Cube, Position } from './types'
import { getCube, setCube, HEIGHT, WIDTH } from './grid'

export function applyGravity(grid: (Cube | null)[][]): void {
	// Process from bottom to top, column by column
	for (let c = 0; c < WIDTH; c++) {
		// Find all cubes in this column
		const cubes: Array<{ cube: Cube; fromRow: number }> = []
		for (let r = HEIGHT - 1; r >= 0; r--) {
			const cube = getCube(grid, r, c)
			if (cube) {
				cubes.push({ cube, fromRow: r })
			}
		}

		// Clear column
		for (let r = 0; r < HEIGHT; r++) {
			setCube(grid, r, c, null)
		}

		// Place cubes at bottom
		for (let i = 0; i < cubes.length; i++) {
			const targetRow = HEIGHT - 1 - i
			setCube(grid, targetRow, c, cubes[i].cube)
		}
	}
}

/**
 * Apply gravity with fall tracking - returns fall events for animation
 */
export function applyGravityWithFallTracking(
	grid: (Cube | null)[][]
): Array<{ from: Position; to: Position; color: number }> {
	const fallItems: Array<{ from: Position; to: Position; color: number }> = []

	// Process from bottom to top, column by column
	for (let c = 0; c < WIDTH; c++) {
		// Find all cubes in this column with their original positions
		const cubes: Array<{ cube: Cube; fromRow: number }> = []
		for (let r = HEIGHT - 1; r >= 0; r--) {
			const cube = getCube(grid, r, c)
			if (cube) {
				cubes.push({ cube, fromRow: r })
			}
		}

		// Clear column
		for (let r = 0; r < HEIGHT; r++) {
			setCube(grid, r, c, null)
		}

		// Place cubes at bottom and track falls
		for (let i = 0; i < cubes.length; i++) {
			const targetRow = HEIGHT - 1 - i
			const { cube, fromRow } = cubes[i]
			
			setCube(grid, targetRow, c, cube)
			
			// If position changed, create fall event
			if (fromRow !== targetRow) {
				fallItems.push({
					from: { r: fromRow, c },
					to: { r: targetRow, c },
					color: cube.color,
				})
			}
		}
	}

	return fallItems
}
