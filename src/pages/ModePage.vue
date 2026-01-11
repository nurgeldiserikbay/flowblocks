<template>
	<AppLayout>
		<template #title>
			<h1 class="page-title">Select Mode</h1>
		</template>

		<div class="mode-page">
			<div class="mode-page__content">
				<div class="mode-cards">
					<RouterLink
						to="/difficulty?mode=levels"
						class="mode-card mode-card--level"
					>
						<div class="mode-card__icon">📋</div>
						<h2 class="mode-card__title">Levels</h2>
						<p class="mode-card__subtitle">Level Mode</p>
					</RouterLink>

					<RouterLink
						to="/difficulty?mode=endless"
						class="mode-card mode-card--endless"
					>
						<div class="mode-card__icon">∞</div>
						<h2 class="mode-card__title">Endless</h2>
						<p class="mode-card__subtitle">Endless Mode</p>
					</RouterLink>
				</div>
			</div>
		</div>
	</AppLayout>
</template>

<script setup lang="ts">
import AppLayout from '@/shared/components/AppLayout.vue'
</script>

<style lang="scss" scoped>
.mode-page {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 1rem;
	min-height: calc(100dvh - 80px);

	&__content {
		width: 100%;
		max-width: 600px;
	}

	.page-title {
		font-size: clamp(1.25rem, 4vw, 1.5rem);
		font-weight: 700;
		color: white;
		margin: 0;
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
	}
}

.mode-cards {
	display: grid;
	grid-template-columns: 1fr;
	gap: 1.5rem;
	width: 100%;

	@media (min-width: 640px) {
		grid-template-columns: repeat(2, 1fr);
		gap: 2rem;
	}
}

.mode-card {
	background: linear-gradient(
		135deg,
		rgba(255, 255, 255, 0.2) 0%,
		rgba(255, 255, 255, 0.1) 100%
	);
	backdrop-filter: blur(20px);
	border-radius: 24px;
	padding: 2rem 1.5rem;
	text-decoration: none;
	color: white;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	border: 2px solid rgba(255, 255, 255, 0.3);
	cursor: pointer;
	touch-action: manipulation;
	position: relative;
	overflow: hidden;
	min-height: 200px;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);

	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(
			135deg,
			rgba(102, 126, 234, 0.3) 0%,
			rgba(118, 75, 162, 0.3) 100%
		);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	&--level::before {
		background: linear-gradient(
			135deg,
			rgba(59, 130, 246, 0.4) 0%,
			rgba(99, 102, 241, 0.4) 100%
		);
	}

	&--endless::before {
		background: linear-gradient(
			135deg,
			rgba(236, 72, 153, 0.4) 0%,
			rgba(168, 85, 247, 0.4) 100%
		);
	}

	&:hover {
		transform: translateY(-8px) scale(1.02);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
		border-color: rgba(255, 255, 255, 0.5);

		&::before {
			opacity: 1;
		}

		.mode-card__icon {
			transform: scale(1.1) rotate(5deg);
		}
	}

	&:active {
		transform: translateY(-4px) scale(1);
	}

	&__icon {
		font-size: clamp(3rem, 8vw, 4.5rem);
		line-height: 1;
		margin-bottom: 0.5rem;
		transition: transform 0.3s ease;
		filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
		position: relative;
		z-index: 1;
	}

	&__title {
		font-size: clamp(1.25rem, 4vw, 1.75rem);
		font-weight: 800;
		margin: 0;
		color: white;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		position: relative;
		z-index: 1;
	}

	&__subtitle {
		font-size: clamp(0.875rem, 3vw, 1rem);
		opacity: 0.9;
		margin: 0;
		color: white;
		position: relative;
		z-index: 1;
	}

	@media (max-width: 640px) {
		padding: 1.5rem 1rem;
		min-height: 180px;
	}
}
</style>
