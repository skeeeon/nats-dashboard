<template>
  <div class="dashboard-view">
    <!-- Dashboard Sidebar -->
    <DashboardSidebar ref="sidebarRef" />
    
    <!-- Main content area -->
    <div class="dashboard-main">
      <!-- Top toolbar -->
      <div class="dashboard-toolbar">
        <div class="toolbar-left">
          <!-- Hamburger menu (always visible) -->
          <button 
            class="hamburger-btn"
            @click="toggleSidebar"
            title="Toggle sidebar (B)"
          >
            ☰
          </button>
          
          <h1 class="dashboard-name">
            {{ dashboardStore.activeDashboard?.name || 'Dashboard' }}
          </h1>
          
          <!-- Connection Status -->
          <div v-if="natsStore.isConnected" class="connection-status connected">
            <div class="status-dot"></div>
            <span class="status-label">Connected</span>
            <span v-if="natsStore.rtt" class="rtt">{{ natsStore.rtt }}ms</span>
          </div>
          <div v-else class="connection-status disconnected">
            <div class="status-dot"></div>
            <span class="status-label">Disconnected</span>
          </div>
        </div>
        
        <div class="toolbar-right">
          <!-- Theme Toggle -->
          <button 
            class="btn-icon" 
            :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`"
            @click="toggleTheme"
          >
            {{ theme === 'dark' ? '☀️' : '🌙' }}
          </button>
          
          <!-- Add Widget -->
          <button class="btn-primary" @click="showAddWidget = true" title="Add Widget (N)">
            <span class="btn-text">+ Add Widget</span>
            <span class="btn-icon-only">+</span>
          </button>
          
          <!-- Settings -->
          <button class="btn-secondary" @click="$router.push('/settings')" title="Settings">
            <span class="btn-text">⚙️ Settings</span>
            <span class="btn-icon-only">⚙️</span>
          </button>
        </div>
      </div>
      
      <!-- Grid with widgets -->
      <div class="dashboard-content">
        <DashboardGrid
          v-if="dashboardStore.activeWidgets.length > 0"
          :widgets="dashboardStore.activeWidgets"
          @delete-widget="handleDeleteWidget"
          @configure-widget="handleConfigureWidget"
          @duplicate-widget="handleDuplicateWidget"
          @fullscreen-widget="toggleFullScreen"
        />
        <div v-else class="no-widgets-state">
          <div class="no-widgets-icon">📊</div>
          <div class="no-widgets-text">No widgets in this dashboard</div>
          <div class="no-widgets-hint">Click "+ Add Widget" to get started</div>
        </div>
      </div>
    </div>
    
    <!-- Add Widget Modal -->
    <AddWidgetModal
      v-model="showAddWidget"
      @select="handleCreateWidget"
    />
    
    <!-- Configure Widget Modal -->
    <ConfigureWidgetModal
      v-model="showConfigWidget"
      :widget-id="configWidgetId"
      @saved="handleWidgetConfigSaved"
    />

    <!-- Keyboard Shortcuts Modal -->
    <KeyboardShortcutsModal 
      v-model="showShortcutsModal" 
      :shortcuts="shortcuts" 
    />
    
    <!-- Full-Screen Widget Modal -->
    <div v-if="fullScreenWidgetId && fullScreenWidget" class="fullscreen-modal" @click.self="exitFullScreen">
      <div class="fullscreen-container">
        <div class="fullscreen-header">
          <div class="fullscreen-title">{{ fullScreenWidget.title }}</div>
          <button class="close-btn" title="Exit full screen (Esc)" @click="exitFullScreen">✕</button>
        </div>
        <div class="fullscreen-body">
          <component
            v-if="fullScreenWidget.type === 'text'"
            :is="TextWidget"
            :config="fullScreenWidget"
          />
          <component
            v-else-if="fullScreenWidget.type === 'chart'"
            :is="ChartWidget"
            :config="fullScreenWidget"
          />
          <component
            v-else-if="fullScreenWidget.type === 'button'"
            :is="ButtonWidget"
            :config="fullScreenWidget"
          />
          <component
            v-else-if="fullScreenWidget.type === 'kv'"
            :is="KvWidget"
            :config="fullScreenWidget"
          />
          <component
            v-else-if="fullScreenWidget.type === 'switch'"
            :is="SwitchWidget"
            :config="fullScreenWidget"
          />
          <component
            v-else-if="fullScreenWidget.type === 'slider'"
            :is="SliderWidget"
            :config="fullScreenWidget"
          />
          <component
            v-else-if="fullScreenWidget.type === 'stat'"
            :is="StatCardWidget"
            :config="fullScreenWidget"
          />
          <component
            v-else-if="fullScreenWidget.type === 'gauge'"
            :is="GaugeWidget"
            :config="fullScreenWidget"
          />
        </div>
        <div class="fullscreen-hint">
          Press <kbd>Esc</kbd> to exit full screen
        </div>
      </div>
    </div>
    
    <!-- Debug Panel -->
    <DebugPanel />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { useWidgetDataStore } from '@/stores/widgetData'
import { useTheme } from '@/composables/useTheme'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useWidgetOperations } from '@/composables/useWidgetOperations'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar.vue'
import DashboardGrid from '@/components/dashboard/DashboardGrid.vue'
import AddWidgetModal from '@/components/dashboard/AddWidgetModal.vue'
import ConfigureWidgetModal from '@/components/dashboard/ConfigureWidgetModal.vue'
import KeyboardShortcutsModal from '@/components/common/KeyboardShortcutsModal.vue'
import DebugPanel from '@/components/common/DebugPanel.vue'
import TextWidget from '@/components/widgets/TextWidget.vue'
import ChartWidget from '@/components/widgets/ChartWidget.vue'
import ButtonWidget from '@/components/widgets/ButtonWidget.vue'
import KvWidget from '@/components/widgets/KvWidget.vue'
import SwitchWidget from '@/components/widgets/SwitchWidget.vue'
import SliderWidget from '@/components/widgets/SliderWidget.vue'
import StatCardWidget from '@/components/widgets/StatCardWidget.vue'
import GaugeWidget from '@/components/widgets/GaugeWidget.vue'
import type { WidgetType } from '@/types/dashboard'

/**
 * Dashboard View
 * 
 * Orchestrates the main dashboard layout, modals, and widget interactions.
 */

const router = useRouter()
const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()
const dataStore = useWidgetDataStore()
const { theme, toggleTheme } = useTheme()

// Widget operations composable
const {
  subscribeWidget,
  subscribeAllWidgets,
  unsubscribeAllWidgets,
  createWidget,
  deleteWidget,
  duplicateWidget,
} = useWidgetOperations()

const sidebarRef = ref<InstanceType<typeof DashboardSidebar> | null>(null)

// Modal states
const showAddWidget = ref(false)
const showConfigWidget = ref(false)
const showShortcutsModal = ref(false)
const configWidgetId = ref<string | null>(null)

// Fullscreen state
const fullScreenWidgetId = ref<string | null>(null)
const fullScreenWidget = computed(() => {
  if (!fullScreenWidgetId.value) return null
  return dashboardStore.getWidget(fullScreenWidgetId.value)
})

/**
 * Toggle sidebar (for hamburger menu)
 */
function toggleSidebar() {
  if (sidebarRef.value) {
    sidebarRef.value.toggleSidebar()
  }
}

/**
 * Handle widget creation from modal
 */
function handleCreateWidget(type: WidgetType) {
  createWidget(type)
}

/**
 * Handle widget deletion
 */
function handleDeleteWidget(widgetId: string) {
  deleteWidget(widgetId)
}

/**
 * Handle widget duplication
 */
function handleDuplicateWidget(widgetId: string) {
  duplicateWidget(widgetId)
}

/**
 * Handle widget configuration
 */
function handleConfigureWidget(widgetId: string) {
  configWidgetId.value = widgetId
  showConfigWidget.value = true
}

/**
 * Handle widget config saved
 * Resubscribe widget with new config
 */
function handleWidgetConfigSaved() {
  showConfigWidget.value = false
}

/**
 * Toggle fullscreen for widget
 */
function toggleFullScreen(widgetId: string) {
  fullScreenWidgetId.value = fullScreenWidgetId.value === widgetId ? null : widgetId
}

/**
 * Exit fullscreen
 */
function exitFullScreen() {
  fullScreenWidgetId.value = null
}

/**
 * Handle global help shortcut event
 */
function handleShowShortcuts() {
  showShortcutsModal.value = true
}

/**
 * Setup keyboard shortcuts
 * Grug say: Simple keys. No modifiers.
 */
const { shortcuts } = useKeyboardShortcuts([
  { 
    key: 's', 
    description: 'Save Dashboard', 
    handler: () => {
      dashboardStore.saveToStorage()
      // Optional: Show a toast notification here
      console.log('Dashboard saved via shortcut')
    } 
  },
  { 
    key: 'n', 
    description: 'Add New Widget', 
    handler: () => showAddWidget.value = true 
  },
  { 
    key: 't', 
    description: 'New Dashboard', 
    handler: () => {
      const name = prompt('Dashboard name:', 'New Dashboard')
      if (name) dashboardStore.createDashboard(name)
    }
  },
  { 
    key: 'b', 
    description: 'Toggle Sidebar', 
    handler: toggleSidebar 
  },
  { 
    key: 'Escape', 
    description: 'Close Modals / Exit Full Screen', 
    handler: () => {
      if (fullScreenWidgetId.value) exitFullScreen()
      else {
        showConfigWidget.value = false
        showAddWidget.value = false
        showShortcutsModal.value = false
      }
    }
  }
])

/**
 * Lifecycle: Mount
 */
onMounted(() => {
  dashboardStore.loadFromStorage()
  
  // Listen for the '?' key event dispatched by the composable
  window.addEventListener('show-shortcuts-help', handleShowShortcuts)
  
  // Redirect to settings if not connected and no saved settings
  if (!natsStore.isConnected && !natsStore.autoConnect) {
    const hasSettings = natsStore.serverUrls.length > 0 || natsStore.getStoredCreds() !== null
    if (!hasSettings) router.push('/settings')
  }
  
  // Subscribe to widgets if already connected
  if (natsStore.isConnected) {
    subscribeAllWidgets()
  }
})

/**
 * Lifecycle: Unmount
 */
onUnmounted(() => {
  unsubscribeAllWidgets()
  window.removeEventListener('show-shortcuts-help', handleShowShortcuts)
})

/**
 * Watch: Connection changes
 */
watch(() => natsStore.isConnected, (connected) => {
  if (connected) {
    subscribeAllWidgets()
  } else {
    unsubscribeAllWidgets()
    dataStore.clearAllBuffers()
  }
})

/**
 * Watch: Dashboard switches
 * Unsubscribe old widgets, subscribe new ones
 */
watch(() => dashboardStore.activeDashboardId, async () => {
  unsubscribeAllWidgets()
  
  // Wait for Vue to finish updating the DOM
  await nextTick()
  
  if (natsStore.isConnected) {
    subscribeAllWidgets()
  }
})

/**
 * Watch: New widgets added
 * Subscribe newly added widgets
 */
watch(() => dashboardStore.activeWidgets.length, (newCount, oldCount) => {
  if (natsStore.isConnected && newCount > oldCount) {
    const newWidget = dashboardStore.activeWidgets[newCount - 1]
    subscribeWidget(newWidget.id)
  }
})
</script>

<style scoped>
.dashboard-view {
  height: 100vh;
  display: flex;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
}

/* Main content area (flexes to fill space after sidebar) */
.dashboard-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* Allow flex shrinking */
  overflow: hidden;
}

/* Toolbar */
.dashboard-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* Hamburger menu (always visible) */
.hamburger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.hamburger-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--color-accent);
}

.dashboard-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}

/* Connection Status */
.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  border: 2px solid;
  white-space: nowrap;
}

.connection-status.connected {
  background: var(--color-success-bg);
  border-color: var(--color-success-border);
  color: var(--connection-connected);
}

.connection-status.disconnected {
  background: var(--color-error-bg);
  border-color: var(--color-error-border);
  color: var(--connection-disconnected);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.rtt {
  margin-left: 4px;
  color: var(--muted);
  font-size: 11px;
}

/* Buttons */
.btn-primary,
.btn-secondary,
.btn-icon {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

.btn-icon {
  padding: 8px 12px;
  font-size: 18px;
  background: rgba(255, 255, 255, 0.1);
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: scale(1.1);
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Content */
.dashboard-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

/* No widgets state */
.no-widgets-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  padding: 40px;
}

.no-widgets-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.no-widgets-text {
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text);
}

.no-widgets-hint {
  font-size: 14px;
}

/* Fullscreen Modal */
.fullscreen-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg);
  z-index: 2000;
  display: flex;
  flex-direction: column;
}

.fullscreen-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.fullscreen-header {
  display: flex;
  justify-content: space-between;
  padding: 20px 32px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.fullscreen-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
}

.close-btn {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 24px;
  cursor: pointer;
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--text);
}

.fullscreen-body {
  flex: 1;
  padding: 32px;
  overflow: auto;
}

.fullscreen-hint {
  padding: 12px;
  text-align: center;
  color: var(--muted);
  background: var(--panel);
  border-top: 1px solid var(--border);
}

.fullscreen-hint kbd {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 12px;
}

/* Responsive Media Queries */
.btn-text {
  display: inline;
}

.btn-icon-only {
  display: none;
}

@media (max-width: 900px) {
  .dashboard-toolbar {
    padding: 12px 16px;
  }
}

@media (max-width: 600px) {
  .dashboard-toolbar {
    flex-direction: column;
    align-items: stretch;
    padding: 12px;
  }

  .toolbar-left {
    justify-content: space-between;
    width: 100%;
    margin-bottom: 8px;
  }

  .toolbar-right {
    justify-content: space-between;
    width: 100%;
  }

  .btn-primary,
  .btn-secondary,
  .btn-icon {
    flex: 1;
  }
}

@media (max-width: 400px) {
  .btn-text {
    display: none;
  }

  .btn-icon-only {
    display: inline;
    font-size: 16px;
    font-weight: bold;
  }

  .rtt {
    display: none;
  }

  .status-label {
    font-size: 12px;
  }
}
</style>
