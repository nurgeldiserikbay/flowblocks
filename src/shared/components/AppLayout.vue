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

	/*
	   Затемнение неба под игрой.

	   Здесь было три цветных радиальных пятна — синее, фиолетовое и розовое, по
	   30% каждое, — и они перекрашивали весь экран. На доске из восьми цветов
	   это читалось как грязь: розовые плитки стояли в розовом пятне, синие в
	   синем, и разница между ними падала.

	   Теперь ровно один слой навигацкого синего. Задача у него не украшать, а
	   увести небо на шаг назад. Ставится только здесь, то есть только в партии:
	   на стартовой странице небо показывается как есть.

	   Плотность 10%, а не 18%, как в брифе. Восемнадцать процентов считались от
	   прежней светлой подложки; поверх тёмного неба они уводили в минус всю
	   картинку — замер показал по зоне поля −10% яркости против старой версии
	   при выросшей насыщенности, и это читалось именно как «тускло». Читаемости
	   цифр слой не добавляет вовсе: цифры лежат на непрозрачных плитках, а слой
	   под ними.
	*/
	&::before {
		content: '';
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(8, 18, 45, 0.1);
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
