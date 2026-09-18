<template>
	<div class="top-bar">
		<div class="top-bar__left">
			<slot name="logo"></slot>
			<slot name="title"></slot>
		</div>
		<button
			class="top-bar__sound"
			@click="toggleSound"
			:aria-label="audioStore.isMuted ? 'Unmute' : 'Mute'"
		>
			<svg
				v-if="!audioStore.isMuted"
				class="top-bar__sound-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M11 5L6 9H3V15H6L11 19V5Z" />
				<path d="M15 9C16.3333 10.3333 16.3333 13.6667 15 15" />
				<path d="M18 7C20 9 20 15 18 17" />
			</svg>
			<svg
				v-else
				class="top-bar__sound-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M11 5L6 9H3V15H6L11 19V5Z" />
				<path d="M16 8L21 16" />
				<path d="M21 8L16 16" />
			</svg>
		</button>
	</div>
</template>

<script setup lang="ts">
import { useAudioStore } from '@/shared/stores/audioStore'

const audioStore = useAudioStore()

function toggleSound() {
	audioStore.toggleMute()
}
</script>

<style lang="scss" scoped>
.top-bar {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 1rem;
	width: 100%;
	position: relative;
	z-index: 10;
	/*
	   Одна матовая полоса на всю ширину: шапка должна читаться как подложка под
	   показатели, а не как ещё один цветной элемент поверх неба.

	   Синий светлее и прозрачнее, чем был. С плотной заливкой rgba(8,18,45,.55)
	   шапка теряла против прежней версии 31% яркости — это самая тёмная зона
	   экрана, и она тянула за собой ощущение от всей игры. Небо теперь
	   просвечивает, а показатели держатся на собственных площадках.
	*/
	background: rgba(24, 46, 92, 0.42);
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
	border-bottom: 1px solid var(--c-surface-border);
	box-shadow: 0 4px 16px rgba(7, 18, 38, 0.25);
	box-sizing: border-box;
	gap: 1rem;

	@media (max-width: 640px) {
		padding: 0.75rem 1rem;
	}

	@media (max-width: 360px) {
		padding: 0.5rem 0.75rem;
		gap: 0.75rem;
	}

	@media (max-width: 320px) {
		padding: 0.5rem 0.5rem;
		gap: 0.5rem;
	}

	&__left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
		/* Предотвращаем изменение размеров при изменении layout дочерних элементов */
		contain: layout style;

		@media (max-width: 360px) {
			gap: 0.5rem;
		}

		@media (max-width: 320px) {
			gap: 0.4rem;
		}
	}

	&__sound {
		width: 44px;
		height: 44px;
		border-radius: var(--r-control);
		border: 1px solid var(--c-surface-border);
		background: var(--c-surface);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: transform 0.15s ease;
		touch-action: manipulation;
		flex-shrink: 0;
		box-shadow: 0 4px 12px rgba(7, 18, 38, 0.25);

		&:active {
			transform: scale(0.94);
		}

		@media (max-width: 640px) {
			width: 40px;
			height: 40px;
		}

		@media (max-width: 360px) {
			width: 36px;
			height: 36px;
		}

		@media (max-width: 320px) {
			width: 32px;
			height: 32px;
		}
	}

	&__sound-icon {
		width: 24px;
		height: 24px;
		color: var(--c-text);
		stroke-linecap: round;
		stroke-linejoin: round;

		@media (max-width: 640px) {
			width: 20px;
			height: 20px;
		}

		@media (max-width: 360px) {
			width: 18px;
			height: 18px;
		}

		@media (max-width: 320px) {
			width: 16px;
			height: 16px;
		}
	}
}
</style>
