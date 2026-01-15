<template>
	<Teleport to="body">
		<Transition name="dialog">
			<div
				v-if="isOpen"
				class="game-result-modal-overlay"
				@click.self="handleClose"
			>
				<div class="game-result-modal">
					<div
						class="game-result-modal__title"
						:class="{
							'game-result-modal__title--victory': isVictory,
							'game-result-modal__title--defeat': !isVictory,
						}"
					>
						{{ isVictory ? '🎉 Победа!' : '😔 Нет ходов' }}
					</div>

					<div class="game-result-modal__stats">
						<div class="stat-item">
							<div class="stat-item__label">Очки</div>
							<div class="stat-item__value">{{ score.toLocaleString() }}</div>
						</div>
						<div class="stat-item">
							<div class="stat-item__label">Время</div>
							<div class="stat-item__value">{{ formattedTime }}</div>
						</div>
					</div>

					<div class="game-result-modal__actions">
						<button
							v-if="isVictory && showNextLevel"
							class="game-result-modal__btn game-result-modal__btn--primary"
							@click="handleNextLevel"
						>
							Следующий уровень
						</button>
						<button
							class="game-result-modal__btn game-result-modal__btn--secondary"
							@click="handleLevelMenu"
						>
							Меню уровней
						</button>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface Props {
	modelValue: boolean
	isVictory: boolean
	score: number
	timeMs: number
	currentLevel?: number
	mode?: 'level' | 'endless'
}

const props = withDefaults(defineProps<Props>(), {
	currentLevel: undefined,
	mode: 'endless',
})

const emit = defineEmits<{
	'update:modelValue': [value: boolean]
	nextLevel: []
	levelMenu: []
}>()

const isOpen = ref(props.modelValue)

watch(
	() => props.modelValue,
	(newValue) => {
		isOpen.value = newValue
	}
)

watch(isOpen, (newValue) => {
	if (!newValue) {
		emit('update:modelValue', false)
	}
})

const formattedTime = computed(() => {
	const totalSeconds = Math.floor(props.timeMs / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
		2,
		'0'
	)}`
})

const showNextLevel = computed(() => {
	return (
		props.mode === 'level' &&
		props.currentLevel !== undefined &&
		props.currentLevel < 50
	)
})

function handleNextLevel() {
	isOpen.value = false
	emit('nextLevel')
}

function handleLevelMenu() {
	isOpen.value = false
	emit('levelMenu')
}

function handleClose() {
	isOpen.value = false
}
</script>

<style lang="scss" scoped>
.game-result-modal-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.7);
	backdrop-filter: blur(12px);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 10000;
	padding: 1rem;
}

.game-result-modal {
	background: linear-gradient(
		135deg,
		rgba(255, 255, 255, 0.2) 0%,
		rgba(255, 255, 255, 0.1) 100%
	);
	backdrop-filter: blur(20px);
	border-radius: 24px;
	border: 2px solid rgba(255, 255, 255, 0.3);
	padding: 2.5rem 2rem;
	max-width: 450px;
	width: 100%;
	box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
	position: relative;
	z-index: 10001;

	@media (max-width: 640px) {
		padding: 2rem 1.5rem;
		border-radius: 20px;
		max-width: 90%;
	}

	&__title {
		font-size: clamp(1.5rem, 5vw, 2rem);
		font-weight: 700;
		color: white;
		margin-bottom: 2rem;
		text-align: center;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);

		&--victory {
			background: linear-gradient(
				135deg,
				rgba(255, 215, 0, 0.9) 0%,
				rgba(255, 165, 0, 0.9) 100%
			);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
			background-clip: text;
		}

		&--defeat {
			color: rgba(255, 255, 255, 0.9);
		}
	}

	&__stats {
		display: flex;
		gap: 2rem;
		justify-content: center;
		margin-bottom: 2.5rem;

		@media (max-width: 640px) {
			gap: 1.5rem;
			margin-bottom: 2rem;
		}
	}

	&__actions {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		@media (min-width: 641px) {
			flex-direction: row;
			justify-content: center;
		}
	}

	&__btn {
		padding: clamp(1rem, 3vw, 1.125rem) clamp(1.5rem, 4vw, 2rem);
		border-radius: clamp(14px, 3vw, 16px);
		border: 2px solid rgba(255, 255, 255, 0.3);
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(10px);
		color: white;
		font-size: clamp(0.9375rem, 2.75vw, 1.0625rem);
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		touch-action: manipulation;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
		text-align: center;
		white-space: nowrap;
		position: relative;
		overflow: hidden;

		&:hover {
			background: rgba(255, 255, 255, 0.2);
			transform: translateY(-2px);
			box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
			border-color: rgba(255, 255, 255, 0.5);
		}

		&:active {
			transform: translateY(0);
		}

		&--primary {
			background: linear-gradient(
				135deg,
				rgba(34, 197, 94, 0.3) 0%,
				rgba(22, 163, 74, 0.3) 100%
			);
			border-color: rgba(34, 197, 94, 0.5);

			&::before {
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				background: linear-gradient(
					135deg,
					rgba(34, 197, 94, 0.4) 0%,
					rgba(22, 163, 74, 0.4) 100%
				);
				opacity: 0;
				transition: opacity 0.3s ease;
			}

			&:hover {
				background: linear-gradient(
					135deg,
					rgba(34, 197, 94, 0.4) 0%,
					rgba(22, 163, 74, 0.4) 100%
				);
				border-color: rgba(34, 197, 94, 0.7);

				&::before {
					opacity: 1;
				}
			}
		}

		&--secondary {
			@media (min-width: 641px) {
				min-width: 180px;
			}
		}
	}
}

.stat-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	padding: 1rem 1.5rem;
	background: rgba(255, 255, 255, 0.05);
	backdrop-filter: blur(10px);
	border-radius: 16px;
	border: 1px solid rgba(255, 255, 255, 0.1);
	min-width: 120px;

	@media (max-width: 640px) {
		padding: 0.875rem 1.25rem;
		min-width: 100px;
	}

	&__label {
		font-size: clamp(0.8125rem, 2.5vw, 0.9375rem);
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	&__value {
		font-size: clamp(1.25rem, 4vw, 1.5rem);
		color: white;
		font-weight: 700;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}
}

// Transition animations
.dialog-enter-active,
.dialog-leave-active {
	transition: opacity 0.3s ease;
}

.dialog-enter-active .game-result-modal,
.dialog-leave-active .game-result-modal {
	transition: transform 0.3s ease, opacity 0.3s ease;
}

.dialog-enter-from,
.dialog-leave-to {
	opacity: 0;

	.game-result-modal {
		transform: scale(0.9) translateY(-20px);
		opacity: 0;
	}
}

.dialog-enter-to,
.dialog-leave-from {
	opacity: 1;

	.game-result-modal {
		transform: scale(1) translateY(0);
		opacity: 1;
	}
}
</style>
