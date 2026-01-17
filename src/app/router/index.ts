import { createRouter, createWebHistory } from 'vue-router'
import StartPage from '@/pages/StartPage.vue'
import GamePage from '@/pages/GamePage.vue'

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: '/',
			name: 'start',
			component: StartPage,
		},
		{
			path: '/game',
			name: 'game',
			component: GamePage,
		},
	],
})

export default router
