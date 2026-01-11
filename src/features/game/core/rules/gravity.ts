import type { GameState, Vec2, GameAction } from '../types'
import { getTile, setTile } from '../state'

/**
 * Apply gravity to all columns - tiles fall down to fill gaps
 * Moves values do NOT change when a tile falls
 * Returns action list for renderer
 */
export function applyGravity(state: GameState): GameAction | null {
	const width = state.config.width
	const height = state.config.height
	const fallMoves: Array<{ id: number; from: Vec2; to: Vec2 }> = []

	// Process each column independently
	for (let x = 0; x < width; x++) {
		// Compact column: move all tiles down
		let writePos = height - 1 // Start from bottom

		for (let y = height - 1; y >= 0; y--) {
			const tile = getTile(state, x, y)
			if (tile !== null) {
				if (writePos !== y) {
					// Tile needs to fall
					fallMoves.push({
						id: tile.id,
						from: { x, y },
						to: { x, y: writePos },
					})
					// Move tile to new position
					setTile(state, x, writePos, tile)
					setTile(state, x, y, null)
				}
				writePos--
			}
		}
	}

	if (fallMoves.length === 0) {
		return null
	}

	return {
		type: 'fall',
		moves: fallMoves,
	}
}
