import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

/**
 * Application Bootstrap
 * 
 * Grug say: Start app. Simple. Create app, add stores, add router, mount.
 */

const app = createApp(App)

// Pinia store
const pinia = createPinia()
app.use(pinia)

// Vue Router
app.use(router)

// Mount app
app.mount('#app')

console.log('NATS Dashboard started 🪨')
