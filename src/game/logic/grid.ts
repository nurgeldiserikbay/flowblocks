/**
 * Grid helper functions.
 * Высота определяется grid.length (сосуд может расти с уровнем).
 */

import type { Cube, Position } from './types'

const WIDTH = 8

export function getCube(
	grid: (Cube | null)[][],
	r: number,
	c: number
): Cube | null {
	if (r < 0 || r >= grid.length || c < 0 || c >= WIDTH) return null
	return grid[r]?.[c] ?? null
}

export function setCube(
	grid: (Cube | null)[][],
	r: number,
	c: number,
	cube: Cube | null
): void {
	if (r < 0 || r >= grid.length || c < 0 || c >= WIDTH) return
	if (!grid[r]) grid[r] = []
	grid[r][c] = cube
}

/** Добавить пустые ряды вниз сосуда (расширение для бесконечной игры) */
export function expandGrid(grid: (Cube | null)[][], newHeight: number): void {
	while (grid.length < newHeight) {
		grid.unshift(Array(WIDTH).fill(null))
	}
}

export function posToIdx(r: number, c: number): number {
	return r * WIDTH + c
}

export function idxToPos(idx: number): Position {
	return {
		r: Math.floor(idx / WIDTH),
		c: idx % WIDTH,
	}
}

export function cloneGrid(grid: (Cube | null)[][]): (Cube | null)[][] {
	return grid.map((row) => (row ? [...row] : []))
}

export function swapCubes(
	grid: (Cube | null)[][],
	a: Position,
	b: Position
): void {
	const cubeA = getCube(grid, a.r, a.c)
	const cubeB = getCube(grid, b.r, b.c)
	setCube(grid, a.r, a.c, cubeB)
	setCube(grid, b.r, b.c, cubeA)
}

export function isAdjacent(a: Position, b: Position): boolean {
	const dr = Math.abs(a.r - b.r)
	const dc = Math.abs(a.c - b.c)
	return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
}

export { WIDTH }
