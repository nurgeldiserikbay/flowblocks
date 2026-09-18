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

		<!-- Вход в «Другие игры»: левый верхний угол, в одной форме с кнопкой
		     звука в правом. Раздел не должен спорить за внимание с кнопкой Play,
		     поэтому он значок, а не кнопка с подписью. -->
		<button
			class="promo-games"
			aria-label="Other games"
			@click="isOtherGames = true"
		>
			<OtherGamesIcon class="promo-games__icon" />
		</button>

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
					<!--
					   Знак из дизайн-пака. Раньше здесь лежал инлайновый SVG на
					   восемьдесят строк: круг с градиентом и пять кубиков. Он жил
					   отдельно от иконки приложения и от логотипа в сторе, и при любой
					   правке расходился с ними. Теперь знак один и лежит файлом.
					-->
					<LogoMark class="logo__mark" />
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

		<!-- Privacy policy link - вынесен за пределы content для гарантированной видимости -->
		<a
			href="https://docs.google.com/document/d/1A2E7klBs2qZlUOKxkYb4AbPQCaXbMhP0jQfw9B9DpMc/edit?usp=sharing"
			target="_blank"
			rel="noopener noreferrer"
			class="privacy-link"
		>
			Privacy Policy
		</a>

		<OtherGames v-if="isOtherGames" @close="isOtherGames = false" />
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import OtherGames from '@/components/OtherGames.vue'
import OtherGamesIcon from '@/components/OtherGamesIcon.vue'
import LogoMark from '@/assets/ui/logo-mark.svg'
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
	/*
	   Небо — тот же достроенный кадр, что и у #app; почему он достроен, написано
	   там.

	   Медленного дрейфа здесь больше нет. Он двигал кадр по горизонтали, а
	   запаса по ширине теперь нет: кадр и так вписан целиком, и сдвиг открыл бы
	   поле сбоку. Между «кадр целиком» и «кадр шевелится» выбрано первое —
	   обрезанные по краям острова было видно, а дрейф в двенадцать секунд не
	   замечал никто.
	*/
	background-color: var(--c-navy);
	background-image: url('@/assets/img/sky-portrait.webp');
	background-size: cover;
	background-position: bottom center;
	background-repeat: no-repeat;
	padding-top: env(safe-area-inset-top, 0px);
	padding-bottom: env(safe-area-inset-bottom, 0px);
	margin-top: calc(-1 * env(safe-area-inset-top, 0px));
	margin-bottom: calc(-1 * env(safe-area-inset-bottom, 0px));

	/*
	   Здесь лежали три цветных пятна — синее, фиолетовое и золотое. На прежнем
	   плоском градиенте они изображали глубину; на фотографическом небе они
	   только мутят его собственные облака. Осталась лёгкая тёмная виньетка: она
	   прижимает углы, чтобы белая надпись и кнопка не спорили с яркими кубами по
	   краям кадра.
	*/
	&::before {
		content: '';
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: radial-gradient(
			ellipse at 50% 45%,
			transparent 45%,
			rgba(8, 18, 45, 0.38) 100%
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

// Sound button (top right) - ограничен контейнером 475px
.sound-button {
	position: fixed;
	top: calc(1rem + env(safe-area-inset-top, 0px));
	// Позиционируем относительно правого края контейнера 475px
	// Центр экрана (50%) + половина ширины контейнера (237.5px) - отступ (1rem) - ширина кнопки (48px)
	left: calc(50% + 237.5px - 1rem - 44px);
	width: 44px;
	height: 44px;
	border-radius: var(--r-control);
	border: 1px solid var(--c-surface-border);
	background: var(--c-surface);
	backdrop-filter: blur(16px);
	-webkit-backdrop-filter: blur(16px);
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: transform 0.15s ease;
	touch-action: manipulation;
	z-index: 10;
	box-shadow: 0 4px 16px rgba(7, 18, 38, 0.3);
	// На маленьких экранах (меньше 475px) используем обычное позиционирование справа
	@media (max-width: 475px) {
		left: auto;
		right: calc(1rem + env(safe-area-inset-right, 0px));
	}

	&:active {
		transform: scale(0.94);
	}

	@media (max-width: 480px) {
		top: calc(0.75rem + env(safe-area-inset-top, 0px));
		left: calc(50% + 237.5px - 0.75rem - 44px);

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
	// Было три секунды на качок плюс отдельная пульсация знака в две. Вместе они
	// читались как «загрузка», а не как заставка. Осталось одно медленное
	// дыхание.
	animation: logoFloat 9s ease-in-out infinite;
	width: 100%;

	&__mark {
		width: clamp(96px, 24vw, 136px);
		height: clamp(96px, 24vw, 136px);
		filter: drop-shadow(0 10px 26px rgba(7, 18, 38, 0.45));
	}

	&__title {
		font-size: clamp(2rem, 8vw, 3rem);
		font-weight: 400;
		color: var(--c-text);
		text-align: center;
		// Luckiest Guy рисует буквы плотно, отрицательный трекинг слепил бы их.
		letter-spacing: 0.01em;
		text-shadow: 0 4px 16px rgba(7, 18, 38, 0.55);
		margin: 0;
		// Живой текст, а не картинка: слово должно читаться скринридером и
		// перерисовываться под любой размер экрана.
		font-family: 'Luckiest Guy', 'Inter', sans-serif;
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

// Кейфрейм skyDrift удалён вместе с дрейфом: двигать кадр по горизонтали стало
// нечем, он теперь ровно по ширине экрана.

// Play button container
.play-button-container {
	width: 100%;
	max-width: 420px;
	display: flex;
	justify-content: center;
	margin: clamp(1.5rem, 5vw, 2.5rem) 0;
	flex-shrink: 0;
}

/*
   Play.

   Была ядовито-розовая пилюля со свечением на 36px. Розовый — один из восьми
   цветов плиток, и на витрине выходило, что главная кнопка выкрашена в тот же
   цвет, что и игровой элемент: глаз не понимал, это кнопка или блок. Теперь
   синий с переходом в голубой — цвета темы, которых на доске нет.
*/
.play-button {
	width: 70%;
	padding: clamp(1.25rem, 5vw, 1.75rem) clamp(1.5rem, 5vw, 2.5rem);
	border-radius: var(--r-panel);
	border: 1px solid rgba(255, 255, 255, 0.28);
	text-decoration: none;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: transform 0.15s ease;
	touch-action: manipulation;
	position: relative;
	overflow: hidden;
	box-shadow:
		0 10px 28px rgba(7, 18, 38, 0.45),
		inset 0 2px 0 rgba(255, 255, 255, 0.28);
	min-height: clamp(70px, 11vw, 90px);
	box-sizing: border-box;
	background: linear-gradient(135deg, var(--c-blue) 0%, var(--c-cyan) 100%);

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
		border-radius: calc(var(--r-panel) - 2px) calc(var(--r-panel) - 2px) 0 0;
		pointer-events: none;
	}

	&:active {
		transform: scale(0.96);
	}

	&__text {
		font-size: clamp(1.375rem, 5vw, 1.875rem);
		font-weight: 900;
		color: var(--c-text);
		letter-spacing: 0.04em;
		text-shadow: 0 2px 6px rgba(7, 18, 38, 0.4);
		position: relative;
		z-index: 1;
	}
}

// Privacy link - фиксированная позиция снизу экрана для гарантированной видимости
.privacy-link {
	// Была почти с заголовок — clamp(1.125rem, 4vw, 1.5rem), — и на экране с
	// одним фокусом внимания тянула его на себя. Это служебная ссылка.
	font-size: clamp(0.875rem, 3vw, 1rem);
	color: var(--c-text-muted);
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

/*
   Двенадцать круглых пятен, круживших по экрану восемнадцать-двадцать четыре
   секунды каждое, удалены вместе с разметкой. Небо теперь само по себе рисунок с
   облаками и кубами; белые кружки поверх него читались как грязь на стекле, а не
   как украшение. Всё декоративное движение на экране — дрейф самого неба.
*/

@media (prefers-reduced-motion: reduce) {
	.start-page,
	.logo {
		animation: none;
	}
}

/*
   Вход в «Другие игры» — левый верхний угол.

   Раньше кнопка стояла вплотную слева от кнопки звука и обе считали смещение от
   правого края контейнера в 475px. Но у кнопки звука есть правило на узкие
   экраны: ниже 475px она перепривязывается к правому краю самого экрана. У этой
   такого правила не было, и на телефонах кнопка звука наезжала на неё сверху —
   `elementFromPoint` в центре «Других игр» возвращал кнопку звука, то есть тап
   до раздела не доходил вовсе.

   Развести их отступами значило бы повторить ту же связку и ждать следующего
   расхождения. Поэтому кнопки разнесены по разным углам: считать общий край
   больше не нужно, и налезать нечему.
*/
.promo-games {
	position: fixed;
	top: calc(1rem + env(safe-area-inset-top, 0px));
	left: calc(50% - 237.5px + 1rem);
	z-index: 10;
	width: 44px;
	height: 44px;
	border-radius: var(--r-control);
	border: 1px solid var(--c-surface-border);
	background: var(--c-surface);
	backdrop-filter: blur(16px);
	-webkit-backdrop-filter: blur(16px);
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	color: var(--c-text);
	box-shadow: 0 4px 16px rgba(7, 18, 38, 0.3);

	// На узких экранах — к левому краю экрана, зеркально кнопке звука.
	@media (max-width: 475px) {
		left: calc(1rem + env(safe-area-inset-left, 0px));
	}

	@media (max-width: 480px) {
		top: calc(0.75rem + env(safe-area-inset-top, 0px));

		@media (max-width: 475px) {
			left: calc(0.75rem + env(safe-area-inset-left, 0px));
		}
	}
}

.promo-games__icon {
	width: 22px;
	height: 22px;
}

.promo-games:active {
	transform: scale(0.94);
}
</style>
