/**
 * Move logic: swap and slide
 */

import type { Cube, Position } from './types'
import { getCube, isAdjacent, swapCubes, setCube, HEIGHT } from './grid'

export function trySwap(
	grid: (Cube | null)[][],
	a: Position,
	b: Position
): boolean {
	// Both positions must have cubes
	const cubeA = getCube(grid, a.r, a.c)
	const cubeB = getCube(grid, b.r, b.c)
	if (!cubeA || !cubeB) return false

	// Starting cube (a) must have moves > 0 (cannot start move from locked tile)
	if (cubeA.moves === 0) return false

	// Must be adjacent
	if (!isAdjacent(a, b)) return false

	// Swap
	swapCubes(grid, a, b)
	return true
}

export function trySlide(
	grid: (Cube | null)[][],
	from: Position,
	to: Position
): boolean {
	// From must have cube
	const cube = getCube(grid, from.r, from.c)
	if (!cube) return false

	// Starting cube must have moves > 0 (cannot start move from locked tile)
	if (cube.moves === 0) return false

	// To must be empty
	const targetCube = getCube(grid, to.r, to.c)
	if (targetCube) return false

	// Must be left or right neighbor
	const dr = to.r - from.r
	const dc = to.c - from.c
	if (dr !== 0 || Math.abs(dc) !== 1) return false

	// Perform slide (cube may fall after move, checked separately)
	const fromCube = getCube(grid, from.r, from.c)
	setCube(grid, from.r, from.c, null)
	setCube(grid, to.r, to.c, fromCube!)
	return true
}

export function isSupported(grid: (Cube | null)[][], r: number, c: number): boolean {
	// Floor supports everything
	if (r === HEIGHT - 1) return true

	// Check if there's a cube below
	const below = getCube(grid, r + 1, c)
	return below !== null
}
