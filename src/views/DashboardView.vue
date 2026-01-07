<template>
  <div class="dashboard-view">
    <!-- Dashboard Sidebar -->
    <DashboardSidebar ref="sidebarRef" />
    
    <!-- Main content area -->
    <div class="dashboard-main">
      <!-- Top toolbar -->
      <div class="dashboard-toolbar">
        <!-- Row 1: Nav | Title | Connection -->
        <div class="toolbar-top-row">
          <button 
            class="hamburger-btn"
            @click="toggleSidebar"
            title="Toggle sidebar (B)"
          >
            ☰
          </button>
          
          <div class="dashboard-title-container">
            <h1 class="dashboard-name">{{ dashboardStore.activeDashboard?.name || 'Dashboard' }}</h1>
            
            <!-- Unified Status Pill -->
            <!-- Priority 1: Remote Update Available -->
            <button
              v-if="dashboardStore.remoteChanged"
              class="badge-shared is-stale"
              @click="handleReloadRemote"
              title="Remote changes detected. Click to Reload."
            >
              Update ↻
            </button>

            <!-- Priority 2: Local Unsaved Changes -->
            <button
              v-else-if="dashboardStore.isDirty"
              class="badge-shared is-dirty"
              @click="handleSave"
              title="Unsaved changes. Click to Save."
            >
              Save ●
            </button>

            <!-- Priority 3: Synced/Shared Read-Only -->
            <span
              v-else-if="dashboardStore.activeDashboard?.storage === 'kv'"
              class="badge-shared"
              title="Dashboard is synced with NATS KV"
            >
              Shared
            </span>
          </div>
          
          <!-- Connection Status (Clickable for Debug) -->
          <button 
            class="connection-status" 
            :class="natsStore.isConnected ? 'connected' : 'disconnected'"
            @click="showDebugPanel = true"
            title="Connection Status"
          >
            <div class="status-dot"></div>
            <span class="status-label">{{ natsStore.isConnected ? 'Connected' : 'Disconnected' }}</span>
            <span v-if="natsStore.isConnected && natsStore.rtt" class="rtt">{{ natsStore.rtt }}ms</span>
          </button>
        </div>
        
        <!-- Row 2: Actions -->
        <div class="toolbar-actions">
          <!-- Lock Toggle -->
          <button 
            class="btn-icon" 
            :title="dashboardStore.isLocked ? 'Unlock (U)' : 'Lock (L)'"
            @click="dashboardStore.toggleLock()"
            :class="{ 'lock-active': dashboardStore.isLocked }"
          >
            {{ dashboardStore.isLocked ? '🔒' : '🔓' }}
          </button>

          <!-- Theme Toggle -->
          <button 
            class="btn-icon" 
            title="Toggle Theme"
            @click="toggleTheme"
          >
            {{ theme === 'dark' ? '☀️' : '🌙' }}
          </button>
          
          <!-- Add Widget -->
          <button 
            v-if="!dashboardStore.isLocked"
            class="btn-primary" 
            @click="showAddWidget = true" 
            title="Add Widget (N)"
          >
            <span class="btn-icon-only">+</span>
            <span class="btn-text">Add Widget</span>
          </button>
          
          <!-- Settings -->
          <button class="btn-secondary" @click="$router.push('/settings')" title="Settings">
            <span class="btn-icon-only">⚙️</span>
            <span class="btn-text">Settings</span>
          </button>
        </div>
      </div>
      
      <!-- Grid with widgets -->
      <!-- Quick Win B: Add is-offline class to gray out stale data -->
      <div class="dashboard-content" :class="{ 'is-offline': !natsStore.isConnected }">
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
          <div class="no-widgets-hint">
            <template v-if="!dashboardStore.isLocked">Click "+ Add Widget" to get started</template>
            <template v-else>Dashboard is locked. Unlock (U) to add widgets.</template>
          </div>
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
          <!-- MapWidget gets isFullscreen prop to use unique container ID -->
          <component
            v-else-if="fullScreenWidget.type === 'map'"
            :is="MapWidget"
            :config="fullScreenWidget"
            :is-fullscreen="true"
          />
        </div>
        <div class="fullscreen-hint">
          Press <kbd>Esc</kbd> to exit full screen
        </div>
      </div>
    </div>
    
    <!-- Global Widget Action Confirmation Dialog -->
    <ConfirmDialog
      v-model="confirmState.show"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-text="confirmState.confirmText"
      variant="warning"
      @confirm="handleGlobalConfirm"
    />
    
    <!-- Debug Panel (Now controlled by prop) -->
    <DebugPanel v-model="showDebugPanel" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick, provide } from 'vue'
