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

	// Optimized helper to check if color would create immediate 3-match
	function wouldCreateMatch(x: number, y: number, color: number): boolean {
		// Check horizontal: count consecutive same colors left and right
		let leftCount = 0
		for (let dx = -1; dx >= -2; dx--) {
			const nx = x + dx
			if (nx >= 0 && grid[nx][y] === color) {
				leftCount++
			} else {
				break
			}
		}
		
		let rightCount = 0
		for (let dx = 1; dx <= 2; dx++) {
			const nx = x + dx
			if (nx < width && grid[nx][y] === color) {
				rightCount++
			} else {
				break
			}
		}
		
		// If we have 2+ same colors on either side, placing this color creates a match
		if (leftCount + rightCount >= 2) return true

		// Check vertical: count consecutive same colors up and down
		let upCount = 0
		for (let dy = -1; dy >= -2; dy--) {
			const ny = y + dy
			if (ny >= 0 && grid[x][ny] === color) {
				upCount++
			} else {
				break
			}
		}
		
		let downCount = 0
		for (let dy = 1; dy <= 2; dy++) {
			const ny = y + dy
			if (ny < height && grid[x][ny] === color) {
				downCount++
			} else {
				break
			}
		}
		
		// If we have 2+ same colors above or below, placing this color creates a match
		if (upCount + downCount >= 2) return true

		return false
	}

	// Fill grid
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			// Collect safe colors without creating candidates array
			const safeColors: number[] = []
			for (let c = 0; c < numColors; c++) {
				if (!wouldCreateMatch(x, y, c)) {
					safeColors.push(c)
				}
			}

			// Choose color from safe options or fallback to random
			const color =
				safeColors.length > 0
					? safeColors[Math.floor(rng() * safeColors.length)]
					: Math.floor(rng() * numColors)

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
