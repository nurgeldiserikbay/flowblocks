/**
 * Resolve matches and gravity after a move
 *
 * Matches are removed only if they touch "moved" blocks:
 * - 1st iteration: blocks moved by the player (from, to)
 * - Cascade: blocks that fell in the previous step (landing positions)
 * Thus, pre-existing matches that were not affected by the move or by falls never disappear.
 */

import type { GameEvent, ResolveResult, Position } from './types'
import { getCube, setCube } from './grid'
import { applyGravityUntilSettled } from './gravity'
import { findMatchesAround } from './matches'

export function resolveAfterMove(
	grid: (Cube | null)[][],
	checkPositions?: Position[]
): ResolveResult {
	const events: GameEvent[] = []
	const removedCounts: number[] = []
	let chainCount = 0

	let hasChanges = true
	// Positions to consider "moved": 1st = player move; cascade = blocks that just fell
	let currentCheckPositions: Position[] = checkPositions ?? []

	// КРИТИЧНО: Защита от бесконечного цикла
	// Максимальное количество итераций каскада (разумный лимит для предотвращения зависания)
	const MAX_CASCADE_ITERATIONS = 100
	let iterations = 0

	while (hasChanges && iterations < MAX_CASCADE_ITERATIONS) {
		hasChanges = false
		iterations++

		// Only remove matches that touch moved blocks (player move or blocks that fell)
		const matches =
			currentCheckPositions.length > 0
				? findMatchesAround(grid, currentCheckPositions)
				: []

		if (matches.length > 0) {
			chainCount++
			const removeCells: Array<{
				r: number
				c: number
				color: number
				id: number
				moves: number
			}> = []

			for (const { r, c } of matches) {
				const cube = getCube(grid, r, c)
				if (cube) {
					removeCells.push({
						r,
						c,
						color: cube.color,
						id: cube.id,
						moves: cube.moves,
					})
					setCube(grid, r, c, null)
				}
			}

			removedCounts.push(removeCells.length)
			events.push({ type: 'remove', cells: removeCells })

			// КРИТИЧНО: Применяем гравитацию до полного заполнения всех пустот
			// Это гарантирует, что все кубы упадут до конца без пустых пространств
			const fallItems = applyGravityUntilSettled(grid)

			// Next cascade: only matches that touch blocks that just fell
			currentCheckPositions = fallItems.map((f) => f.to)

			if (fallItems.length > 0) {
				events.push({ type: 'fall', items: fallItems })
			}

			hasChanges = true
		}
	}

	// Предупреждение если достигнут лимит итераций
	if (iterations >= MAX_CASCADE_ITERATIONS && hasChanges) {
		console.warn(
			'[resolveAfterMove] Maximum cascade iterations reached, stopping to prevent infinite loop'
		)
	}

	return { events, chainCount, removedCounts }
}
