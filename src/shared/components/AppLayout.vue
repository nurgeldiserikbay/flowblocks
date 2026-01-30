<template>
	<div class="app-layout">
		<slot name="header">
			<TopBar>
				<template #logo>
					<slot name="logo"></slot>
				</template>
				<template #title>
					<slot name="title"></slot>
				</template>
			</TopBar>
		</slot>
		<main class="app-layout__main">
			<slot></slot>
		</main>
	</div>
</template>

<script setup lang="ts">
import TopBar from './TopBar.vue'
</script>

<style lang="scss" scoped>
.app-layout {
	height: 100dvh;
	min-height: 100dvh;
	max-height: 100dvh;
	display: flex;
	flex-direction: column;
	// Background image is inherited from #app, transparent to show it
	background: transparent;
	position: relative;
	overflow: hidden;
	padding-top: env(safe-area-inset-top, 0px);
	padding-bottom: 0;
	margin-top: calc(-1 * env(safe-area-inset-top, 0px));
	margin-bottom: 0;

	// Subtle decorative overlay for depth
	&::before {
		content: '';
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background:
			radial-gradient(
				circle at 20% 30%,
				rgba(59, 130, 246, 0.3) 0%,
				transparent 50%
			),
			radial-gradient(
				circle at 80% 70%,
				rgba(139, 92, 246, 0.3) 0%,
				transparent 50%
			),
			radial-gradient(
				circle at 50% 50%,
				rgba(236, 72, 153, 0.25) 0%,
				transparent 50%
			);
		pointer-events: none;
		z-index: 0;
	}

	&__main {
		flex: 1;
		display: flex;
		flex-direction: column;
		position: relative;
		overflow: hidden;
		z-index: 1;
		min-height: 0; // Важно для flex-контейнеров, чтобы они правильно ограничивали высоту
	}
}
</style>
