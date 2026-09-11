<template>
	<div class="start-page">
		<!-- Hidden container for Pixi canvas (background initialization) -->
		<div
			ref="pixiHostRef"
			class="pixi-host"
			style="
				position: absolute;
				left: -9999px;
				top: 0;
				width: 1px;
				height: 1px;
				overflow: hidden;
			"
		></div>

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
		</div>

		<button class="promo-more" @click="isOtherGames = true">
			Other games
		</button>

		<!-- Privacy policy link - вынесен за пределы content для гарантированной видимости -->
		<a
			href="https://docs.google.com/document/d/1A2E7klBs2qZlUOKxkYb4AbPQCaXbMhP0jQfw9B9DpMc/edit?usp=sharing"
			target="_blank"
			rel="noopener noreferrer"
			class="privacy-link"
		>
			Privacy Policy
		</a>

		<!-- Decorative pattern overlay -->
		<div class="pattern-overlay">
			<div
				class="pattern-overlay__shape"
				v-for="(style, i) in patternStyles"
				:key="i"
				:style="style"
			></div>
		</div>

		<OtherGames v-if="isOtherGames" @close="isOtherGames = false" />
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import OtherGames from '@/components/OtherGames.vue'
import { useAudioStore } from '@/shared/stores/audioStore'
import { AudioManager } from '@/game/audio/AudioManager'
import { PixiService } from '@/pixi/PixiService'
import { useGameStore } from '@/shared/stores/gameStore'

const audioStore = useAudioStore()
const gameStore = useGameStore()
const pixiHostRef = ref<HTMLElement | null>(null)

function toggleSound() {
	audioStore.toggleMute()
}

onMounted(async () => {
	const startTime = performance.now()

	// Initialize AudioManager on start page
	await AudioManager.init()

	// КРИТИЧНО: Инициализируем PixiService на StartPage
	// Это создаст Pixi Application, загрузит текстуры и прогреет GPU в фоне
	if (!pixiHostRef.value) {
		console.error('[StartPage] pixiHostRef not available')
		return
	}

	try {
		const pixiInitStartTime = performance.now()

		// Инициализируем PixiService с базовыми размерами
		// Canvas будет создан и добавлен в DOM в фоне (скрытый)
		await PixiService.init(pixiHostRef.value, {
			width: 320,
			height: 400,
		})

		gameStore.setDiagnostic('pixiInit', performance.now())

		// Текстуры уже загружены и прогреты в PixiService.init()
		gameStore.setAssetsReady(true)
		gameStore.setDiagnostic('assetsLoaded', performance.now())
		gameStore.setTexturesWarmed(true)
		gameStore.setDiagnostic('texturesWarmed', performance.now())
	} catch (error) {
		console.error(
			'[StartPage] onMounted: failed to initialize PixiService',
			error,
		)
		// Продолжаем выполнение - игра попытается инициализировать при старте
	}

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
	})),
)

const isOtherGames = ref(false)
</script>

