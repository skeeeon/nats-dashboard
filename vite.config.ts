import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
  },
  optimizeDeps: {
    include: [
      'echarts',
      'vue-echarts',
      'jsonpath-plus',
      '@nats-io/nats-core',
      '@nats-io/jetstream',
      '@nats-io/kv'
    ]
  }
})
