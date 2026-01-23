import type { GameState, GameConfig, Tile } from './types'

/**
 * Создание начального состояния игры из конфигурации
 *
 * SPEC §2: Создаёт сетку width x height
 * SPEC §12: Поддерживает preset grids из initialGrid
 *
 * @param config - Конфигурация игры
 * @returns Начальное состояние игры
 */
export function createGameState(config: GameConfig): GameState {
	const grid: (Tile | null)[][] = []
	let nextId = 1

	// Инициализация сетки
	if (config.initialGrid) {
		// Использовать preset grid из конфигурации (SPEC §12)
		// Формат: colors[] и moves[] массивов длиной W*H в row-major порядке (y * width + x)
		for (let x = 0; x < config.width; x++) {
			grid[x] = []
			for (let y = 0; y < config.height; y++) {
				const idx = y * config.width + x
				const color = config.initialGrid.colors[idx]
				const moves = config.initialGrid.moves[idx]
				grid[x][y] = {
					id: nextId++,
					color,
					moves: Math.max(0, Math.min(9, moves)), // Clamp [0..9] как в SPEC §3
				}
			}
		}
	} else {
		// Пустая сетка (будет заполнена генератором позже)
		for (let x = 0; x < config.width; x++) {
			grid[x] = []
			for (let y = 0; y < config.height; y++) {
				grid[x][y] = null
			}
		}
	}

	const now = Date.now()

	// Подсчёт начального количества плиток для finish bonus в Level Mode (SPEC §9)
	let initialTileCount = 0
	for (let x = 0; x < config.width; x++) {
		for (let y = 0; y < config.height; y++) {
			if (grid[x][y] !== null) {
				initialTileCount++
			}
		}
	}

	return {
		config,
		grid,
		nextId,
		score: 0,
		combo: 0,
		comboEndsAt: 0,
		startTime: now,
		elapsedTime: 0,
		initialTileCount,
		isEnded: false,
	}
}

/**
 * Получить плитку в позиции (x, y)
 *
 * @param state - Состояние игры
 * @param x - Координата X (колонка)
 * @param y - Координата Y (ряд)
 * @returns Плитка или null, если позиция пуста или невалидна
 */
export function getTile(state: GameState, x: number, y: number): Tile | null {
	if (x < 0 || x >= state.config.width || y < 0 || y >= state.config.height) {
		return null
	}
	return state.grid[x][y] ?? null
}

/**
 * Установить плитку в позицию (x, y)
 *
 * Мутирует состояние игры. Используется внутри core для изменения состояния.
 *
 * @param state - Состояние игры (будет изменено)
 * @param x - Координата X (колонка)
 * @param y - Координата Y (ряд)
 * @param tile - Плитка для установки (или null для удаления)
 */
export function setTile(
	state: GameState,
	x: number,
	y: number,
	tile: Tile | null
): void {
	if (x < 0 || x >= state.config.width || y < 0 || y >= state.config.height) {
		return
	}
	state.grid[x][y] = tile
}

/**
 * Клонировать состояние игры (глубокая копия)
 *
 * Используется для проверки ходов без изменения оригинального состояния
 * (например, в hasAnyPossibleMove для проверки, создаст ли swap match)
 *
 * @param state - Исходное состояние
 * @returns Глубокая копия состояния
 */
export function cloneState(state: GameState): GameState {
	const newGrid: (Tile | null)[][] = []
	for (let x = 0; x < state.config.width; x++) {
		newGrid[x] = []
		for (let y = 0; y < state.config.height; y++) {
			const tile = state.grid[x][y]
			newGrid[x][y] = tile ? { ...tile } : null
		}
	}

	return {
		...state,
		grid: newGrid,
		config: { ...state.config },
	}
}

/**
 * Подсчитать оставшиеся плитки на поле
 *
 * SPEC §10: Используется для определения cleared состояния в Level Mode
 *
 * @param state - Состояние игры
 * @returns Количество непустых клеток
 */
export function countTiles(state: GameState): number {
	let count = 0
	for (let x = 0; x < state.config.width; x++) {
		for (let y = 0; y < state.config.height; y++) {
			if (state.grid[x][y] !== null) {
				count++
			}
		}
	}
	return count
}

/**
 * Проверить, является ли позиция валидной на игровом поле
 *
 * @param state - Состояние игры
 * @param x - Координата X
 * @param y - Координата Y
 * @returns true если позиция в пределах границ поля
 */
export function isValidPosition(
	state: GameState,
	x: number,
	y: number
): boolean {
	return x >= 0 && x < state.config.width && y >= 0 && y < state.config.height
}
