<template>
	<Teleport to="body">
		<Transition name="dialog">
			<div v-if="isOpen" class="confirm-dialog-overlay" @click.self="handleCancel">
				<div class="confirm-dialog">
					<div class="confirm-dialog__title">{{ title }}</div>
					<div class="confirm-dialog__message">{{ message }}</div>
					<div class="confirm-dialog__actions">
						<button class="confirm-dialog__btn confirm-dialog__btn--cancel" @click="handleCancel">
							{{ cancelText }}
						</button>
						<button class="confirm-dialog__btn confirm-dialog__btn--confirm" @click="handleConfirm">
							{{ confirmText }}
						</button>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
	modelValue: boolean
	title?: string
	message?: string
	confirmText?: string
	cancelText?: string
}

const props = withDefaults(defineProps<Props>(), {
	title: 'Confirm',
	message: 'Are you sure?',
	confirmText: 'OK',
	cancelText: 'Cancel',
})

const emit = defineEmits<{
	'update:modelValue': [value: boolean]
	confirm: []
	cancel: []
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

function handleConfirm() {
	isOpen.value = false
	emit('confirm')
}

function handleCancel() {
	isOpen.value = false
	emit('cancel')
}
</script>

<style lang="scss" scoped>
.confirm-dialog-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.6);
	backdrop-filter: blur(8px);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 9999;
	padding: 1rem;
}

.confirm-dialog {
	background: linear-gradient(
		135deg,
		rgba(255, 255, 255, 0.2) 0%,
		rgba(255, 255, 255, 0.1) 100%
	);
	backdrop-filter: blur(20px);
	border-radius: 20px;
	border: 2px solid rgba(255, 255, 255, 0.3);
	padding: 2rem 1.5rem;
	max-width: 400px;
	width: 100%;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	position: relative;
	z-index: 10000;

	@media (max-width: 640px) {
		padding: 1.5rem 1rem;
		border-radius: 16px;
		max-width: 90%;
	}

	&__title {
		font-size: clamp(1.25rem, 4vw, 1.5rem);
		font-weight: 700;
		color: white;
		margin-bottom: 1rem;
		text-align: center;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	}

	&__message {
		font-size: clamp(0.9375rem, 2.75vw, 1.0625rem);
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 2rem;
		text-align: center;
		line-height: 1.5;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	&__actions {
		display: flex;
		gap: 1rem;
		justify-content: center;

		@media (max-width: 640px) {
			flex-direction: column;
			gap: 0.75rem;
		}
	}

	&__btn {
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
		flex: 1;
		min-width: 120px;
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

		&--confirm {
			background: linear-gradient(
				135deg,
				rgba(255, 255, 255, 0.2) 0%,
				rgba(255, 255, 255, 0.1) 100%
			);

			&::before {
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				background: linear-gradient(
					135deg,
					rgba(239, 68, 68, 0.3) 0%,
					rgba(220, 38, 38, 0.3) 100%
				);
				opacity: 0;
				transition: opacity 0.3s ease;
			}

			&:hover {
				background: linear-gradient(
					135deg,
					rgba(255, 255, 255, 0.25) 0%,
					rgba(255, 255, 255, 0.15) 100%
				);

				&::before {
					opacity: 1;
				}
			}
		}

		@media (max-width: 640px) {
			width: 100%;
			padding: clamp(0.875rem, 2vw, 1rem) 1.25rem;
		}

		@media (max-width: 480px) {
			border-radius: 12px;
			padding: 0.75rem 1rem;
			font-size: 0.9375rem;
		}
	}
}

// Transition animations
.dialog-enter-active,
.dialog-leave-active {
	transition: opacity 0.3s ease;
}

.dialog-enter-active .confirm-dialog,
.dialog-leave-active .confirm-dialog {
	transition: transform 0.3s ease, opacity 0.3s ease;
}

.dialog-enter-from,
.dialog-leave-to {
	opacity: 0;

	.confirm-dialog {
		transform: scale(0.9) translateY(-20px);
		opacity: 0;
	}
}

.dialog-enter-to,
.dialog-leave-from {
	opacity: 1;

	.confirm-dialog {
		transform: scale(1) translateY(0);
		opacity: 1;
	}
}
</style>
