<template>
  <div class="map-widget">
    <!-- Map container -->
    <div 
      :id="mapContainerId" 
      class="map-container"
    />
    
    <!-- Loading overlay -->
    <div v-if="!mapReady" class="map-loading">
      <div class="loading-spinner"></div>
      <span>Loading map...</span>
    </div>
    
    <!-- No markers hint -->
    <div v-if="mapReady && markers.length === 0" class="no-markers-hint">
      <span class="hint-icon">📍</span>
      <span class="hint-text">No markers configured</span>
    </div>
    
    <!-- Disconnected indicator -->
    <div v-if="!natsStore.isConnected && hasActions" class="disconnected-badge">
      ⚠️ Offline
    </div>
    
    <!-- Action feedback toast -->
    <div 
      v-if="actionFeedback" 
      class="action-feedback"
      :class="actionFeedback.type"
    >
      {{ actionFeedback.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useLeafletMap, type PopupCallbacks } from '@/composables/useLeafletMap'
import { createSwitchState, type SwitchState } from '@/composables/useSwitchState'
import { useNatsStore } from '@/stores/nats'
import { useTheme } from '@/composables/useTheme'
import { encodeString } from '@/utils/encoding'
import type { WidgetConfig, MapMarkerAction } from '@/types/dashboard'

/**
 * Map Widget
 * 
 * Grug say: Show map with markers. Click marker, see popup with actions.
 * Actions can be publish (fire-and-forget) or switch (stateful toggle).
 * 
 * Fixed: Proper watch cleanup for switch states.
 */

const props = withDefaults(defineProps<{
  config: WidgetConfig
  isFullscreen?: boolean
}>(), {
  isFullscreen: false
})

const natsStore = useNatsStore()
const { theme } = useTheme()
const { initMap, updateTheme, renderMarkers, updateSwitchState, invalidateSize, cleanup } = useLeafletMap()

// Unique ID - include fullscreen suffix to avoid container collision
const mapContainerId = computed(() => {
  const suffix = props.isFullscreen ? '-fullscreen' : ''
  return `map-${props.config.id}${suffix}`
})

const mapReady = ref(false)

// Action feedback state
const actionFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null)

// Track active switch states for each action (keyed by action ID)
interface SwitchStateEntry {
  switchState: SwitchState
  stopWatch: () => void  // Store the watch cleanup function
}
const activeSwitchStates = new Map<string, SwitchStateEntry>()

// Track which marker popup is currently open
const openMarkerId = ref<string | null>(null)

// Get markers from config
const markers = computed(() => props.config.mapConfig?.markers || [])

// Check if any markers have actions
const hasActions = computed(() => 
  markers.value.some(m => m.actions && m.actions.length > 0)
)

// Map config
const mapCenter = computed(() => 
  props.config.mapConfig?.center || { lat: 39.8283, lon: -98.5795 }
)
const mapZoom = computed(() => props.config.mapConfig?.zoom || 4)

/**
 * Handle publish action click
 */
function handlePublishAction(action: MapMarkerAction) {
  if (!natsStore.nc || !natsStore.isConnected) {
    showFeedback('error', 'Not connected to NATS')
    return
  }

  if (!action.subject) {
    showFeedback('error', 'No subject configured')
    return
  }

  try {
    const payload = encodeString(action.payload || '{}')
    natsStore.nc.publish(action.subject, payload)
    
    showFeedback('success', `Published to ${action.subject}`)
    console.log(`[MapWidget] Published to ${action.subject}`)
  } catch (err: any) {
    console.error('[MapWidget] Publish error:', err)
    showFeedback('error', 'Failed to publish')
  }
}

/**
 * Handle switch toggle click
 */
function handleSwitchToggle(action: MapMarkerAction) {
  if (!natsStore.isConnected) {
    showFeedback('error', 'Not connected to NATS')
    return
  }

  const entry = activeSwitchStates.get(action.id)
  if (!entry) {
    console.warn('[MapWidget] No switch state found for action:', action.id)
    return
  }

  // Toggle the switch
  entry.switchState.toggle()
}

/**
 * Handle popup open - start switch state watchers
 */
function handlePopupOpen(markerId: string, popupElement: HTMLElement) {
  console.log('[MapWidget] Popup opened for marker:', markerId)
  openMarkerId.value = markerId

  // Find the marker
  const marker = markers.value.find(m => m.id === markerId)
  if (!marker) return

  // Start switch state watchers for all switch actions
  for (const action of marker.actions) {
    if (action.type === 'switch' && action.switchConfig) {
      startSwitchStateWatcher(action)
    }
  }
}

