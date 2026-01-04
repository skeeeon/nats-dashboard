<template>
  <div id="app">
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useNatsStore } from '@/stores/nats'
import { useTheme } from '@/composables/useTheme'

/**
 * Root App Component
 * 
 * Grug say: Just container for router. Load settings on start.
 * Also initialize theme.
 */

const natsStore = useNatsStore()
const { theme } = useTheme() // Initialize theme

onMounted(() => {
  // Load NATS settings
  natsStore.loadSettings()
  
  // Try auto-connect if enabled
  natsStore.tryAutoConnect()
})
</script>

<style>
/* Global CSS Variables - Dark Theme (default) */
:root,
:root[data-theme="dark"] {
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

/* Light Theme */
:root[data-theme="light"] {
  --bg: #ffffff;
  --panel: #f6f8fa;
  --border: #d0d7de;
  --input-bg: #ffffff;
  --text: #1f2328;
  --muted: #656d76;
  
  /* Colors - adjusted for light background */
  --primary: #1f883d;
  --primary-hover: #1a7f37;
  --accent: #0969da;
  --danger: #d1242f;
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
  transition: background-color 0.3s ease, color 0.3s ease;
}

#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Scrollbar Styling - Dark theme */
:root[data-theme="dark"] ::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

:root[data-theme="dark"] ::-webkit-scrollbar-track {
  background: transparent;
}

:root[data-theme="dark"] ::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 5px;
  border: 2px solid var(--panel);
}

:root[data-theme="dark"] ::-webkit-scrollbar-thumb:hover {
  background: #484f58;
}

/* Scrollbar Styling - Light theme */
:root[data-theme="light"] ::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

:root[data-theme="light"] ::-webkit-scrollbar-track {
  background: transparent;
}

:root[data-theme="light"] ::-webkit-scrollbar-thumb {
  background: #d0d7de;
  border-radius: 5px;
  border: 2px solid var(--panel);
}

:root[data-theme="light"] ::-webkit-scrollbar-thumb:hover {
  background: #afb8c1;
}
</style>
