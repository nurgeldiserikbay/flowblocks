import type { GameState, Vec2, Tile, GameAction } from '../types'
import { getTile, setTile } from '../state'

/**
 * Get difficulty-based moves range for new tiles
 */
export function getMovesRange(difficulty: string): {
	min: number
	max: number
} {
	switch (difficulty) {
		case 'easy':
			return { min: 6, max: 12 }
		case 'normal':
			return { min: 4, max: 10 }
		case 'hard':
			return { min: 3, max: 8 }
		default:
			return { min: 4, max: 10 }
	}
}

/**
 * Generate a random color that doesn't create immediate 3-match at position
 * Tries to avoid creating matches with neighbors
 */
export function chooseSpawnColor(
	state: GameState,
	x: number,
	y: number,
	numColors: number,
	rng: () => number = Math.random
): number {
	const neighbors: number[] = []

	// Check neighbors (4-directional)
	const dirs = [
		{ dx: -1, dy: 0 },
		{ dx: 1, dy: 0 },
		{ dx: 0, dy: -1 },
		{ dx: 0, dy: 1 },
	]

	for (const dir of dirs) {
		const nx = x + dir.dx
		const ny = y + dir.dy
		const tile = getTile(state, nx, ny)
		if (tile) {
			neighbors.push(tile.color)
		}
	}

	// Try to find a color that doesn't create immediate 3-in-a-row
	const candidates: number[] = []
	for (let c = 0; c < numColors; c++) {
		candidates.push(c)
	}

	// Filter out colors that would create matches
	const safeColors = candidates.filter((color) => {
		// Check if this color would create a match
		// For simplicity, we check if we'd have 2 same colors in a row/column
		// This is a heuristic - perfect avoidance would require full match detection
		let horizontalCount = 1 // count current cell
		let verticalCount = 1

		// Check horizontal
		for (const dir of [
			{ dx: -1, dy: 0 },
			{ dx: 1, dy: 0 },
		]) {
			const nx = x + dir.dx
			const ny = y + dir.dy
			const tile = getTile(state, nx, ny)
			if (tile && tile.color === color) {
				horizontalCount++
			}
		}

		// Check vertical
		for (const dir of [
			{ dx: 0, dy: -1 },
			{ dx: 0, dy: 1 },
		]) {
			const nx = x + dir.dx
			const ny = y + dir.dy
			const tile = getTile(state, nx, ny)
			if (tile && tile.color === color) {
				verticalCount++
			}
		}

		// Safe if doesn't create 3-match in either direction
		return horizontalCount < 3 && verticalCount < 3
	})

	// Use safe colors if available, otherwise fall back to all colors
	const colorPool = safeColors.length > 0 ? safeColors : candidates
	return colorPool[Math.floor(rng() * colorPool.length)]
}

/**
 * Spawn new tiles in empty cells at the top (Endless Mode only)
 * Returns action list for renderer
 */
export function spawnNewTiles(
	state: GameState,
	rng: () => number = Math.random
): GameAction | null {
	// Only spawn in Endless Mode
	if (state.config.mode !== 'endless') {
		return null
	}

	const width = state.config.width
	const height = state.config.height
	const numColors = state.config.numColors
	const movesRange = getMovesRange(state.config.difficulty)

	const spawnItems: Array<{
		id: number
		to: Vec2
		color: number
		moves: number
	}> = []

	// Find empty cells at the top (scan from top to bottom)
	for (let x = 0; x < width; x++) {
		for (let y = 0; y < height; y++) {
			const tile = getTile(state, x, y)
			if (tile === null) {
				// Empty cell - spawn new tile
				const color = chooseSpawnColor(state, x, y, numColors, rng)

				// Random moves within range (with small chance for high moves 7-9)
				let moves: number
				if (rng() < 0.05) {
					// 5% chance for high moves
					moves = 7 + Math.floor(rng() * 3) // 7-9
				} else {
					moves =
						movesRange.min +
						Math.floor(rng() * (movesRange.max - movesRange.min + 1))
				}
				moves = Math.min(moves, 9) // Cap at 9

				const newTile: Tile = {
					id: state.nextId++,
					color,
					moves,
				}

				setTile(state, x, y, newTile)
				spawnItems.push({
					id: newTile.id,
					to: { x, y },
					color: newTile.color,
					moves: newTile.moves,
				})
			}
		}
	}

	if (spawnItems.length === 0) {
		return null
	}

	return {
		type: 'spawn',
		items: spawnItems,
	}
}
