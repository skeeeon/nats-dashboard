<template>
  <ErrorBoundary>
    <div id="app">
      <!-- Storage error banner -->
      <div v-if="dashboardStore.storageError" class="storage-error-banner">
        <div class="error-content">
          <span class="error-icon">⚠️</span>
          <span class="error-text">{{ dashboardStore.storageError }}</span>
          <button class="dismiss-btn" @click="dashboardStore.clearStorageError()">
            ✕
          </button>
        </div>
      </div>
      
      <!-- Memory warning banner -->
      <div v-if="dataStore.hasMemoryWarning" class="memory-warning-banner">
        <div class="warning-content">
          <span class="warning-icon">⚠️</span>
          <span class="warning-text">{{ dataStore.memoryWarning }}</span>
          <button class="warning-action" @click="dataStore.clearAllBuffers()">
            Clear All Buffers
          </button>
          <button class="dismiss-btn" @click="dataStore.memoryWarning = null">
            ✕
          </button>
        </div>
      </div>
      
      <RouterView />
    </div>
  </ErrorBoundary>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { useWidgetDataStore } from '@/stores/widgetData'
import { useTheme } from '@/composables/useTheme'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'

/**
 * Root App Component
 * 
 * Grug say: Just container for router. Load settings on start.
 * Also initialize theme.
 * 
 * NEW: Now imports design tokens and has warning banners!
 */

const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()
const dataStore = useWidgetDataStore()

// Initialize theme on app load (side effect only, don't need the return value)
useTheme()

onMounted(() => {
  // Load NATS settings
  natsStore.loadSettings()
  
  // Try auto-connect if enabled
  natsStore.tryAutoConnect()
})
</script>

<style>
/* Import design tokens first - these define all theme colors */
@import './styles/design-tokens.css';
@import './styles/forms.css';

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
  display: flex;
  flex-direction: column;
}

/* Error/Warning Banners */
.storage-error-banner,
.memory-warning-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  padding: 12px 16px;
  animation: slideDown 0.3s ease-out;
}

.storage-error-banner {
  background: var(--color-error);
  border-bottom: 2px solid var(--color-error-border);
}

.memory-warning-banner {
  background: var(--color-warning);
  border-bottom: 2px solid var(--color-warning-border);
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.error-content,
.warning-content {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 1200px;
  margin: 0 auto;
  color: white;
}

.error-icon,
.warning-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.error-text,
.warning-text {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
}

.warning-action {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.warning-action:hover {
  background: rgba(255, 255, 255, 0.3);
}

.dismiss-btn {
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.dismiss-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Scrollbar Styling - uses design tokens! */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
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

:root[data-theme="light"] ::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 5px;
  border: 2px solid var(--panel);
}

:root[data-theme="light"] ::-webkit-scrollbar-thumb:hover {
  background: #afb8c1;
}
</style>
