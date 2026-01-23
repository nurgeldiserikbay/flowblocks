/**
 * Core game types - pure TypeScript, framework-agnostic
 *
 * Все типы должны быть чистыми, без зависимостей от PixiJS, Vue или других фреймворков.
 * Строго следует SPEC.md из .cursor/SPEC.md
 */

/**
 * 2D координата на игровом поле
 */
export type Vec2 = {
	x: number
	y: number
}

/**
 * Плитка (куб) на игровом поле
 *
 * SPEC §3: Each cell has id, color [0..C-1], moves [0..9]
 * Tile is "locked" when moves==0 (cannot be START of move)
 */
export type Tile = {
	id: number
	color: number // [0..C-1], где C - количество цветов
	moves: number // [0..9], locked когда moves == 0
}

/**
 * Режим игры
 *
 * SPEC §1: Two modes - Level Mode and Endless Mode
 */
export type GameMode = 'level' | 'endless'

/**
 * Сложность игры
 *
 * SPEC §11: Easy (C=4-5), Normal (C=6), Hard (C=7-8)
 */
export type Difficulty = 'easy' | 'normal' | 'hard'

/**
 * Конфигурация игры
 *
 * SPEC §2: Board is rectangular grid width W, height H
 * SPEC §12: Presets contain colors[] and moves[] arrays length W*H
 *
 * Примечание: config не изменяется после создания GameState
 */
export type GameConfig = {
	width: number // W - фиксированная ширина (рекомендуется 10 или 12)
	height: number // H - зависит от режима (Level Mode зависит от уровня, Endless фиксированная 40-60)
	mode: GameMode
	difficulty: Difficulty
	numColors: number // C - количество цветов (зависит от сложности, SPEC §11)
	initialGrid?: {
		colors: number[] // Массив цветов [0..C-1], длина W*H
		moves: number[] // Массив moves [0..9], длина W*H
	}
}

/**
 * Состояние игры
 *
 * Хранит всё состояние игровой сессии.
 * SPEC §9: Score, combo, time tracking
 * SPEC §10: Game end conditions
 *
 * Примечание: Внутри core функции могут мутировать это состояние для производительности.
 * Это допустимо, так как core изолирован и не имеет внешних side effects.
 */
export type GameState = {
	config: GameConfig // Конфигурация (не изменяется после создания)
	grid: (Tile | null)[][] // grid[x][y], width x height - мутабелен внутри core
	nextId: number // Следующий ID для генерации новых плиток
	score: number // Текущий счёт (SPEC §9)
	combo: number // Текущий комбо (SPEC §8)
	comboEndsAt: number // Timestamp когда комбо истечёт (milliseconds)
	startTime: number // Timestamp начала игры (milliseconds)
	elapsedTime: number // Прошедшее время (milliseconds, SPEC §9 - не влияет на счёт)
	initialTileCount: number // Начальное количество плиток (для finish bonus в Level Mode, SPEC §9)
	isEnded: boolean // Игра завершена?
	endReason?: 'cleared' | 'no_moves' // Причина окончания (SPEC §10)
	finalScore?: number // Финальный счёт с бонусами (для Level Mode, SPEC §9)
}

/**
 * Действие для рендерера
 *
 * SPEC §15: Action list contract (core -> renderer)
 * Renderer plays animations in order: swap -> remove -> fall -> spawn -> (repeat cascades) -> update HUD
 */
export type GameAction =
	| {
			type: 'swap'
			aId: number // ID плитки A (начало обмена)
			bId: number // ID плитки B (цель обмена)
			aFrom: Vec2 // Позиция A до обмена
			aTo: Vec2 // Позиция A после обмена
			bFrom: Vec2 // Позиция B до обмена
			bTo: Vec2 // Позиция B после обмена
			cost: number // Стоимость хода (1 или 2, SPEC §4)
			aMovesAfter: number // Moves у плитки A после оплаты стоимости
	  }
	| {
			type: 'remove'
			ids: number[] // IDs удаляемых плиток
			positions: Vec2[] // Позиции удаляемых плиток
	  }
	| {
			type: 'fall'
			moves: Array<{
				// Список падений плиток (SPEC §6)
				id: number
				from: Vec2
				to: Vec2
			}>
	  }
	| {
			type: 'spawn'
			items: Array<{
				// Новые плитки (только Endless Mode, SPEC §7)
				id: number
				to: Vec2
				color: number
				moves: number
			}>
	  }
	| {
			type: 'score'
			add: number // Добавлено очков (SPEC §9)
			total: number // Общий счёт
			combo: number // Текущий комбо
	  }
	| {
			type: 'combo'
			combo: number // Текущий уровень комбо (SPEC §8)
			endsAt: number // Timestamp когда комбо истечёт
	  }
	| {
			type: 'end'
			reason: 'cleared' | 'no_moves' // Причина окончания (SPEC §10)
			finalScore: number // Финальный счёт (с бонусами для Level Mode, SPEC §9)
			stats: {
				timeMs: number // Общее время игры
				leftTiles: number // Оставшиеся плитки
			}
	  }

/**
 * Результат хода
 *
 * Возвращается из applyMove() после выполнения обмена и всех каскадов
 */
export type MoveResult = {
	success: boolean // Ход был успешно выполнен?
	actions: GameAction[] // Список действий для рендерера
	newState: GameState // Новое состояние игры
}
