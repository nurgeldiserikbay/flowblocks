/**
 * Find matches: 3+ same colors in row or column
 */

import type { Cube, Position } from './types'
import { getCube, HEIGHT, WIDTH } from './grid'

export function findMatches(grid: (Cube | null)[][]): Position[] {
	const matched = new Set<string>()

	// Check horizontal matches
	for (let r = 0; r < HEIGHT; r++) {
		let start = 0
		let lastColor: number | null = null
		
		for (let c = 0; c <= WIDTH; c++) {
			const cube = c < WIDTH ? getCube(grid, r, c) : null
			const currentColor = cube ? cube.color : null

			if (currentColor !== lastColor) {
				// Check if previous segment was a match
				if (lastColor !== null && c - start >= 3) {
					// Add all positions in the matching segment
					for (let i = start; i < c; i++) {
						matched.add(`${r},${i}`)
					}
				}
				start = c
				lastColor = currentColor
			}
		}
	}

	// Check vertical matches
	for (let c = 0; c < WIDTH; c++) {
		let start = 0
		let lastColor: number | null = null
		
		for (let r = 0; r <= HEIGHT; r++) {
			const cube = r < HEIGHT ? getCube(grid, r, c) : null
			const currentColor = cube ? cube.color : null

			if (currentColor !== lastColor) {
				// Check if previous segment was a match
				if (lastColor !== null && r - start >= 3) {
					// Add all positions in the matching segment
					for (let i = start; i < r; i++) {
						matched.add(`${i},${c}`)
					}
				}
				start = r
				lastColor = currentColor
			}
		}
	}

	// Convert to positions
	return Array.from(matched).map((key) => {
		const [r, c] = key.split(',').map(Number)
		return { r, c }
	})
}
