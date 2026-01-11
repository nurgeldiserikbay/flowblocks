import type { GameState, Vec2 } from '../types'
import { getTile } from '../state'

/**
 * Find all matches in the grid
 * Returns set of positions that are part of matches (>=3 same color in a line)
 */
export function findAllMatches(state: GameState): Set<string> {
	const matched = new Set<string>()
	const width = state.config.width
	const height = state.config.height

	// Check horizontal matches
	for (let y = 0; y < height; y++) {
		let streak = 1
		let lastColor: number | null = null
		let streakStart = 0

		for (let x = 0; x <= width; x++) {
			const tile = x < width ? getTile(state, x, y) : null
			const color = tile?.color ?? null

			if (color === lastColor && tile !== null) {
				streak++
			} else {
				if (streak >= 3 && lastColor !== null) {
					// Mark all tiles in this streak
					for (let i = streakStart; i < streakStart + streak; i++) {
						matched.add(`${i},${y}`)
					}
				}
				streak = tile ? 1 : 0
				streakStart = x
				lastColor = color
			}
		}
	}

	// Check vertical matches
	for (let x = 0; x < width; x++) {
		let streak = 1
		let lastColor: number | null = null
		let streakStart = 0

		for (let y = 0; y <= height; y++) {
			const tile = y < height ? getTile(state, x, y) : null
			const color = tile?.color ?? null

			if (color === lastColor && tile !== null) {
				streak++
			} else {
				if (streak >= 3 && lastColor !== null) {
					// Mark all tiles in this streak
					for (let i = streakStart; i < streakStart + streak; i++) {
						matched.add(`${x},${i}`)
					}
				}
				streak = tile ? 1 : 0
				streakStart = y
				lastColor = color
			}
		}
	}

	return matched
}

/**
 * Find matches around specific positions (optimized for post-swap detection)
 */
export function findMatchesAround(
	state: GameState,
	positions: Vec2[]
): Set<string> {
	const matched = new Set<string>()
	const width = state.config.width
	const height = state.config.height

	const rowsToCheck = new Set<number>()
	const colsToCheck = new Set<number>()

	// Collect rows and columns to check
	for (const pos of positions) {
		rowsToCheck.add(pos.y)
		colsToCheck.add(pos.x)
	}

	// Check horizontal matches in affected rows
	for (const y of rowsToCheck) {
		let streak = 1
		let lastColor: number | null = null
		let streakStart = 0

		for (let x = 0; x <= width; x++) {
			const tile = x < width ? getTile(state, x, y) : null
			const color = tile?.color ?? null

			if (color === lastColor && tile !== null) {
				streak++
			} else {
				if (streak >= 3 && lastColor !== null) {
					for (let i = streakStart; i < streakStart + streak; i++) {
						matched.add(`${i},${y}`)
					}
				}
				streak = tile ? 1 : 0
				streakStart = x
				lastColor = color
			}
		}
	}

	// Check vertical matches in affected columns
	for (const x of colsToCheck) {
		let streak = 1
		let lastColor: number | null = null
		let streakStart = 0

		for (let y = 0; y <= height; y++) {
			const tile = y < height ? getTile(state, x, y) : null
			const color = tile?.color ?? null

			if (color === lastColor && tile !== null) {
				streak++
			} else {
				if (streak >= 3 && lastColor !== null) {
					for (let i = streakStart; i < streakStart + streak; i++) {
						matched.add(`${x},${i}`)
					}
				}
				streak = tile ? 1 : 0
				streakStart = y
				lastColor = color
			}
		}
	}

	return matched
}

/**
 * Remove matched tiles from grid
 * Returns array of removed tile info: {id, position, moves}
 */
export function removeMatchedTiles(
	state: GameState,
	matched: Set<string>
): Array<{ id: number; position: Vec2; moves: number }> {
	const removed: Array<{ id: number; position: Vec2; moves: number }> = []

	for (const key of matched) {
		const [xStr, yStr] = key.split(',')
		const x = parseInt(xStr, 10)
		const y = parseInt(yStr, 10)

		const tile = getTile(state, x, y)
		if (tile) {
			removed.push({
				id: tile.id,
				position: { x, y },
				moves: tile.moves,
			})
			state.grid[x][y] = null
		}
	}

	return removed
}
