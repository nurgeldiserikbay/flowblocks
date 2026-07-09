/**
 * Detect whether any legal swap or slide can start a removal chain.
 * Must mirror GameController.applyUserAction + _postMoveChain + resolveAfterMove:
 * matches count only if they touch cells affected by the move (findMatchesAround).
 */

import type { Cube, Position } from './types'
import { getCube, WIDTH, isAdjacent } from './grid'
import { trySwap, trySlide } from './moves'
import { applyGravityUntilSettled } from './gravity'
import { resolveAfterMove } from './resolver'

function deepCloneGrid(grid: (Cube | null)[][]): (Cube | null)[][] {
	return grid.map((row) =>
		row ? row.map((cell) => (cell ? { ...cell } : null)) : [],
	)
}

function resolveRemovesAnything(
	grid: (Cube | null)[][],
	checkPositions: Position[],
): boolean {
	const { events } = resolveAfterMove(grid, checkPositions)
	return events.some((e) => e.type === 'remove')
}

/**
 * Same swap cost rules as GameController.applyUserAction
 */
function applySwapCosts(
	grid: (Cube | null)[][],
	from: Position,
	to: Position,
	replacedHadNoMoves: boolean,
): void {
	const cubeMoved = getCube(grid, to.r, to.c)
	const cubeReplaced = getCube(grid, from.r, from.c)
	if (cubeMoved) {
		const delta = replacedHadNoMoves ? 2 : 1
		cubeMoved.moves = Math.max(0, cubeMoved.moves - delta)
	}
	if (cubeReplaced) {
		cubeReplaced.moves = Math.max(0, cubeReplaced.moves - 1)
	}
}

/**
 * True if some cube with moves > 0 can make a swap or slide that triggers
 * at least one removal under real game rules (including cascades).
 */
export function hasPossibleMoves(grid: (Cube | null)[][]): boolean {
	const h = grid.length
	const directions: Position[] = [
		{ r: 0, c: -1 },
		{ r: 0, c: 1 },
		{ r: -1, c: 0 },
		{ r: 1, c: 0 },
	]

	for (let r = 0; r < h; r++) {
		for (let c = 0; c < WIDTH; c++) {
			const cube = getCube(grid, r, c)
			if (!cube || cube.moves === 0) continue

			const from: Position = { r, c }

			for (const dir of directions) {
				const toR = r + dir.r
				const toC = c + dir.c
				if (toR < 0 || toR >= h || toC < 0 || toC >= WIDTH) continue

				const to: Position = { r: toR, c: toC }
				const targetCube = getCube(grid, toR, toC)

				if (targetCube && isAdjacent(from, to)) {
					const g = deepCloneGrid(grid)
					const replacedHadNoMoves = (g[toR]?.[toC]?.moves ?? 0) === 0
					if (!trySwap(g, from, to)) continue
					applySwapCosts(g, from, to, replacedHadNoMoves)
					if (resolveRemovesAnything(g, [from, to])) return true
				}

				if (!targetCube && dir.r === 0 && Math.abs(dir.c) === 1) {
					const g = deepCloneGrid(grid)
					if (!trySlide(g, from, to)) continue
					const slid = getCube(g, toR, toC)
					if (slid) slid.moves = Math.max(0, slid.moves - 1)

					const fallItems = applyGravityUntilSettled(g)
					const movedCubeFell = fallItems.some(
						(f) => f.from.r === toR && f.from.c === toC,
					)
					const checkPositions = fallItems.map((f) => f.to)
					if (!movedCubeFell) checkPositions.push(to)

					if (resolveRemovesAnything(g, checkPositions)) return true
				}
			}
		}
	}

	return false
}

/**
 * Count total number of cubes on the grid
 */
export function countCubes(grid: (Cube | null)[][]): number {
	let count = 0
	for (let r = 0; r < grid.length; r++) {
		for (let c = 0; c < WIDTH; c++) {
			if (getCube(grid, r, c) !== null) {
				count++
			}
		}
	}
	return count
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
