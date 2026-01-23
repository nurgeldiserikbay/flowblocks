<template>
	<div class="start-page">
		<!-- Sound button (top right) -->
		<button
			class="sound-button"
			@click="toggleSound"
			:aria-label="audioStore.isMuted ? 'Unmute' : 'Mute'"
		>
			<svg
				v-if="!audioStore.isMuted"
				class="sound-button__icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M11 5L6 9H3V15H6L11 19V5Z" />
				<path d="M15 9C16.3333 10.3333 16.3333 13.6667 15 15" />
				<path d="M18 7C20 9 20 15 18 17" />
			</svg>
			<svg
				v-else
				class="sound-button__icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M11 5L6 9H3V15H6L11 19V5Z" />
				<path d="M16 8L21 16" stroke-width="2" />
				<path d="M21 8L16 16" stroke-width="2" />
			</svg>
		</button>

		<!-- Main content -->
		<div class="start-page__content">
			<!-- Logo section -->
			<div class="logo-section">
				<div class="logo">
					<!-- SVG logo with colorful cubes -->
					<svg
						class="logo__svg"
						viewBox="0 0 120 120"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<!-- Background circle -->
						<circle cx="60" cy="60" r="55" fill="url(#logoGradient)" />
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
								id="logoGradient"
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
					<h1 class="logo__title">FlowBlocks</h1>
				</div>
			</div>

			<!-- Play button -->
			<div class="play-button-container">
				<RouterLink to="/game" class="play-button">
					<span class="play-button__text">Play</span>
				</RouterLink>
			</div>

			<!-- Privacy policy link -->
			<a
				href="https://docs.google.com/document/d/1wVNC5viI2q87nb30MPS2Yuj3hhk6C7shM94OI15SIG0/edit?usp=sharing"
				target="_blank"
				rel="noopener noreferrer"
				class="privacy-link"
			>
				Privacy Policy
			</a>
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
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAudioStore } from '@/shared/stores/audioStore'
import { AudioManager } from '@/game/audio/AudioManager'

const audioStore = useAudioStore()

function toggleSound() {
	audioStore.toggleMute()
}

onMounted(async () => {
	// Initialize AudioManager on start page
	await AudioManager.init()
	// Sync AudioManager with store state
	AudioManager.setEnabled(audioStore.isEnabled)
})

// Pattern positions (pre-computed for consistency and visual balance)
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
.start-page {
	min-height: calc(100dvh + env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px));
	display: flex;
	flex-direction: column;
	position: relative;
	overflow: hidden;
	background: linear-gradient(180deg, #1e1f3a 0%, #2b2f6c 50%, #1e1f3a 100%);
	background-attachment: fixed;
	padding-top: env(safe-area-inset-top, 0px);
	padding-bottom: env(safe-area-inset-bottom, 0px);
	margin-top: calc(-1 * env(safe-area-inset-top, 0px));
	margin-bottom: calc(-1 * env(safe-area-inset-bottom, 0px));

	// Decorative soft shapes in background
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
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		padding: calc(clamp(6rem, 14vw, 8rem) + env(safe-area-inset-top, 0px)) clamp(1.5rem, 5vw, 2.5rem)
			clamp(2rem, 6vw, 4rem);
		gap: 0;
		position: relative;
		z-index: 1;
		min-height: calc(100dvh - 80px);
		max-width: 100%;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
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

// Sound button (top right)
.sound-button {
	position: fixed;
	top: calc(1rem + env(safe-area-inset-top, 0px));
	right: calc(1rem + env(safe-area-inset-right, 0px));
	width: 48px;
	height: 48px;
	border-radius: 14px;
	border: 2px solid rgba(255, 255, 255, 0.25);
	background: rgba(255, 255, 255, 0.12);
	backdrop-filter: blur(12px);
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	touch-action: manipulation;
	z-index: 10;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);

	&:hover {
		background: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.4);
		transform: scale(1.1) rotate(5deg);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
	}

	&:active {
		transform: scale(0.95) rotate(0deg);
	}

	@media (max-width: 480px) {
		width: 44px;
		height: 44px;
		top: calc(0.75rem + env(safe-area-inset-top, 0px));
		right: calc(0.75rem + env(safe-area-inset-right, 0px));
		border-radius: 12px;
	}

	&__icon {
		width: 24px;
		height: 24px;
		color: white;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));

		@media (max-width: 480px) {
			width: 22px;
			height: 22px;
		}
	}
}

// Logo section
.logo-section {
	width: 100%;
	max-width: 400px;
	display: flex;
	justify-content: center;
	align-items: center;
	margin-bottom: clamp(5rem, 6vw, 4rem);
}

.logo {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: clamp(1rem, 3vw, 1.5rem);
	animation: logoFloat 3s ease-in-out infinite;
	width: 100%;

	&__svg {
		width: clamp(90px, 22vw, 130px);
		height: clamp(90px, 22vw, 130px);
		filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.4));
		animation: logoPulse 2s ease-in-out infinite;
	}

	&__title {
		font-size: clamp(1.75rem, 7vw, 2.75rem);
		font-weight: 900;
		color: white;
		text-align: center;
		letter-spacing: -0.02em;
		text-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
		margin: 0;
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI',
			sans-serif;
		line-height: 1.1;
	}
}

@keyframes logoFloat {
	0%,
	100% {
		transform: translateY(0);
	}
	50% {
		transform: translateY(-8px);
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

// Play button container
.play-button-container {
	width: 100%;
	max-width: 420px;
	display: flex;
	justify-content: center;
	margin: clamp(1.5rem, 5vw, 2.5rem) 0;
}

// Play button
.play-button {
	width: 100%;
	padding: clamp(1.25rem, 5vw, 1.75rem) clamp(1.5rem, 5vw, 2.5rem);
	border-radius: clamp(20px, 5vw, 28px);
	border: 2px solid rgba(255, 255, 255, 0.2);
	text-decoration: none;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	touch-action: manipulation;
	position: relative;
	overflow: hidden;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3),
		inset 0 2px 4px rgba(255, 255, 255, 0.2);
	min-height: clamp(70px, 11vw, 90px);
	box-sizing: border-box;
	background: linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #a855f7 100%);
	border-color: rgba(249, 168, 212, 0.4);

	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(
			90deg,
			transparent,
			rgba(255, 255, 255, 0.3),
			transparent
		);
		transition: left 0.5s ease;
	}

	&:hover {
		transform: translateY(-6px) scale(1.02);
		background: linear-gradient(135deg, #f472b6 0%, #e879f9 50%, #c084fc 100%);
		box-shadow: 0 12px 40px rgba(236, 72, 153, 0.5),
			0 6px 20px rgba(0, 0, 0, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.4);
		border-color: rgba(249, 168, 212, 0.6);

		&::before {
			left: 100%;
		}
	}

	&:active {
		transform: translateY(-3px) scale(0.98);
	}

	&__text {
		font-size: clamp(1.375rem, 5vw, 1.875rem);
		font-weight: 800;
		color: white;
		letter-spacing: 0.02em;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		position: relative;
		z-index: 1;
	}
}

// Privacy link
.privacy-link {
	font-size: clamp(1.2rem, 3vw, 0.875rem);
	color: rgba(255, 255, 255, 0.6);
	text-decoration: none;
	transition: all 0.2s ease;
	margin-top: auto;
	padding: clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem);
	position: relative;
	z-index: 1;
	text-align: center;

	&:hover {
		color: rgba(255, 255, 255, 0.9);
		text-decoration: underline;
	}
}

// Decorative pattern overlay
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
