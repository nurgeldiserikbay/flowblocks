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
	background: rgba(0, 0, 0, 0.2);
	backdrop-filter: blur(20px);
	border-bottom: 1px solid rgba(255, 255, 255, 0.2);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
	box-sizing: border-box;
	gap: 1rem;

	@media (max-width: 640px) {
		padding: 0.75rem 1rem;
	}

	&__left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	&__sound {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.2) 0%,
			rgba(255, 255, 255, 0.1) 100%
		);
		backdrop-filter: blur(10px);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		touch-action: manipulation;
		flex-shrink: 0;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);

		&:hover {
			background: linear-gradient(
				135deg,
				rgba(255, 255, 255, 0.3) 0%,
				rgba(255, 255, 255, 0.2) 100%
			);
			transform: scale(1.1) rotate(5deg);
			box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
			border-color: rgba(255, 255, 255, 0.5);
		}

		&:active {
			transform: scale(0.95) rotate(0deg);
		}

		@media (max-width: 640px) {
			width: 40px;
			height: 40px;
		}
	}

	&__sound-icon {
		width: 24px;
		height: 24px;
		color: white;
		stroke-linecap: round;
		stroke-linejoin: round;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));

		@media (max-width: 640px) {
			width: 20px;
			height: 20px;
		}
	}
}
</style>
