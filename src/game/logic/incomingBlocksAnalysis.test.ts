import { describe, it, expect } from 'vitest'
import type { Cube } from './types'
import { setCube, WIDTH } from './grid'
import { MIN_BLOCKS_FOR_LINE_MATCH } from './matchConstants'
import {
	analyzeIncomingBlocks,
	scanGridBlockStats,
	getColorsWithMinimumBlocks,
	isRefillForcedByCounts,
} from './incomingBlocksAnalysis'

function makeCube(id: number, color: number, moves: number): Cube {
	return { id, color, moves }
}

function emptyGrid(rows: number): (Cube | null)[][] {
	const g: (Cube | null)[][] = []
	for (let r = 0; r < rows; r++) {
		g[r] = Array(WIDTH).fill(null)
	}
	return g
}

describe('analyzeIncomingBlocks (только счётчики)', () => {
	it('всего плиток < MIN → модалка, TOTAL_BLOCKS_LT_3', () => {
		const grid = emptyGrid(2)
		setCube(grid, 1, 0, makeCube(1, 0, 9))
		setCube(grid, 1, 1, makeCube(2, 1, 9))
		const a = analyzeIncomingBlocks(grid)
		expect(a.shouldShowIncomingModal).toBe(true)
		expect(a.reason).toBe('TOTAL_BLOCKS_LT_3')
	})

	it('ни у одного цвета нет ≥ MIN плиток → NO_COLOR_WITH_MIN_COUNT', () => {
		const grid = emptyGrid(2)
		let id = 1
		for (let c = 0; c < 3; c++) {
			setCube(grid, 1, c * 2, makeCube(id++, c, 9))
			setCube(grid, 1, c * 2 + 1, makeCube(id++, c, 9))
		}
		const a = analyzeIncomingBlocks(grid)
		expect(a.shouldShowIncomingModal).toBe(true)
		expect(a.reason).toBe('NO_COLOR_WITH_MIN_COUNT')
	})

	it('есть цвет с ≥ MIN плиток → без модалки, COUNTS_OK', () => {
		const grid = emptyGrid(1)
		for (let c = 0; c < MIN_BLOCKS_FOR_LINE_MATCH; c++) {
			setCube(grid, 0, c, makeCube(c + 1, 0, 9))
		}
		const a = analyzeIncomingBlocks(grid)
		expect(a.shouldShowIncomingModal).toBe(false)
		expect(a.reason).toBe('COUNTS_OK')
		expect(a.colorsWithMinimumBlocks).toEqual([0])
	})

	it('пустая сетка → TOTAL_BLOCKS_LT_3', () => {
		const a = analyzeIncomingBlocks(emptyGrid(3))
		expect(a.shouldShowIncomingModal).toBe(true)
		expect(a.reason).toBe('TOTAL_BLOCKS_LT_3')
	})
})

describe('scanGridBlockStats & isRefillForcedByCounts', () => {
	it('один проход считает total и цвета', () => {
		const grid = emptyGrid(1)
		setCube(grid, 0, 0, makeCube(1, 0, 9))
		setCube(grid, 0, 1, makeCube(2, 0, 9))
		setCube(grid, 0, 2, makeCube(3, 1, 9))
		const { totalBlocks, countsByColor } = scanGridBlockStats(grid)
		expect(totalBlocks).toBe(3)
		expect(countsByColor.get(0)).toBe(2)
		expect(getColorsWithMinimumBlocks(countsByColor, 2)).toContain(0)
	})

	it('isRefillForcedByCounts совпадает с shouldShowIncomingModal', () => {
		const grid = emptyGrid(1)
		for (let c = 0; c < MIN_BLOCKS_FOR_LINE_MATCH; c++) {
			setCube(grid, 0, c, makeCube(c + 1, 0, 9))
		}
		expect(isRefillForcedByCounts(grid)).toBe(false)
	})
})
