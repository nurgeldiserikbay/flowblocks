import type { GameState } from '../types'

/**
 * Calculate combo window duration based on current combo
 * base=1.8s, min=0.55s, decay=0.92
 * window = max(min, base * decay^(combo-1))
 */
export function calculateComboWindow(combo: number): number {
	const base = 1800 // 1.8 seconds in ms
	const min = 550 // 0.55 seconds in ms
	const decay = 0.92

	if (combo <= 1) {
		return base
	}

	const window = base * Math.pow(decay, combo - 1)
	return Math.max(min, window)
}

/**
 * Update combo based on removal event
 * If current time <= comboEndsAt => combo++, else combo=1
 */
export function updateCombo(state: GameState): void {
	const now = Date.now()

	if (state.comboEndsAt > 0 && now <= state.comboEndsAt) {
		// Continue combo
		state.combo++
	} else {
		// Start new combo
		state.combo = 1
	}

	// Update combo end time
	state.comboEndsAt = now + calculateComboWindow(state.combo)
}

/**
 * Get combo multiplier for scoring
 * multiplier = 1 + 0.25*(combo-1)
 */
export function getComboMultiplier(combo: number): number {
	return 1 + 0.25 * (combo - 1)
}
