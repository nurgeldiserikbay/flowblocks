<template>
	<AppLayout>
		<template #title>
			<h1 class="page-title">FlowBlocks</h1>
		</template>

		<div class="start-page">
			<div class="start-page__content">
				<div class="logo-section">
					<div class="logo">
						<svg
							class="logo__icon"
							viewBox="0 0 100 100"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<rect
								x="10"
								y="10"
								width="80"
								height="80"
								rx="12"
								fill="url(#gradient)"
							/>
							<rect
								x="20"
								y="20"
								width="20"
								height="20"
								rx="4"
								fill="white"
								opacity="0.9"
							/>
							<rect
								x="50"
								y="20"
								width="20"
								height="20"
								rx="4"
								fill="white"
								opacity="0.7"
							/>
							<rect
								x="20"
								y="50"
								width="20"
								height="20"
								rx="4"
								fill="white"
								opacity="0.7"
							/>
							<rect
								x="50"
								y="50"
								width="20"
								height="20"
								rx="4"
								fill="white"
								opacity="0.9"
							/>
							<defs>
								<linearGradient
									id="gradient"
									x1="0%"
									y1="0%"
									x2="100%"
									y2="100%"
								>
									<stop
										offset="0%"
										style="stop-color: #667eea; stop-opacity: 1"
									/>
									<stop
										offset="100%"
										style="stop-color: #764ba2; stop-opacity: 1"
									/>
								</linearGradient>
							</defs>
						</svg>
						<h1 class="logo__title">FlowBlocks</h1>
					</div>
				</div>

				<RouterLink to="/mode" class="btn btn--primary btn--wide btn--large">
					Выбрать режим
				</RouterLink>

				<RouterLink to="/policy" class="policy-link">
					Политика конфиденциальности
				</RouterLink>
			</div>
		</div>
	</AppLayout>
</template>

<script setup lang="ts">
import AppLayout from '@/shared/components/AppLayout.vue'
</script>

<style lang="scss" scoped>
.start-page {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 2rem 1rem;
	min-height: calc(100dvh - 80px);

	&__content {
		width: 100%;
		max-width: 400px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
	}
}

.logo-section {
	width: 100%;
	display: flex;
	justify-content: center;
}

.logo {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1.5rem;

	&__icon {
		width: 120px;
		height: 120px;
		filter: drop-shadow(0 10px 30px rgba(102, 126, 234, 0.4));
	}

	&__title {
		font-size: 2.5rem;
		font-weight: 800;
		color: white;
		text-align: center;
		letter-spacing: -0.02em;
		text-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
		margin: 0;
	}
}

.page-title {
	font-size: 1.25rem;
	font-weight: 600;
	color: white;
	margin: 0;
}

.btn {
	padding: 1rem 2rem;
	border-radius: 16px;
	border: none;
	font-size: 1.125rem;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s ease;
	text-decoration: none;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	touch-action: manipulation;
	width: 100%;

	&--primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);

		&:hover {
			transform: translateY(-2px);
			box-shadow: 0 12px 32px rgba(102, 126, 234, 0.5);
		}

		&:active {
			transform: translateY(0);
		}
	}

	&--wide {
		width: 100%;
	}

	&--large {
		padding: 1.25rem 2rem;
		font-size: 1.25rem;
	}
}

.policy-link {
	font-size: 0.875rem;
	color: rgba(255, 255, 255, 0.6);
	text-decoration: none;
	transition: color 0.2s ease;
	margin-top: 1rem;

	&:hover {
		color: rgba(255, 255, 255, 0.8);
	}
}
</style>
