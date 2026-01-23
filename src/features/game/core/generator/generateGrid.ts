/**
 * Generate a random grid for the game
 * Tries to avoid immediate 3-matches at generation time
 */
export function generateGrid(
	width: number,
	height: number,
	numColors: number,
	movesRange: { min: number; max: number },
	rng: () => number = Math.random
): { colors: number[]; moves: number[] } {
	const colors: number[] = []
	const moves: number[] = []
	const grid: (number | null)[][] = []

	// Initialize grid
	for (let x = 0; x < width; x++) {
		grid[x] = []
		for (let y = 0; y < height; y++) {
			grid[x][y] = null
		}
	}

	// Helper to check if color would create immediate match
	function wouldCreateMatch(x: number, y: number, color: number): boolean {
		// Check horizontal
		let horizontalCount = 1
		for (let dx = -2; dx <= 2; dx++) {
			const nx = x + dx
			if (nx >= 0 && nx < width && nx !== x) {
				if (grid[nx][y] === color) {
					horizontalCount++
				} else {
					horizontalCount = 1
				}
				if (horizontalCount >= 3) return true
			}
		}

		// Check vertical
		let verticalCount = 1
		for (let dy = -2; dy <= 2; dy++) {
			const ny = y + dy
			if (ny >= 0 && ny < height && ny !== y) {
				if (grid[x][ny] === color) {
					verticalCount++
				} else {
					verticalCount = 1
				}
				if (verticalCount >= 3) return true
			}
		}

		return false
	}

	// Fill grid
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			// Try to find a color that doesn't create immediate match
			const candidates: number[] = []
			for (let c = 0; c < numColors; c++) {
				candidates.push(c)
			}

			// Filter out colors that would create matches
			const safeColors = candidates.filter((c) => !wouldCreateMatch(x, y, c))

			let color: number
			if (safeColors.length > 0) {
				color = safeColors[Math.floor(rng() * safeColors.length)]
			} else {
				// Fallback to random color if no safe option
				color = Math.floor(rng() * numColors)
			}

			grid[x][y] = color

			// Generate moves (with small chance for high moves 7-9)
			let tileMoves: number
			if (rng() < 0.05) {
				// 5% chance for high moves
				tileMoves = 7 + Math.floor(rng() * 3) // 7-9
			} else {
				tileMoves =
					movesRange.min +
					Math.floor(rng() * (movesRange.max - movesRange.min + 1))
			}
			tileMoves = Math.min(tileMoves, 9) // Cap at 9

			// Store in flat array (row-major: y * width + x)
			const idx = y * width + x
			colors[idx] = color
			moves[idx] = tileMoves
		}
	}

	return { colors, moves }
}
