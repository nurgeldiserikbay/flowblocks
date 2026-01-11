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
	console.log(`\n[Step ${step}] Action: ${action.type}`)

	switch (action.type) {
		case 'swap':
			console.log(
				`  Swap: Tile ${action.aId} (${action.aFrom.x},${action.aFrom.y}) <-> Tile ${action.bId} (${action.bFrom.x},${action.bFrom.y})`
			)
			console.log(`  Cost: ${action.cost}, Moves after: ${action.aMovesAfter}`)
			break

		case 'remove':
			console.log(
				`  Removed ${action.ids.length} tiles:`,
				action.ids.slice(0, 5).join(', '),
				action.ids.length > 5 ? '...' : ''
			)
			console.log(
				`  Positions:`,
				action.positions
					.slice(0, 3)
					.map((p) => `(${p.x},${p.y})`)
					.join(', '),
				action.positions.length > 3 ? '...' : ''
			)
			break

		case 'fall':
			console.log(`  ${action.moves.length} tiles falling`)
			action.moves.slice(0, 3).forEach((m) => {
				console.log(
					`    Tile ${m.id}: (${m.from.x},${m.from.y}) -> (${m.to.x},${m.to.y})`
				)
			})
			if (action.moves.length > 3)
				console.log(`    ... and ${action.moves.length - 3} more`)
			break

		case 'spawn':
			console.log(`  Spawned ${action.items.length} new tiles`)
			action.items.slice(0, 3).forEach((item) => {
				console.log(
					`    Tile ${item.id}: color=${item.color}, moves=${item.moves} at (${item.to.x},${item.to.y})`
				)
			})
			if (action.items.length > 3)
				console.log(`    ... and ${action.items.length - 3} more`)
			break

		case 'score':
			console.log(
				`  Score: +${action.add} (Total: ${action.total}, Combo: ${action.combo})`
			)
			break

		case 'combo':
			console.log(
				`  Combo: ${action.combo} (ends at: ${new Date(
					action.endsAt
				).toISOString()})`
			)
			break

		case 'end':
			console.log(`  Game ended: ${action.reason}`)
			console.log(`  Final score: ${action.finalScore}`)
			console.log(
				`  Stats: time=${action.stats.timeMs}ms, tiles left=${action.stats.leftTiles}`
			)
			break
	}
}

function printGrid(state: any, title: string = 'Grid'): void {
	console.log(`\n${title}:`)
	const { width, height } = state.config

	// Print header
	process.stdout.write('    ')
	for (let x = 0; x < width; x++) {
		process.stdout.write(x.toString().padStart(3))
	}
	process.stdout.write('\n')

	// Print rows (top to bottom, y=0 is top)
	for (let y = 0; y < height; y++) {
		process.stdout.write(y.toString().padStart(3) + ' ')
		for (let x = 0; x < width; x++) {
			const tile = getTile(state, x, y)
			if (tile) {
				process.stdout.write(
					`${tile.color}${tile.moves.toString().padStart(2)}`.padStart(3)
				)
			} else {
				process.stdout.write(' . '.padStart(3))
			}
		}
		process.stdout.write('\n')
	}
}

function getRandomMove(
	state: any
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
	console.log('=== Game Core Playground ===\n')

	// Create game config
	const config: GameConfig = {
		width: 8,
		height: 10,
		mode: 'endless',
		difficulty: 'normal',
		numColors: 5,
		// No initialGrid - will be generated
	}

	console.log('Creating game with config:', {
		width: config.width,
		height: config.height,
		mode: config.mode,
		difficulty: config.difficulty,
		numColors: config.numColors,
	})

	// Create game
	const game = createGame(config)

	console.log('\nGame created!')
	printGrid(game, 'Initial Grid')

	const stats = getGameStats(game)
	console.log('\nInitial stats:', stats)

	// Make random moves
	const numMoves = 10
	console.log(`\n=== Making ${numMoves} random moves ===\n`)

	let moveCount = 0
	for (let i = 0; i < numMoves && !game.isEnded; i++) {
		const move = getRandomMove(game)

		if (!move) {
			console.log(`\n[Move ${i + 1}] No valid move found`)
			break
		}

		console.log(`\n${'='.repeat(60)}`)
		console.log(
			`Move ${i + 1}: (${move.fromX},${move.fromY}) -> (${move.toX},${
				move.toY
			})`
		)

		const fromTile = getTile(game, move.fromX, move.fromY)
		const toTile = getTile(game, move.toX, move.toY)
		console.log(
			`  From: Tile ${fromTile?.id}, color=${fromTile?.color}, moves=${fromTile?.moves}`
		)
		console.log(
			`  To: Tile ${toTile?.id}, color=${toTile?.color}, moves=${toTile?.moves}`
		)

		const result = applyMove(
			game,
			move.fromX,
			move.fromY,
			move.toX,
			move.toY,
			rng
		)

		if (!result.success) {
			console.log(`  Move failed!`)
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
		console.log(`\n  Updated stats:`, {
			score: newStats.score,
			combo: newStats.combo,
			tilesLeft: newStats.tilesLeft,
			isEnded: newStats.isEnded,
		})

		// Print grid after move (optional, can be commented out for cleaner output)
		// printGrid(game, `Grid after move ${i + 1}`);

		if (game.isEnded) {
			console.log('\n=== Game ended! ===')
			break
		}
	}

	console.log(`\n${'='.repeat(60)}`)
	console.log('=== Final Results ===')
	printGrid(game, 'Final Grid')

	const finalStats = getGameStats(game)
	console.log('\nFinal stats:', finalStats)
	console.log(`Moves made: ${moveCount}`)

	if (game.isEnded) {
		console.log(`\nGame ended: ${game.endReason}`)
		console.log(`Final score: ${game.finalScore}`)
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
