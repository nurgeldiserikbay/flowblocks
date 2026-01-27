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
): Array<{ id: number; from: Position; to: Position; color: number }> {
	const fallItems: Array<{ id: number; from: Position; to: Position; color: number }> = []
	const h = grid.length

	for (let c = 0; c < WIDTH; c++) {
		// Step 1: Collect all cubes in this column with their original positions
		// We iterate bottom-to-top to preserve order
		const cubes: Array<{ cube: Cube; fromRow: number }> = []
		for (let r = h - 1; r >= 0; r--) {
			const cube = getCube(grid, r, c)
			if (cube) {
				cubes.push({ cube, fromRow: r })
			}
		}

		// Step 2: Clear the entire column
		// Ensure all rows exist before clearing
		for (let r = 0; r < h; r++) {
			if (!grid[r]) {
				grid[r] = []
			}
			setCube(grid, r, c, null)
		}

		// Step 3: Place cubes back from bottom to top
		// cubes[0] is the bottommost cube, cubes[1] is above it, etc.
		for (let i = 0; i < cubes.length; i++) {
			const targetRow = h - 1 - i
			const { cube, fromRow } = cubes[i]
			
			// Ensure target row exists
			if (!grid[targetRow]) {
				grid[targetRow] = []
			}
			
			setCube(grid, targetRow, c, cube)
			
			// Track fall if position changed
			if (fromRow !== targetRow) {
				fallItems.push({
					id: cube.id,
					from: { r: fromRow, c },
					to: { r: targetRow, c },
					color: cube.color,
				})
			}
		}
	}

	return fallItems
}

/**
 * Проверяет, есть ли пустые пространства под кубами (дыры)
 * Возвращает true, если есть кубы, которые должны упасть
 */
export function hasEmptySpaces(grid: (Cube | null)[][]): boolean {
	const h = grid.length
	for (let c = 0; c < WIDTH; c++) {
		for (let r = h - 2; r >= 0; r--) {
			const cubeAbove = getCube(grid, r, c)
			const cubeBelow = getCube(grid, r + 1, c)
			// Если есть куб выше и пусто ниже, есть пустое пространство
			if (cubeAbove !== null && cubeBelow === null) {
				return true
			}
		}
	}
	return false
}

/**
 * Применяет гравитацию до полного заполнения всех пустот
 * Возвращает все события падения
 */
export function applyGravityUntilSettled(
	grid: (Cube | null)[][]
): Array<{ id: number; from: Position; to: Position; color: number }> {
	const allFallItems: Array<{ id: number; from: Position; to: Position; color: number }> = []
	let maxIterations = 20 // Защита от бесконечного цикла
	
	while (hasEmptySpaces(grid) && maxIterations > 0) {
		const fallItems = applyGravityWithFallTracking(grid)
		allFallItems.push(...fallItems)
		maxIterations--
	}
	
	if (maxIterations === 0) {
		console.warn('[applyGravityUntilSettled] Gravity applied maximum iterations, may indicate a problem')
	}
	
	return allFallItems
}