<style lang="scss" scoped>
.start-page {
	min-height: calc(
		100dvh + env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px)
	);
	display: flex;
	flex-direction: column;
	position: relative;
	overflow-x: hidden;
	overflow-y: auto;
	// Тёмный градиент главного экрана
	background: linear-gradient(160deg, #1e3a8a 0%, #312e81 40%, #4c1d95 100%);
	padding-top: env(safe-area-inset-top, 0px);
	padding-bottom: env(safe-area-inset-bottom, 0px);
	margin-top: calc(-1 * env(safe-area-inset-top, 0px));
	margin-bottom: calc(-1 * env(safe-area-inset-bottom, 0px));

	// Мягкие декоративные блики (приглушённые на тёмном фоне)
	&::before {
		content: '';
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background:
			radial-gradient(
				circle at 15% 20%,
				rgba(100, 150, 255, 0.12) 0%,
				transparent 45%
			),
			radial-gradient(
				circle at 85% 75%,
				rgba(180, 100, 220, 0.1) 0%,
				transparent 45%
			),
			radial-gradient(
				circle at 50% 55%,
				rgba(255, 200, 100, 0.06) 0%,
				transparent 50%
			);
		pointer-events: none;
		z-index: 0;
	}

	&__content {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		padding: calc(clamp(6rem, 14vw, 8rem) + env(safe-area-inset-top, 0px))
			clamp(1.5rem, 5vw, 2.5rem) 0;
		gap: clamp(1.5rem, 5vw, 2.5rem);
		position: relative;
		z-index: 1;
		min-height: 100%;
		max-width: 475px;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
		overflow-y: auto;
		overflow-x: hidden;
		// Добавляем отступ снизу для фиксированной кнопки Privacy Policy
		padding-bottom: calc(
			clamp(6rem, 12vw, 8rem) + clamp(3rem, 6vw, 4rem) +
				env(safe-area-inset-bottom, 0px)
		);
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

// Sound button (top right) - ограничен контейнером 475px
.sound-button {
	position: fixed;
	top: calc(1rem + env(safe-area-inset-top, 0px));
	// Позиционируем относительно правого края контейнера 475px
	// Центр экрана (50%) + половина ширины контейнера (237.5px) - отступ (1rem) - ширина кнопки (48px)
	left: calc(50% + 237.5px - 1rem - 48px);
	width: 48px;
	height: 48px;
	border-radius: 14px;
	border: 2px solid rgba(255, 255, 255, 0.3);
	background: rgba(255, 255, 255, 0.15);
	backdrop-filter: blur(16px);
	-webkit-backdrop-filter: blur(16px);
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	touch-action: manipulation;
	z-index: 10;
	box-shadow:
		0 4px 16px rgba(0, 0, 0, 0.25),
		0 0 0 1px rgba(255, 255, 255, 0.1),
		inset 0 1px 2px rgba(255, 255, 255, 0.2);
	// На маленьких экранах (меньше 475px) используем обычное позиционирование справа
	@media (max-width: 475px) {
		left: auto;
		right: calc(1rem + env(safe-area-inset-right, 0px));
	}

	&:hover {
		background: rgba(255, 255, 255, 0.25);
		border-color: rgba(255, 255, 255, 0.5);
		transform: scale(1.1) rotate(5deg);
		box-shadow:
			0 6px 24px rgba(0, 0, 0, 0.35),
			0 0 0 1px rgba(255, 255, 255, 0.15),
			inset 0 1px 3px rgba(255, 255, 255, 0.3);
	}

	&:active {
		transform: scale(0.95) rotate(0deg);
		box-shadow:
			0 2px 8px rgba(0, 0, 0, 0.25),
			inset 0 1px 2px rgba(255, 255, 255, 0.2);
	}

	@media (max-width: 480px) {
		width: 44px;
		height: 44px;
		top: calc(0.75rem + env(safe-area-inset-top, 0px));
		left: calc(50% + 237.5px - 0.75rem - 44px);
		border-radius: 12px;

		@media (max-width: 475px) {
			left: auto;
			right: calc(0.75rem + env(safe-area-inset-right, 0px));
		}
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
	margin-bottom: clamp(3rem, 6vw, 4rem);
	flex-shrink: 0;
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
	flex-shrink: 0;
}

// Play button – Block Blast hot-pink gradient pill
.play-button {
	width: 70%;
	padding: clamp(1.25rem, 5vw, 1.75rem) clamp(1.5rem, 5vw, 2.5rem);
	border-radius: 24px;
	border: 2px solid rgba(255, 255, 255, 0.35);
	text-decoration: none;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
	touch-action: manipulation;
	position: relative;
	overflow: hidden;
	box-shadow:
		0 8px 36px rgba(255, 79, 176, 0.55),
		inset 0 2px 0 rgba(255, 255, 255, 0.35);
	min-height: clamp(70px, 11vw, 90px);
	box-sizing: border-box;
	background: linear-gradient(135deg, #ff7ad9 0%, #ff4fb0 100%);

	// Gloss sheen on top half
	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 50%;
		background: linear-gradient(
			180deg,
			rgba(255, 255, 255, 0.22) 0%,
			transparent 100%
		);
		border-radius: 22px 22px 0 0;
		pointer-events: none;
	}

	&:hover {
		transform: translateY(-4px) scale(1.03);
		background: linear-gradient(135deg, #ff92e3 0%, #ff6cc4 100%);
		box-shadow:
			0 14px 50px rgba(255, 79, 176, 0.7),
			inset 0 2px 0 rgba(255, 255, 255, 0.4);
	}

	&:active {
		transform: scale(0.95);
		box-shadow: 0 4px 16px rgba(255, 79, 176, 0.4);
	}

	&__text {
		font-size: clamp(1.375rem, 5vw, 1.875rem);
		font-weight: 900;
		color: white;
		letter-spacing: 0.04em;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
		position: relative;
		z-index: 1;
	}
}

// Privacy link - фиксированная позиция снизу экрана для гарантированной видимости
.privacy-link {
	font-size: clamp(1.125rem, 4vw, 1.5rem);
	color: rgba(255, 255, 255, 0.6);
	text-decoration: none;
	transition: all 0.2s ease;
	padding: clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem);
	position: fixed;
	bottom: calc(clamp(0.75rem, 2vw, 1rem) + env(safe-area-inset-bottom, 0px));
	left: 0;
	right: 0;
	z-index: 10;
	text-align: center;
	display: block !important;
	cursor: pointer;
	touch-action: manipulation;
	width: 100%;
	max-width: 100%;
	opacity: 1 !important;
	visibility: visible !important;
	pointer-events: auto !important;
	-webkit-tap-highlight-color: rgba(255, 255, 255, 0.1);
	box-sizing: border-box;
	background: transparent;

	&:hover {
		color: rgba(255, 255, 255, 0.9);
		text-decoration: underline;
	}

	&:active {
		color: rgba(255, 255, 255, 1);
		opacity: 0.8;
	}
}

// Decorative pattern overlay – soft blurred colour blobs
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
		background: rgba(255, 255, 255, 0.08);
		border-radius: 50%;
		animation: patternFloat 18s ease-in-out infinite;

		&:nth-child(odd) {
			animation-duration: 24s;
			animation-direction: reverse;
		}

		&:nth-child(3n) {
			background: rgba(100, 220, 255, 0.07);
		}

		&:nth-child(3n + 1) {
			background: rgba(255, 120, 220, 0.07);
		}

		&:nth-child(3n + 2) {
			background: rgba(255, 210, 80, 0.06);
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

/*
   Кнопка в раздел «Другие игры».

   Прижата к низу так же, как ссылка на политику (.privacy-link): та сделана
   position: fixed, и кнопка в обычном потоке оказывалась под ней и под
   декоративным слоем — нажать её было нельзя. Стоит на 3.5rem выше ссылки,
   тем же столбцом.
*/
.promo-more {
	position: fixed;
	left: 0;
	right: 0;
	bottom: calc(
		clamp(0.75rem, 2vw, 1rem) + env(safe-area-inset-bottom, 0px) + 3.5rem
	);
	z-index: 11;
	width: fit-content;
	margin: 0 auto;
	padding: 10px 20px;
	border: none;
	border-radius: 13px;
	background: linear-gradient(180deg, #9280f7, #6246d6);
	box-shadow: 0 3px 0 #3f2ba0;
	cursor: pointer;
	font-family: inherit;
	font-size: 13px;
	font-weight: 900;
	letter-spacing: 0.8px;
	text-transform: uppercase;
	color: #fff;
}

.promo-more:active {
	transform: translateY(2px);
	box-shadow: 0 1px 0 #3f2ba0;
}
</style>
