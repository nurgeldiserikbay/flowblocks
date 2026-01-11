import type { GameState } from '../types'
import { getComboMultiplier } from './combo'

/**
 * Calculate score for a removal event
 * base = n*n
 * energy = sum(removed.moves)
 * scoreAdd = round((base + 0.35*energy) * multiplier)
 */
export function calculateScore(
	numRemoved: number,
	totalMoves: number,
	combo: number
): number {
	const base = numRemoved * numRemoved
	const energy = 0.35 * totalMoves
	const multiplier = getComboMultiplier(combo)
	return Math.round((base + energy) * multiplier)
}

/**
 * Add score to game state and return score action
 */
export function addScore(
	state: GameState,
	numRemoved: number,
	totalMoves: number
): { add: number; total: number } {
	const scoreAdd = calculateScore(numRemoved, totalMoves, state.combo)
	state.score += scoreAdd
	return {
		add: scoreAdd,
		total: state.score,
	}
}
