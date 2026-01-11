<template>
	<AppLayout>
		<div class="levels-page">
			<div class="levels-page__content">
				<div class="levels-grid-container">
					<div class="levels-grid">
						<button
							v-for="levelConfig in levels"
							:key="levelConfig.level"
							class="level-card"
							:class="{
								'level-card--locked': !progressStore.isLevelUnlocked(
									difficulty,
									levelConfig.level
								),
								'level-card--unlocked': progressStore.isLevelUnlocked(
									difficulty,
									levelConfig.level
								),
							}"
							:disabled="!progressStore.isLevelUnlocked(difficulty, levelConfig.level)"
							@click="startLevel(levelConfig.level)"
						>
							<span class="level-card__tiles">{{ levelConfig.tiles }}</span>
							<span
								v-if="!progressStore.isLevelUnlocked(difficulty, levelConfig.level)"
								class="level-card__lock"
							>
								🔒
							</span>
						</button>
					</div>
				</div>

				<button class="btn btn--back" @click="$router.back()">← Back</button>
			</div>

			<!-- Decorative pattern overlay -->
			<div class="pattern-overlay">
				<div
					class="pattern-overlay__shape"
					v-for="(style, i) in patternStyles"
					:key="i"
					:style="style"
				></div>
			</div>
		</div>
	</AppLayout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Difficulty } from '@/features/game/core/types'
import AppLayout from '@/shared/components/AppLayout.vue'
import { useProgressStore } from '@/shared/stores/progressStore'
import { LEVEL_CONFIGS } from '@/entities/level/levelConfig'

const router = useRouter()
const progressStore = useProgressStore()

// Fixed difficulty - always use 'normal' (6 colors)
const difficulty: Difficulty = 'normal'

// Use level configs from LEVEL_CONFIGS (50 levels)
const levels = LEVEL_CONFIGS

function startLevel(level: number) {
	if (progressStore.isLevelUnlocked(difficulty, level)) {
		router.push(`/game?mode=level&level=${level}`)
	}
}

// Pattern positions (same as StartPage for consistency)
const PATTERN_POSITIONS = [
	{ x: 15, y: 20, size: 32, opacity: 0.08, rotation: 45 },
	{ x: 85, y: 25, size: 28, opacity: 0.06, rotation: 135 },
	{ x: 20, y: 60, size: 35, opacity: 0.09, rotation: 225 },
	{ x: 80, y: 65, size: 30, opacity: 0.07, rotation: 315 },
	{ x: 45, y: 15, size: 25, opacity: 0.05, rotation: 90 },
	{ x: 75, y: 80, size: 38, opacity: 0.1, rotation: 180 },
	{ x: 10, y: 85, size: 27, opacity: 0.06, rotation: 270 },
	{ x: 90, y: 40, size: 33, opacity: 0.08, rotation: 30 },
	{ x: 30, y: 45, size: 29, opacity: 0.07, rotation: 60 },
	{ x: 65, y: 10, size: 26, opacity: 0.05, rotation: 150 },
	{ x: 50, y: 90, size: 36, opacity: 0.09, rotation: 210 },
	{ x: 40, y: 30, size: 24, opacity: 0.06, rotation: 300 },
]

// Pre-compute pattern styles
const patternStyles = computed(() =>
	PATTERN_POSITIONS.map((pos) => ({
		width: `${pos.size}px`,
		height: `${pos.size}px`,
		left: `${pos.x}%`,
		top: `${pos.y}%`,
		opacity: pos.opacity.toString(),
		transform: `rotate(${pos.rotation}deg)`,
	}))
)
</script>

