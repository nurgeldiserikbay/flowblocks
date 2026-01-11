import type { GameState } from '../types'
import { getTile, setTile } from '../state'

/**
 * Calculate move cost based on target tile
 * - If target has moves == 0 => cost = 2
 * - Else cost = 1
 */
export function calculateMoveCost(
	state: GameState,
	targetX: number,
	targetY: number
): number {
	const target = getTile(state, targetX, targetY)
	if (!target) return 1 // empty cell, default cost 1
	return target.moves === 0 ? 2 : 1
}

/**
 * Check if a swap is legal
 * Rules:
 * 1. Source tile must have moves > 0
 * 2. Target must be adjacent (4-neighborhood)
 * 3. Cost must be payable (source.moves >= cost OR source.moves == 1 && cost == 2)
 */
export function isSwapLegal(
	state: GameState,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number
): boolean {
	const source = getTile(state, fromX, fromY)
	if (!source) return false

	// Rule 1: Source must have moves > 0
	if (source.moves === 0) return false

	// Rule 2: Target must be adjacent (4-neighborhood)
	const dx = Math.abs(toX - fromX)
	const dy = Math.abs(toY - fromY)
	if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
		// Adjacent
	} else {
		return false
	}

	// Rule 3: Check if cost is payable
	const cost = calculateMoveCost(state, toX, toY)
	if (source.moves >= cost) return true
	if (source.moves === 1 && cost === 2) return true // Special case: allowed to go to 0

	return false
}

/**
 * Perform a swap between two adjacent tiles
 * Returns new state and cost paid
 * NOTE: Does NOT check if swap creates a match - that's handled by the main game loop
 */
export function performSwap(
	state: GameState,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number
): { newState: GameState; cost: number; aMovesAfter: number } {
	const source = getTile(state, fromX, fromY)
	const target = getTile(state, toX, toY)

	if (!source) {
		throw new Error('Cannot swap from empty cell')
	}

	const cost = calculateMoveCost(state, toX, toY)
	const newMoves = Math.max(0, source.moves - cost)
	const newSource = { ...source, moves: newMoves }

	// Perform swap
	setTile(state, fromX, fromY, target)
	setTile(state, toX, toY, newSource)

	return {
		newState: state,
		cost,
		aMovesAfter: newMoves,
	}
}
