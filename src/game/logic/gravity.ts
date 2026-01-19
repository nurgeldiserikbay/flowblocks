/**
 * Gravity: cubes fall down until they land
 */

import type { Cube, Position } from './types'
import { getCube, setCube, WIDTH } from './grid'

export function applyGravity(grid: (Cube | null)[][]): void {
	const h = grid.length
	for (let c = 0; c < WIDTH; c++) {
		const cubes: Array<{ cube: Cube; fromRow: number }> = []
		for (let r = h - 1; r >= 0; r--) {
			const cube = getCube(grid, r, c)
			if (cube) cubes.push({ cube, fromRow: r })
		}
		for (let r = 0; r < h; r++) setCube(grid, r, c, null)
		for (let i = 0; i < cubes.length; i++) {
			setCube(grid, h - 1 - i, c, cubes[i].cube)
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
	const h = grid.length

	for (let c = 0; c < WIDTH; c++) {
		const cubes: Array<{ cube: Cube; fromRow: number }> = []
		for (let r = h - 1; r >= 0; r--) {
			const cube = getCube(grid, r, c)
			if (cube) cubes.push({ cube, fromRow: r })
		}
		for (let r = 0; r < h; r++) setCube(grid, r, c, null)
		for (let i = 0; i < cubes.length; i++) {
			const targetRow = h - 1 - i
			const { cube, fromRow } = cubes[i]
			setCube(grid, targetRow, c, cube)
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