<style lang="scss" scoped>
.levels-page {
	width: 100%;
	min-height: calc(100dvh - 80px);
	height: 100%;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	position: relative;
	overflow-y: auto;
	overflow-x: hidden;
	background: linear-gradient(180deg, #1e1f3a 0%, #2b2f6c 50%, #1e1f3a 100%);
	background-attachment: fixed;
	-webkit-overflow-scrolling: touch;
	flex: 1;
	overscroll-behavior-y: contain;

	// Decorative soft shapes in background (same as StartPage)
	&::before {
		content: '';
		position: fixed;
		top: -50%;
		left: -50%;
		width: 200%;
		height: 200%;
		background: radial-gradient(
				circle at 30% 40%,
				rgba(107, 207, 127, 0.15) 0%,
				transparent 50%
			),
			radial-gradient(
				circle at 70% 60%,
				rgba(77, 150, 255, 0.15) 0%,
				transparent 50%
			),
			radial-gradient(
				circle at 50% 80%,
				rgba(196, 69, 255, 0.1) 0%,
				transparent 50%
			);
		pointer-events: none;
		z-index: 0;
		animation: float 20s ease-in-out infinite;
	}

	&__content {
		width: 100%;
		max-width: 800px;
		margin: 0 auto;
		padding: clamp(1.5rem, 5vw, 2.5rem) clamp(1rem, 4vw, 1.5rem);
		padding-bottom: clamp(2rem, 6vw, 3rem);
		padding-top: clamp(1.5rem, 5vw, 2rem);
		display: flex;
		flex-direction: column;
		gap: clamp(1rem, 3vw, 1.5rem);
		position: relative;
		z-index: 1;
		box-sizing: border-box;
		overflow: hidden;

		@media (max-width: 640px) {
			padding: clamp(1.25rem, 4vw, 1.75rem) clamp(0.875rem, 3vw, 1.25rem);
			padding-bottom: clamp(1.5rem, 5vw, 2rem);
			padding-top: clamp(1.25rem, 4vw, 1.5rem);
		}

		@media (max-width: 480px) {
			padding: 1rem clamp(0.75rem, 2.5vw, 1rem);
			padding-bottom: 1.5rem;
			padding-top: 1rem;
		}
	}
}

@keyframes float {
	0%,
	100% {
		transform: translate(0, 0) rotate(0deg);
	}
	33% {
		transform: translate(20px, -20px) rotate(5deg);
	}
	66% {
		transform: translate(-20px, 20px) rotate(-5deg);
	}
}

.levels-grid-container {
	flex-grow: 1;
	overflow-y: auto;
}

.levels-grid {
	display: grid;
	grid-template-columns: repeat(
		auto-fill,
		minmax(clamp(80px, 14vw, 120px), 1fr)
	);
	gap: clamp(0.875rem, 2vw, 1.125rem);
	padding: 0;
	width: 100%;

	@media (min-width: 1024px) {
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 1.25rem;
	}

	@media (min-width: 640px) and (max-width: 1023px) {
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 1rem;
	}

	@media (max-width: 640px) {
		grid-template-columns: repeat(
			auto-fill,
			minmax(clamp(85px, 15vw, 100px), 1fr)
		);
		gap: clamp(0.75rem, 2vw, 0.875rem);
	}

	@media (max-width: 480px) {
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}

	@media (max-width: 360px) {
		grid-template-columns: repeat(3, 1fr);
		gap: 0.625rem;
	}
}

.level-card {
	aspect-ratio: 1;
	background: linear-gradient(
		135deg,
		rgba(255, 255, 255, 0.2) 0%,
		rgba(255, 255, 255, 0.1) 100%
	);
	backdrop-filter: blur(20px);
	border-radius: clamp(16px, 3vw, 20px);
	border: 2px solid rgba(255, 255, 255, 0.3);
	cursor: pointer;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	touch-action: manipulation;
	position: relative;
	overflow: hidden;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	min-height: clamp(80px, 14vw, 120px);

	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(
			135deg,
			rgba(102, 126, 234, 0.4) 0%,
			rgba(118, 75, 162, 0.4) 100%
		);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	&:not(:disabled):hover {
		transform: translateY(-6px) scale(1.05);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
		border-color: rgba(255, 255, 255, 0.6);

		&::before {
			opacity: 1;
		}
	}

	&:not(:disabled):active {
		transform: translateY(-3px) scale(1.02);
	}

	&:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		filter: grayscale(0.7);
	}

	&--locked {
		background: linear-gradient(
			135deg,
			rgba(0, 0, 0, 0.3) 0%,
			rgba(0, 0, 0, 0.2) 100%
		);
		border-color: rgba(255, 255, 255, 0.1);
	}

	&--unlocked {
		background: linear-gradient(
			135deg,
			rgba(59, 130, 246, 0.3) 0%,
			rgba(99, 102, 241, 0.3) 100%
		);
	}

	&__tiles {
		font-size: clamp(1.125rem, 4vw, 1.75rem);
		font-weight: 800;
		color: white;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		position: relative;
		z-index: 1;
		line-height: 1;

		@media (max-width: 640px) {
			font-size: clamp(1rem, 3.5vw, 1.5rem);
		}

		@media (max-width: 480px) {
			font-size: clamp(0.9375rem, 3vw, 1.25rem);
		}
	}

	&__lock {
		font-size: clamp(0.875rem, 2.5vw, 1.125rem);
		position: absolute;
		bottom: clamp(0.125rem, 0.5vw, 0.25rem);
		right: clamp(0.125rem, 0.5vw, 0.25rem);
		opacity: 0.8;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
		z-index: 2;

		@media (max-width: 480px) {
			font-size: clamp(0.75rem, 2vw, 1rem);
			bottom: 0.125rem;
			right: 0.125rem;
		}
	}

	@media (max-width: 640px) {
		border-radius: 12px;
		border-width: 1.5px;
	}

	@media (max-width: 480px) {
		border-radius: 10px;
		border-width: 1px;
		min-height: 0;
	}
}

.btn--back {
	width: 100%;
	max-width: 300px;
	margin: clamp(1rem, 3vw, 1.5rem) auto 0;
	padding: clamp(0.875rem, 2.5vw, 1rem) clamp(1.25rem, 4vw, 1.75rem);
	border-radius: clamp(14px, 3vw, 16px);
	border: 2px solid rgba(255, 255, 255, 0.3);
	background: rgba(255, 255, 255, 0.1);
	backdrop-filter: blur(10px);
	color: white;
	font-size: clamp(0.9375rem, 2.75vw, 1.0625rem);
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s ease;
	touch-action: manipulation;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
	position: relative;
	z-index: 1;
	text-align: center;
	white-space: nowrap;

	&:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
		border-color: rgba(255, 255, 255, 0.5);
	}

	&:active {
		transform: translateY(0);
	}

	@media (max-width: 640px) {
		max-width: 100%;
		padding: clamp(0.875rem, 2vw, 1rem) 1.25rem;
		margin-top: clamp(0.75rem, 2.5vw, 1rem);
	}

	@media (max-width: 480px) {
		border-radius: 12px;
		padding: 0.75rem 1rem;
		font-size: 0.9375rem;
	}
}

// Decorative pattern overlay (same as StartPage)
.pattern-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	z-index: 0;
	overflow: hidden;

	&__shape {
		position: absolute;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 50%;
		backdrop-filter: blur(2px);
		animation: patternFloat 15s ease-in-out infinite;

		&:nth-child(odd) {
			animation-duration: 20s;
			animation-direction: reverse;
		}
	}
}

@keyframes patternFloat {
	0%,
	100% {
		transform: translate(0, 0) rotate(0deg);
	}
	25% {
		transform: translate(30px, -30px) rotate(90deg);
	}
	50% {
		transform: translate(-20px, 20px) rotate(180deg);
	}
	75% {
		transform: translate(20px, 30px) rotate(270deg);
	}
}
</style>
