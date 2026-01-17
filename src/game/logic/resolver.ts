/**
 * Resolve matches and gravity after a move
 */

import type { GameEvent, ResolveResult } from './types'
import { getCube, setCube } from './grid'
import { applyGravity } from './gravity'
import { findMatches } from './matches'

export function resolveAfterMove(
	grid: (Cube | null)[][]
): ResolveResult {
	const events: GameEvent[] = []
	const removedCounts: number[] = []
	let chainCount = 0

	let hasChanges = true
	while (hasChanges) {
		hasChanges = false

		// Find matches
		const matches = findMatches(grid)
		if (matches.length > 0) {
			chainCount++
			const removeCells: Array<{ r: number; c: number; color: number; id: number }> = []

			// Remove matched cubes and collect info
			for (const { r, c } of matches) {
				const cube = getCube(grid, r, c)
				if (cube) {
					removeCells.push({ r, c, color: cube.color, id: cube.id })
					setCube(grid, r, c, null)
				}
			}

			removedCounts.push(removeCells.length)

			// Add remove event
			events.push({
				type: 'remove',
				cells: removeCells,
			})

			// Apply gravity
			applyGravity(grid)

			// Collect fall events (simplified: just track what moved)
			const fallItems: Array<{ from: { r: number; c: number }; to: { r: number; c: number }; color: number }> = []
			// Note: In a full implementation, we'd track actual positions before/after gravity
			// For now, we'll generate fall events on the renderer side if needed

			if (fallItems.length > 0) {
				events.push({
					type: 'fall',
					items: fallItems,
				})
			}

			hasChanges = true
		}
	}

	return { events, chainCount, removedCounts }
}
