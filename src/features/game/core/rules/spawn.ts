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
 * Optimized version that checks neighbors efficiently
 */
export function chooseSpawnColor(
	state: GameState,
	x: number,
	y: number,
	numColors: number,
	rng: () => number = Math.random
): number {
	// Helper to check if color would create a match
	function wouldCreateMatch(color: number): boolean {
		// Check horizontal: count consecutive same colors left and right
		let leftCount = 0
		for (let dx = -1; dx >= -2; dx--) {
			const tile = getTile(state, x + dx, y)
			if (tile && tile.color === color) {
				leftCount++
			} else {
				break
			}
		}
		
		let rightCount = 0
		for (let dx = 1; dx <= 2; dx++) {
			const tile = getTile(state, x + dx, y)
			if (tile && tile.color === color) {
				rightCount++
			} else {
				break
			}
		}
		
		if (leftCount + rightCount >= 2) return true

		// Check vertical: count consecutive same colors up and down
		let upCount = 0
		for (let dy = -1; dy >= -2; dy--) {
			const tile = getTile(state, x, y + dy)
			if (tile && tile.color === color) {
				upCount++
			} else {
				break
			}
		}
		
		let downCount = 0
		for (let dy = 1; dy <= 2; dy++) {
			const tile = getTile(state, x, y + dy)
			if (tile && tile.color === color) {
				downCount++
			} else {
				break
			}
		}
		
		return upCount + downCount >= 2
	}

	// Collect safe colors directly without creating intermediate arrays
	const safeColors: number[] = []
	for (let c = 0; c < numColors; c++) {
		if (!wouldCreateMatch(c)) {
			safeColors.push(c)
		}
	}

	// Use safe colors if available, otherwise fall back to all colors
	const colorPool = safeColors.length > 0 ? safeColors : Array.from({ length: numColors }, (_, i) => i)
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

	// Pre-calculate moves range values to avoid repeated calculations
	const movesRangeSize = movesRange.max - movesRange.min + 1
	const highMovesChance = 0.05

	// Find empty cells - optimized: scan only until we find filled rows
	// In Endless Mode, empty cells are typically at the top
	for (let x = 0; x < width; x++) {
		let foundEmpty = false
		for (let y = 0; y < height; y++) {
			const tile = getTile(state, x, y)
			if (tile === null) {
				foundEmpty = true
				// Empty cell - spawn new tile
				const color = chooseSpawnColor(state, x, y, numColors, rng)

				// Random moves within range (with small chance for high moves 7-9)
				const moves = rng() < highMovesChance
					? 7 + Math.floor(rng() * 3) // 7-9
					: movesRange.min + Math.floor(rng() * movesRangeSize)
				const clampedMoves = Math.min(moves, 9) // Cap at 9

				const newTile: Tile = {
					id: state.nextId++,
					color,
					moves: clampedMoves,
				}

				setTile(state, x, y, newTile)
				spawnItems.push({
					id: newTile.id,
					to: { x, y },
					color: newTile.color,
					moves: newTile.moves,
				})
			} else if (foundEmpty) {
				// If we've already found empty cells in this column and now hit a filled cell,
				// we can break early (assuming empty cells are contiguous at top)
				break
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
