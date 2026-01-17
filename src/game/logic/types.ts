/**
 * Pure game logic types - no framework dependencies
 */

export type Cube = {
	id: number
	color: number // 0..NUM_COLORS-1
	moves: number // [0..20], количество возможных ходов
}

export type Position = {
	r: number // row (0 = top, HEIGHT-1 = bottom)
	c: number // column (0 = left, WIDTH-1 = right)
}

export type GameEvent =
	| {
			type: 'swap'
			a: Position
			b: Position
	  }
	| {
			type: 'move'
			from: Position
			to: Position
			color: number
			kind: 'slide'
	  }
	| {
			type: 'fall'
			items: Array<{
				from: Position
				to: Position
				color: number
			}>
	  }
	| {
			type: 'remove'
			cells: Array<{
				r: number
				c: number
				color: number
				id: number
			}>
	  }
	| {
			type: 'spawn'
			cells: Array<{
				r: number // target row
				c: number
				color: number
				fromRow?: number // starting row (above grid, negative)
				toRow?: number // target row
			}>
	  }
	| {
			type: 'gameover'
	  }

export type ResolveResult = {
	events: GameEvent[]
	chainCount: number
	removedCounts: number[] // counts per removal batch
}

export type SpawnResult = {
	events: GameEvent[]
	gameOver: boolean
}
