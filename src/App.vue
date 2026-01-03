<template>
  <div id="app">
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useNatsStore } from '@/stores/nats'

/**
 * Root App Component
 * 
 * Grug say: Just container for router. Load settings on start.
 */

const natsStore = useNatsStore()

onMounted(() => {
  // Load NATS settings
  natsStore.loadSettings()
  
  // Try auto-connect if enabled
  natsStore.tryAutoConnect()
})
</script>

<style>
/* Global CSS Variables */
:root {
  --bg: #0a0a0a;
  --panel: #161616;
  --border: #333;
  --input-bg: #050505;
  --text: #e0e0e0;
  --muted: #888;
  
  /* Colors */
  --primary: #3fb950;
  --primary-hover: #2ea043;
  --accent: #58a6ff;
  --danger: #f85149;
  
  /* Fonts */
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

/* Global Resets */
*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Scrollbar Styling */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 5px;
  border: 2px solid var(--panel);
}

::-webkit-scrollbar-thumb:hover {
  background: #484f58;
}
</style>