/**
 * Handle popup close - stop switch state watchers
 */
function handlePopupClose(markerId: string) {
  console.log('[MapWidget] Popup closed for marker:', markerId)
  openMarkerId.value = null

  // Find the marker and stop all its switch watchers
  const marker = markers.value.find(m => m.id === markerId)
  if (!marker) return

  for (const action of marker.actions) {
    if (action.type === 'switch') {
      stopSwitchStateWatcher(action.id)
    }
  }
}

/**
 * Start a switch state watcher for an action
 */
async function startSwitchStateWatcher(action: MapMarkerAction) {
  if (!action.switchConfig) return

  // Don't start if already active
  if (activeSwitchStates.has(action.id)) {
    const existing = activeSwitchStates.get(action.id)!
    if (existing.switchState.isActive()) return
  }

  // Create switch state instance
  const switchState = createSwitchState({
    mode: action.switchConfig.mode,
    kvBucket: action.switchConfig.kvBucket,
    kvKey: action.switchConfig.kvKey,
    publishSubject: action.switchConfig.publishSubject,
    stateSubject: action.switchConfig.stateSubject,
    onPayload: action.switchConfig.onPayload,
    offPayload: action.switchConfig.offPayload,
    defaultState: 'off'
  })

  // Start watching
  await switchState.start()

  // Update UI immediately with current state
  updateSwitchState(
    action.id,
    switchState.state.value,
    action.switchConfig.labels
  )

  // Watch for state changes and update popup UI
  // Store the stop function so we can clean up properly
  const stopWatch = watch(switchState.state, (newState) => {
    updateSwitchState(
      action.id,
      newState,
      action.switchConfig?.labels
    )
  })

  // Store both the switch state and the watch cleanup function
  activeSwitchStates.set(action.id, {
    switchState,
    stopWatch
  })
}

/**
 * Stop a switch state watcher
 */
function stopSwitchStateWatcher(actionId: string) {
  const entry = activeSwitchStates.get(actionId)
  if (entry) {
    // Stop the Vue watch first
    entry.stopWatch()
    // Then stop the switch state (KV watcher / subscription)
    entry.switchState.stop()
    activeSwitchStates.delete(actionId)
  }
}

/**
 * Stop all switch state watchers
 */
function stopAllSwitchStateWatchers() {
  for (const [actionId, entry] of activeSwitchStates) {
    entry.stopWatch()
    entry.switchState.stop()
  }
  activeSwitchStates.clear()
}

/**
 * Show feedback toast
 */
function showFeedback(type: 'success' | 'error', message: string) {
  actionFeedback.value = { type, message }
  setTimeout(() => {
    actionFeedback.value = null
  }, 2000)
}

/**
 * Build callbacks object for useLeafletMap
 */
const popupCallbacks: PopupCallbacks = {
  onPublishAction: handlePublishAction,
  onSwitchToggle: handleSwitchToggle,
  onPopupOpen: handlePopupOpen,
  onPopupClose: handlePopupClose
}

/**
 * Initialize map
 */
async function initializeMap() {
  await nextTick()
  
  // Small delay to ensure container is rendered
  setTimeout(() => {
    initMap(
      mapContainerId.value,
      mapCenter.value,
      mapZoom.value,
      theme.value === 'dark'
    )
    
    renderMarkers(markers.value, popupCallbacks)
    mapReady.value = true
  }, 50)
}

/**
 * Update markers when config changes
 */
function updateMarkers() {
  if (!mapReady.value) return
  renderMarkers(markers.value, popupCallbacks)
}

// ResizeObserver instance - declare at module level for proper cleanup
let resizeObserver: ResizeObserver | null = null
let resizeObserverTimeout: number | null = null

// Initialize on mount
onMounted(() => {
  initializeMap()
  
  // Setup resize observer with safety check
  resizeObserver = new ResizeObserver(() => {
    if (mapReady.value) {
      invalidateSize()
    }
  })
  
  // Delay observation to ensure container exists
  resizeObserverTimeout = window.setTimeout(() => {
    const container = document.getElementById(mapContainerId.value)
    if (container?.parentElement && resizeObserver) {
      resizeObserver.observe(container.parentElement)
    }
  }, 100)
})

// Cleanup on unmount
onUnmounted(() => {
  // Clear pending timeout first
  if (resizeObserverTimeout !== null) {
    clearTimeout(resizeObserverTimeout)
    resizeObserverTimeout = null
  }
  
  // Disconnect resize observer
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  
  // Stop all switch watchers (includes Vue watch cleanup)
  stopAllSwitchStateWatchers()
  
  // Cleanup Leaflet map
  cleanup()
})

