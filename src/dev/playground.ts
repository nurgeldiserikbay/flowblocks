/**
 * Simple playground to test the game core logic
 * Run with: node --loader ts-node/esm src/dev/playground.ts
 * Or compile and run: tsx src/dev/playground.ts
 */

import type { GameConfig, GameAction } from '../features/game/core/types'
import { createGame, applyMove, getGameStats } from '../features/game/core/game'
import { getTile } from '../features/game/core/state'
import { isSwapLegal } from '../features/game/core/rules/swap'

// Simple random number generator for reproducibility (optional)
let seed = 12345
function rng(): number {
	seed = (seed * 9301 + 49297) % 233280
	return seed / 233280
}

function logAction(action: GameAction, step: number): void {
	// Logging removed
}

function printGrid(state: any, title: string = 'Grid'): void {
	// Printing removed
}

function getRandomMove(
	state: any,
): { fromX: number; fromY: number; toX: number; toY: number } | null {
	const { width, height } = state.config
	const directions = [
		{ dx: -1, dy: 0 }, // left
		{ dx: 1, dy: 0 }, // right
		{ dx: 0, dy: -1 }, // up
		{ dx: 0, dy: 1 }, // down
	]

	// Try random positions
	const attempts = width * height * 4
	for (let i = 0; i < attempts; i++) {
		const fromX = Math.floor(rng() * width)
		const fromY = Math.floor(rng() * height)
		const tile = getTile(state, fromX, fromY)

		if (!tile || tile.moves === 0) continue

		// Try random direction
		const dir = directions[Math.floor(rng() * directions.length)]
		const toX = fromX + dir.dx
		const toY = fromY + dir.dy

		if (toX >= 0 && toX < width && toY >= 0 && toY < height) {
			// Check if move is legal using proper swap rules
			if (isSwapLegal(state, fromX, fromY, toX, toY)) {
				return { fromX, fromY, toX, toY }
			}
		}
	}

	return null
}

function main(): void {
	// Create game config
	const config: GameConfig = {
		width: 8,
		height: 10,
		mode: 'endless',
		difficulty: 'normal',
		numColors: 5,
		// No initialGrid - will be generated
	}

	// Create game
	const game = createGame(config)

	printGrid(game, 'Initial Grid')

	const stats = getGameStats(game)

	// Make random moves
	const numMoves = 10

	let moveCount = 0
	for (let i = 0; i < numMoves && !game.isEnded; i++) {
		const move = getRandomMove(game)

		if (!move) {
			break
		}

		const fromTile = getTile(game, move.fromX, move.fromY)
		const toTile = getTile(game, move.toX, move.toY)

		const result = applyMove(
			game,
			move.fromX,
			move.fromY,
			move.toX,
			move.toY,
			rng,
		)

		if (!result.success) {
			continue
		}

		moveCount++
		let actionStep = 1

		// Log all actions
		for (const action of result.actions) {
			logAction(action, actionStep++)
		}

		// Print updated stats
		const newStats = getGameStats(game)

		// Print grid after move (optional, can be commented out for cleaner output)
		// printGrid(game, `Grid after move ${i + 1}`);

		if (game.isEnded) {
			break
		}
	}

	printGrid(game, 'Final Grid')

	const finalStats = getGameStats(game)

	if (game.isEnded) {
	}
}

// Run if executed directly
if (
	import.meta.url === `file://${process.argv[1]}` ||
	process.argv[1]?.includes('playground')
) {
	main()
}

export { main }
