import type { GameState } from '../types'
import { findAllMatches } from '../rules/match'

/**
 * Validate that grid has no immediate matches
 */
export function validateGrid(state: GameState): boolean {
	const matches = findAllMatches(state)
	return matches.size === 0
}