import { useRouter } from 'vue-router'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { useTheme } from '@/composables/useTheme'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useWidgetOperations } from '@/composables/useWidgetOperations'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar.vue'
import DashboardGrid from '@/components/dashboard/DashboardGrid.vue'
import AddWidgetModal from '@/components/dashboard/AddWidgetModal.vue'
import ConfigureWidgetModal from '@/components/dashboard/ConfigureWidgetModal.vue'
import KeyboardShortcutsModal from '@/components/common/KeyboardShortcutsModal.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DebugPanel from '@/components/common/DebugPanel.vue'
import TextWidget from '@/components/widgets/TextWidget.vue'
import ChartWidget from '@/components/widgets/ChartWidget.vue'
import ButtonWidget from '@/components/widgets/ButtonWidget.vue'
import KvWidget from '@/components/widgets/KvWidget.vue'
import SwitchWidget from '@/components/widgets/SwitchWidget.vue'
import SliderWidget from '@/components/widgets/SliderWidget.vue'
import StatCardWidget from '@/components/widgets/StatCardWidget.vue'
import GaugeWidget from '@/components/widgets/GaugeWidget.vue'
import MapWidget from '@/components/widgets/MapWidget.vue'
import type { WidgetType } from '@/types/dashboard'

const router = useRouter()
const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()
const { theme, toggleTheme } = useTheme()

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
const showDebugPanel = ref(false)
const configWidgetId = ref<string | null>(null)

// Fullscreen state
const fullScreenWidgetId = ref<string | null>(null)
const fullScreenWidget = computed(() => {
  if (!fullScreenWidgetId.value) return null
  return dashboardStore.getWidget(fullScreenWidgetId.value)
})

// --- Global Confirmation Logic ---
const confirmState = ref({
  show: false,
  title: 'Confirm Action',
  message: 'Are you sure?',
  confirmText: 'Confirm',
  onConfirm: null as (() => void) | null
})

function requestConfirm(title: string, message: string, onConfirm: () => void, confirmText = 'Confirm') {
  confirmState.value = {
    show: true,
    title,
    message,
    confirmText,
    onConfirm
  }
}

function handleGlobalConfirm() {
  if (confirmState.value.onConfirm) {
    confirmState.value.onConfirm()
  }
  confirmState.value.show = false
}

provide('requestConfirm', requestConfirm)

function toggleSidebar() {
  if (sidebarRef.value) {
    sidebarRef.value.toggleSidebar()
  }
}

function handleCreateWidget(type: WidgetType) {
  createWidget(type)
}

function handleDeleteWidget(widgetId: string) {
  deleteWidget(widgetId)
}

function handleDuplicateWidget(widgetId: string) {
  duplicateWidget(widgetId)
}

function handleConfigureWidget(widgetId: string) {
  configWidgetId.value = widgetId
  showConfigWidget.value = true
}

function handleWidgetConfigSaved() {
  showConfigWidget.value = false
}

function toggleFullScreen(widgetId: string) {
  fullScreenWidgetId.value = fullScreenWidgetId.value === widgetId ? null : widgetId
}

function exitFullScreen() {
  fullScreenWidgetId.value = null
}

function handleShowShortcuts() {
  showShortcutsModal.value = true
}

function handleSave() {
  if (dashboardStore.activeDashboard?.storage === 'kv') {
    dashboardStore.saveRemoteDashboard()
  } else {
    dashboardStore.saveToStorage()
  }
}

function handleReloadRemote() {
  if (dashboardStore.isDirty) {
    requestConfirm(
      'Discard Changes?',
      'Reloading will discard your unsaved changes. Continue?',
      () => {
        if (dashboardStore.activeDashboard?.kvKey) {
          dashboardStore.loadRemoteDashboard(dashboardStore.activeDashboard.kvKey)
        }
      },
      'Reload'
    )
  } else {
    if (dashboardStore.activeDashboard?.kvKey) {
      dashboardStore.loadRemoteDashboard(dashboardStore.activeDashboard.kvKey)
    }
  }
}

const { shortcuts } = useKeyboardShortcuts([
  { 
    key: 's', 
    description: 'Save Dashboard', 
    handler: () => {
      handleSave()
      console.log('Dashboard saved via shortcut')
    } 
  },
  { 
    key: 'n', 
    description: 'Add New Widget', 
    handler: () => {
      if (!dashboardStore.isLocked) {
        showAddWidget.value = true 
      }
    }
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
    key: 'l', 
    description: 'Lock Dashboard', 
    handler: () => {
      if (!dashboardStore.isLocked) {
        dashboardStore.toggleLock()
      }
    } 
  },
  { 
    key: 'u', 
    description: 'Unlock Dashboard', 
    handler: () => {
      if (dashboardStore.isLocked) {
        dashboardStore.toggleLock()
      }
    } 
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
        showDebugPanel.value = false
      }
    }
  }
])