// Watch for theme changes
watch(theme, (newTheme) => {
  updateTheme(newTheme === 'dark')
})

// Watch for marker changes
watch(markers, updateMarkers, { deep: true })

// Watch for center/zoom changes - reinitialize map
watch([mapCenter, mapZoom], () => {
  if (!mapReady.value) return
  cleanup()
  mapReady.value = false
  initializeMap()
}, { deep: true })
</script>

<style scoped>
.map-widget {
  height: 100%;
  width: 100%;
  position: relative;
  background: var(--widget-bg);
  border-radius: 4px;
  overflow: hidden;
}

.map-container {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.map-container :deep(.leaflet-pane),
.map-container :deep(.leaflet-control-container) {
  z-index: 0 !important;
}

.map-container :deep(.leaflet-top),
.map-container :deep(.leaflet-bottom) {
  z-index: 1 !important;
}

/* Popups need higher z-index */
.map-container :deep(.leaflet-popup-pane) {
  z-index: 2 !important;
}

.map-loading {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--widget-bg);
  color: var(--muted);
  font-size: 14px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.no-markers-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  color: var(--muted);
  pointer-events: none;
}

.hint-icon { font-size: 14px; }

.disconnected-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  padding: 4px 8px;
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-border);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-warning);
}

.action-feedback {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  animation: slideUp 0.2s ease-out;
  white-space: nowrap;
}

.action-feedback.success {
  background: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
  color: var(--color-success);
}

.action-feedback.error {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
  color: var(--color-error);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>

<style>
/* Global styles for Leaflet popups - must not be scoped */
.nats-map-popup .leaflet-popup-content-wrapper {
  background: var(--panel);
  color: var(--text);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border);
}

.nats-map-popup .leaflet-popup-tip {
  background: var(--panel);
  border: 1px solid var(--border);
  border-top: none;
  border-left: none;
}

.nats-map-popup .leaflet-popup-content {
  margin: 0;
}

.map-popup-content {
  padding: 0;
  min-width: 120px;
}

.map-popup-header {
  padding: 10px 12px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
  background: var(--widget-header-bg);
  border-radius: 8px 8px 0 0;
}

.map-popup-actions {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.map-popup-no-actions {
  padding: 12px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  font-style: italic;
}

/* Publish button styles */
.map-popup-action-btn {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-info-bg);
  border: 1px solid var(--color-info-border);
  border-radius: 4px;
  color: var(--color-info);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.map-popup-action-btn:hover {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.map-popup-action-btn.action-success {
  background: var(--color-success);
  border-color: var(--color-success);
  color: white;
}

/* Switch toggle styles in popup */
.map-popup-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.map-popup-switch .switch-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.map-popup-switch .switch-track {
  position: relative;
  width: 44px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.map-popup-switch .switch-track.state-on {
  background: var(--color-success);
  border-color: var(--color-success);
}

.map-popup-switch .switch-track.state-off {
  background: rgba(255, 255, 255, 0.1);
}

.map-popup-switch .switch-track.state-pending {
  background: var(--color-warning);
  border-color: var(--color-warning);
}

.map-popup-switch .switch-track.state-unknown {
  background: var(--muted);
  opacity: 0.5;
}

.map-popup-switch .switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.map-popup-switch .switch-track.state-on .switch-thumb,
.map-popup-switch .switch-track.state-pending .switch-thumb {
  left: calc(100% - 20px);
}

.map-popup-switch .switch-state-text {
  font-size: 11px;
  font-weight: 600;
  min-width: 28px;
  text-align: right;
}

.map-popup-switch .switch-state-text.state-on {
  color: var(--color-success);
}

.map-popup-switch .switch-state-text.state-off {
  color: var(--muted);
}

.map-popup-switch .switch-state-text.state-pending {
  color: var(--color-warning);
}

.map-popup-switch .switch-state-text.state-unknown {
  color: var(--muted);
}

/* Leaflet control styling for dark mode */
:root[data-theme="dark"] .leaflet-control-zoom a {
  background: var(--panel);
  color: var(--text);
  border-color: var(--border);
}

:root[data-theme="dark"] .leaflet-control-zoom a:hover {
  background: var(--widget-header-bg);
}

:root[data-theme="dark"] .leaflet-control-attribution {
  background: rgba(0, 0, 0, 0.6);
  color: var(--muted);
}

:root[data-theme="dark"] .leaflet-control-attribution a {
  color: var(--color-accent);
}
</style>
