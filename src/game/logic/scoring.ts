/**
 * Scoring logic
 */

export function calculateRemovalScore(removedCounts: number[]): number {
	let totalScore = 0

	for (const N of removedCounts) {
		// Base: 10*N + 5*max(0, N-3)
		const base = 10 * N + 5 * Math.max(0, N - 3)
		totalScore += base
	}

	return totalScore
}

export function calculateChainMultiplier(chainIndex: number): number {
	// multiplier = 1 + (chainIndex-1)*0.25 (cap 3x)
	return Math.min(3, 1 + (chainIndex - 1) * 0.25)
}

export function calculateVesselClearBonus(
	remainingTime: number,
	waveDuration: number,
	waveIndex: number
): number {
	// timeFactor = remainingTime / waveDuration
	const timeFactor = remainingTime / waveDuration

	// clearBonus = round(500 + 1500 * pow(timeFactor, 1.6)) * (1 + waveIndex*0.03)
	const baseBonus = 500 + 1500 * Math.pow(timeFactor, 1.6)
	const waveMultiplier = 1 + waveIndex * 0.03
	const bonus = Math.round(baseBonus * waveMultiplier)

	return bonus
}

export function calculateTotalScore(
	removalBatchScore: number,
	chainMultiplier: number,
	vesselClearBonus: number = 0
): number {
	return Math.round(removalBatchScore * chainMultiplier) + vesselClearBonus
}