onMounted(() => {
  dashboardStore.loadFromStorage()
  window.addEventListener('show-shortcuts-help', handleShowShortcuts)
  
  if (!natsStore.isConnected && !natsStore.autoConnect) {
    const hasSettings = natsStore.serverUrls.length > 0 || natsStore.getStoredCreds() !== null
    if (!hasSettings) router.push('/settings')
  }
  
  if (natsStore.isConnected) {
    subscribeAllWidgets()
  }
})

onUnmounted(() => {
  // Disconnect on unmount, but don't clear data immediately if just navigating
  unsubscribeAllWidgets(false)
  window.removeEventListener('show-shortcuts-help', handleShowShortcuts)
})

watch(() => natsStore.isConnected, (connected) => {
  if (connected) {
    subscribeAllWidgets()
  } else {
    // Quick Win B: Don't clear buffers. Keep stale data visible.
    // Pass true to keep buffer data
    unsubscribeAllWidgets(true) 
  }
})

watch(() => dashboardStore.activeDashboardId, async () => {
  // Switching dashboards always clears data of old dashboard
  unsubscribeAllWidgets(false)
  await nextTick()
  if (natsStore.isConnected) {
    subscribeAllWidgets()
  }
})

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

.dashboard-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.dashboard-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 12px;
}

/* Desktop Layout: Everything in one row */
.toolbar-top-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 1;
}

.toolbar-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

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

.dashboard-title-container {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dashboard-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Shared/Save Badge */
.badge-shared {
  font-size: 10px;
  background: var(--color-info-bg);
  color: var(--color-info);
  padding: 2px 8px;
  border: 1px solid var(--color-info-border);
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
  cursor: default;
  transition: all 0.3s ease;
  font-weight: 600;
  white-space: nowrap;
}

/* Dirty State (Orange) */
.badge-shared.is-dirty {
  background: var(--color-warning);
  color: white;
  border-color: var(--color-warning);
  cursor: pointer;
  animation: pulse-badge 2s infinite;
}

/* Stale State (Update Available - Purple/Accent) */
.badge-shared.is-stale {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
  cursor: pointer;
  animation: pulse-badge 2s infinite;
}

.badge-shared.is-dirty:hover,
.badge-shared.is-stale:hover {
  transform: scale(1.05);
}

@keyframes pulse-badge {
  0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }
  70% { box-shadow: 0 0 0 4px rgba(255, 255, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
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
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  color: inherit;
}

.connection-status:hover {
  filter: brightness(1.1);
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

.lock-active {
  background: rgba(210, 153, 34, 0.2);
  border: 1px solid var(--color-warning);
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

.remote-update-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--color-info-bg);
  border: 1px solid var(--color-info-border);
  border-radius: 4px;
  color: var(--color-info);
  font-size: 12px;
  font-weight: 600;
}

.btn-link {
  background: none;
  border: none;
  text-decoration: underline;
  color: inherit;
  cursor: pointer;
  font-weight: bold;
  padding: 0;
}

.dashboard-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  transition: filter 0.3s ease;
}

/* Quick Win B: Visual indicator for stale state */
.dashboard-content.is-offline {
  filter: grayscale(0.8) opacity(0.7);
  pointer-events: none; /* Prevent interaction with stale widgets to avoid confusion */
  cursor: not-allowed;
}

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

/* ==========================================================================
   MOBILE LAYOUT (< 600px)
   ========================================================================== */
@media (max-width: 600px) {
  .dashboard-toolbar {
    flex-direction: column;
    align-items: stretch;
    padding: 12px;
    gap: 12px;
  }

  /* Row 1: Nav | Title | Connection */
  .toolbar-top-row {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
  }

  .dashboard-title-container {
    justify-self: center;
    justify-content: center;
  }

  .dashboard-name {
    font-size: 16px;
  }

  /* Compact Connection Status (Dot only) */
  .connection-status {
    padding: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    justify-content: center;
  }

  .status-dot { margin: 0; }
  .status-label, .rtt { display: none; }

  /* Row 2: Actions Grid */
  .toolbar-actions {
    width: 100%;
    display: grid;
    /* Create equal width columns for actions */
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: 8px;
  }

  /* Bigger Touch Targets for Mobile */
  .btn-icon, .btn-primary, .btn-secondary {
    height: 44px;
    padding: 0;
    width: 100%;
    justify-content: center;
  }

  /* Hide text labels on mobile actions to save space */
  .btn-text { display: none; }
  .btn-icon-only { 
    display: inline-block; 
    font-size: 18px;
    font-weight: bold;
  }
  
  /* Ensure hamburger is touch-friendly */
  .hamburger-btn {
    width: 36px;
    height: 36px;
  }
}
</style>
