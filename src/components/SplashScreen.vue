<template>
	<div v-if="visible" class="splash-screen" :class="{ 'splash-screen--hidden': !visible }">
		<div class="splash-screen__content">
			<!-- SVG logo with colorful cubes (same as StartPage) -->
			<svg
				class="splash-screen__logo"
				viewBox="0 0 120 120"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<!-- Background circle -->
				<circle cx="60" cy="60" r="55" fill="url(#splashLogoGradient)" />
				<!-- Cube 1 (top left) -->
				<rect x="25" y="30" width="22" height="22" rx="4" fill="#FFD93D" />
				<rect
					x="27"
					y="32"
					width="18"
					height="18"
					rx="3"
					fill="#FFED4E"
					opacity="0.8"
				/>
				<!-- Cube 2 (top right) -->
				<rect x="73" y="30" width="22" height="22" rx="4" fill="#6BCF7F" />
				<rect
					x="75"
					y="32"
					width="18"
					height="18"
					rx="3"
					fill="#7DD87F"
					opacity="0.8"
				/>
				<!-- Cube 3 (middle left) -->
				<rect x="25" y="58" width="22" height="22" rx="4" fill="#4D96FF" />
				<rect
					x="27"
					y="60"
					width="18"
					height="18"
					rx="3"
					fill="#6BAEFF"
					opacity="0.8"
				/>
				<!-- Cube 4 (middle right) -->
				<rect x="73" y="58" width="22" height="22" rx="4" fill="#FF6B9D" />
				<rect
					x="75"
					y="60"
					width="18"
					height="18"
					rx="3"
					fill="#FF8FB5"
					opacity="0.8"
				/>
				<!-- Cube 5 (bottom center) -->
				<rect x="49" y="86" width="22" height="22" rx="4" fill="#C445FF" />
				<rect
					x="51"
					y="88"
					width="18"
					height="18"
					rx="3"
					fill="#D66AFF"
					opacity="0.8"
				/>
				<defs>
					<linearGradient
						id="splashLogoGradient"
						x1="0%"
						y1="0%"
						x2="100%"
						y2="100%"
					>
						<stop
							offset="0%"
							style="stop-color: #2b2f6c; stop-opacity: 1"
						/>
						<stop
							offset="50%"
							style="stop-color: #3d4180; stop-opacity: 1"
						/>
						<stop
							offset="100%"
							style="stop-color: #1e1f3a; stop-opacity: 1"
						/>
					</linearGradient>
				</defs>
			</svg>
			<h1 class="splash-screen__title">FlowBlocks</h1>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const visible = ref(true)

// Hide splash screen when app is ready
onMounted(() => {
	// Wait for router and initial page to load
	const hideSplash = () => {
		// Add fade out animation
		setTimeout(() => {
			visible.value = false
		}, 300) // Small delay to ensure smooth transition
	}

	// Hide when DOM is ready and router has navigated
	if (document.readyState === 'complete') {
		// Wait a bit for StartPage to initialize
		setTimeout(hideSplash, 800)
	} else {
		window.addEventListener('load', () => {
			setTimeout(hideSplash, 800)
		})
	}
})

// Expose method to hide splash programmatically
defineExpose({
	hide: () => {
		visible.value = false
	},
})
</script>

<style lang="scss" scoped>
.splash-screen {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #2b2f6c 0%, #3d4180 50%, #1e1f3a 100%);
	background-attachment: fixed;
	background-size: cover;
	background-position: center;
	overflow: hidden;
	padding-top: env(safe-area-inset-top, 0px);
	padding-bottom: env(safe-area-inset-bottom, 0px);
	transition: opacity 0.5s ease-out, visibility 0.5s ease-out;
	opacity: 1;
	visibility: visible;

	// Add decorative radial gradients matching StartPage
	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background:
			radial-gradient(
				circle at 20% 30%,
				rgba(59, 130, 246, 0.25) 0%,
				transparent 50%
			),
			radial-gradient(
				circle at 80% 70%,
				rgba(139, 92, 246, 0.25) 0%,
				transparent 50%
			),
			radial-gradient(
				circle at 50% 50%,
				rgba(236, 72, 153, 0.2) 0%,
				transparent 50%
			);
		pointer-events: none;
		z-index: 0;
	}

	&--hidden {
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
	}

	&__content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: clamp(1rem, 3vw, 1.5rem);
		position: relative;
		z-index: 1;
		animation: splashFadeIn 0.6s ease-out;
	}

	&__logo {
		width: clamp(100px, 25vw, 150px);
		height: clamp(100px, 25vw, 150px);
		filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.4));
		animation: logoPulse 2s ease-in-out infinite;
	}

	&__title {
		font-size: clamp(2rem, 8vw, 3rem);
		font-weight: 900;
		color: white;
		text-align: center;
		letter-spacing: -0.02em;
		text-shadow:
			0 4px 20px rgba(0, 0, 0, 0.5),
			0 2px 8px rgba(0, 0, 0, 0.3);
		margin: 0;
		font-family:
			'Inter',
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		line-height: 1.1;
		animation: titleFadeIn 0.8s ease-out 0.2s both;
	}
}

@keyframes splashFadeIn {
	from {
		opacity: 0;
		transform: scale(0.95);
	}
	to {
		opacity: 1;
		transform: scale(1);
	}
}

@keyframes logoPulse {
	0%,
	100% {
		transform: scale(1);
	}
	50% {
		transform: scale(1.05);
	}
}

@keyframes titleFadeIn {
	from {
		opacity: 0;
		transform: translateY(10px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
</style>
