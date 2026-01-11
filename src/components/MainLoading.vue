<script lang="ts" setup></script>

<template>
	<div class="loading-overlay">
		<div class="spinner"></div>
	</div>
</template>

<style scoped>
.loading-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	background-color: rgba(0, 0, 0, 0.5); /* затемнение */
	display: flex;
	justify-content: center;
	align-items: center;
	z-index: 9999; /* поверх всего */
	pointer-events: all; /* блокирует события */
}

.spinner {
	width: 60px;
	height: 60px;
	border: 6px solid rgba(255, 255, 255, 0.3);
	border-top-color: white;
	border-radius: 50%;
	animation: spin 1s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
