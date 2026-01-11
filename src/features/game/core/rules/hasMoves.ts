import type { GameState, Vec2 } from '../types'
import { getTile, isValidPosition, cloneState } from '../state'
import { isSwapLegal } from './swap'
import { performSwap } from './swap'
import { findMatchesAround } from './match'

/**
 * Check if a swap would create a match
 * This simulates the swap and checks for matches
 */
function wouldCreateMatch(
	state: GameState,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number
): boolean {
	// Clone state to avoid modifying original
	const testState = cloneState(state)

	// Perform swap
	performSwap(testState, fromX, fromY, toX, toY)

	// Check for matches around swapped positions
	const matches = findMatchesAround(testState, [
		{ x: fromX, y: fromY },
		{ x: toX, y: toY },
	])

	return matches.size > 0
}

/**
 * Check if there are any possible moves that would create a match
 * A possible move is:
 * - Tile A has moves > 0
 * - Swap A->B is legal (cost can be paid)
 * - Swap would create a match
 */
export function hasAnyPossibleMove(state: GameState): boolean {
	const width = state.config.width
	const height = state.config.height
	const directions: Vec2[] = [
		{ x: -1, y: 0 }, // left
		{ x: 1, y: 0 }, // right
		{ x: 0, y: -1 }, // up
		{ x: 0, y: 1 }, // down
	]

	// Check every tile
	for (let x = 0; x < width; x++) {
		for (let y = 0; y < height; y++) {
			const tile = getTile(state, x, y)
			if (!tile || tile.moves === 0) {
				continue // Cannot start from this tile
			}

			// Check all 4 adjacent directions
			for (const dir of directions) {
				const toX = x + dir.x
				const toY = y + dir.y

				if (!isValidPosition(state, toX, toY)) {
					continue
				}

				// Check if swap is legal
				if (!isSwapLegal(state, x, y, toX, toY)) {
					continue
				}

				// Check if swap would create a match
				if (wouldCreateMatch(state, x, y, toX, toY)) {
					return true
				}
			}
		}
	}

	return false
}
