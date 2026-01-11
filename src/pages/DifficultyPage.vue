<template>
	<AppLayout>
		<template #title>
			<h1 class="page-title">Difficulty</h1>
		</template>

		<div class="difficulty-page">
			<div class="difficulty-page__content">
				<div class="difficulty-cards">
					<button
						v-for="diff in difficulties"
						:key="diff.key"
						class="difficulty-card"
						:class="`difficulty-card--${diff.key}`"
						@click="selectDifficulty(diff.key)"
					>
						<div
							class="difficulty-card__badge"
							:class="`difficulty-card__badge--${diff.key}`"
						>
							{{ diff.label }}
						</div>
						<div class="difficulty-card__colors">{{ diff.colors }} colors</div>
					</button>
				</div>

				<button class="btn btn--back" @click="$router.back()">← Back</button>
			</div>
		</div>
	</AppLayout>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import type { Difficulty } from '@/features/game/core/types'
import AppLayout from '@/shared/components/AppLayout.vue'

const route = useRoute()
const router = useRouter()

const mode = route.query.mode as string

const difficulties = [
	{ key: 'easy' as Difficulty, label: 'Easy', colors: '4-5' },
	{ key: 'normal' as Difficulty, label: 'Normal', colors: '6' },
	{ key: 'hard' as Difficulty, label: 'Hard', colors: '7-8' },
]

function selectDifficulty(difficulty: Difficulty) {
	if (mode === 'endless') {
		router.push(`/game?mode=endless&difficulty=${difficulty}`)
	} else if (mode === 'level' || mode === 'levels') {
		router.push(`/levels?difficulty=${difficulty}`)
	} else {
		// fallback
		router.push(`/game?mode=endless&difficulty=${difficulty}`)
	}
}
</script>

<style lang="scss" scoped>
.difficulty-page {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 1rem;
	min-height: calc(100dvh - 80px);

	&__content {
		width: 100%;
		max-width: 500px;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.page-title {
		font-size: clamp(1.25rem, 4vw, 1.5rem);
		font-weight: 700;
		color: white;
		margin: 0;
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
	}
}

.difficulty-cards {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	width: 100%;
}

.difficulty-card {
	background: linear-gradient(
		135deg,
		rgba(255, 255, 255, 0.2) 0%,
		rgba(255, 255, 255, 0.1) 100%
	);
	backdrop-filter: blur(20px);
	border-radius: 20px;
	padding: 2rem 1.5rem;
	border: 2px solid rgba(255, 255, 255, 0.3);
	cursor: pointer;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	color: white;
	text-align: center;
	touch-action: manipulation;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	position: relative;
	overflow: hidden;

	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	&--easy::before {
		background: linear-gradient(
			135deg,
			rgba(74, 222, 128, 0.3) 0%,
			rgba(34, 197, 94, 0.3) 100%
		);
	}

	&--normal::before {
		background: linear-gradient(
			135deg,
			rgba(96, 165, 250, 0.3) 0%,
			rgba(59, 130, 246, 0.3) 100%
		);
	}

	&--hard::before {
		background: linear-gradient(
			135deg,
			rgba(248, 113, 113, 0.3) 0%,
			rgba(239, 68, 68, 0.3) 100%
		);
	}

	&:hover {
		transform: translateY(-4px) scale(1.02);
		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.25) 0%,
			rgba(255, 255, 255, 0.15) 100%
		);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
		border-color: rgba(255, 255, 255, 0.5);

		&::before {
			opacity: 1;
		}
	}

	&:active {
		transform: translateY(-2px) scale(1);
	}

	&__badge {
		font-size: clamp(1.5rem, 5vw, 2rem);
		font-weight: 800;
		margin-bottom: 0.5rem;
		position: relative;
		z-index: 1;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);

		&--easy {
			color: #4ade80;
		}

		&--normal {
			color: #60a5fa;
		}

		&--hard {
			color: #f87171;
		}
	}

	&__colors {
		font-size: clamp(0.875rem, 3vw, 1rem);
		opacity: 0.9;
		position: relative;
		z-index: 1;
	}

	@media (max-width: 640px) {
		padding: 1.5rem 1rem;
	}
}

.btn--back {
	width: 100%;
	padding: 1rem;
	border-radius: 16px;
	border: 2px solid rgba(255, 255, 255, 0.3);
	background: rgba(255, 255, 255, 0.1);
	backdrop-filter: blur(10px);
	color: white;
	font-size: clamp(1rem, 3vw, 1.125rem);
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s ease;
	touch-action: manipulation;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);

	&:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
	}

	&:active {
		transform: translateY(0);
	}
}
</style>
