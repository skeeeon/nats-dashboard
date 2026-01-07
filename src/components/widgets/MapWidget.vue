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
import { useDashboardStore } from '@/stores/dashboard'
import { useTheme } from '@/composables/useTheme'
import { encodeString } from '@/utils/encoding'
import { resolveTemplate } from '@/utils/variables'
import type { WidgetConfig, MapMarkerAction } from '@/types/dashboard'

const props = withDefaults(defineProps<{
  config: WidgetConfig
  isFullscreen?: boolean
}>(), {
  isFullscreen: false
})

const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()
const { theme } = useTheme()
const { initMap, updateTheme, renderMarkers, updateSwitchState, invalidateSize, cleanup } = useLeafletMap()

// Unique ID
const mapContainerId = computed(() => {
  const suffix = props.isFullscreen ? '-fullscreen' : ''
  return `map-${props.config.id}${suffix}`
})

const mapReady = ref(false)
const actionFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null)

// Track active switch states
interface SwitchStateEntry {
  switchState: SwitchState
  stopWatch: () => void
}
const activeSwitchStates = new Map<string, SwitchStateEntry>()

const openMarkerId = ref<string | null>(null)
const markers = computed(() => props.config.mapConfig?.markers || [])
const hasActions = computed(() => markers.value.some(m => m.actions && m.actions.length > 0))
const mapCenter = computed(() => props.config.mapConfig?.center || { lat: 39.8283, lon: -98.5795 })
const mapZoom = computed(() => props.config.mapConfig?.zoom || 4)

/**
 * Handle publish action click
 */
function handlePublishAction(action: MapMarkerAction) {
  if (!natsStore.nc || !natsStore.isConnected) {
    showFeedback('error', 'Not connected to NATS')
    return
  }

  // Resolve variables
  const subject = resolveTemplate(action.subject, dashboardStore.currentVariableValues)
  const payloadStr = resolveTemplate(action.payload || '{}', dashboardStore.currentVariableValues)

  if (!subject) {
    showFeedback('error', 'No subject configured')
    return
  }

  try {
    const payload = encodeString(payloadStr)
    natsStore.nc.publish(subject, payload)
    
    showFeedback('success', `Published to ${subject}`)
    console.log(`[MapWidget] Published to ${subject}`)
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

  entry.switchState.toggle()
}

/**
 * Handle popup open - start switch state watchers
 */
function handlePopupOpen(markerId: string, _popupElement: HTMLElement) {
  openMarkerId.value = markerId
  const marker = markers.value.find(m => m.id === markerId)
  if (!marker) return

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
  openMarkerId.value = null
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

  if (activeSwitchStates.has(action.id)) {
    const existing = activeSwitchStates.get(action.id)!
    if (existing.switchState.isActive()) return
  }

  // Resolve variables for switch config
  const vars = dashboardStore.currentVariableValues
  const resolvedConfig = {
    mode: action.switchConfig.mode,
    kvBucket: resolveTemplate(action.switchConfig.kvBucket, vars),
    kvKey: resolveTemplate(action.switchConfig.kvKey, vars),
    publishSubject: resolveTemplate(action.switchConfig.publishSubject, vars),
    stateSubject: resolveTemplate(action.switchConfig.stateSubject, vars),
    onPayload: action.switchConfig.onPayload, // Payloads usually don't need template resolution for switches, but could if string
    offPayload: action.switchConfig.offPayload,
    defaultState: 'off' as const
  }

  const switchState = createSwitchState(resolvedConfig)

  await switchState.start()

  updateSwitchState(action.id, switchState.state.value, action.switchConfig.labels)

  const stopWatch = watch(switchState.state, (newState) => {
    updateSwitchState(action.id, newState, action.switchConfig?.labels)
  })

  activeSwitchStates.set(action.id, { switchState, stopWatch })
}

function stopSwitchStateWatcher(actionId: string) {
  const entry = activeSwitchStates.get(actionId)
  if (entry) {
    entry.stopWatch()
    entry.switchState.stop()
    activeSwitchStates.delete(actionId)
  }
}

function stopAllSwitchStateWatchers() {
  for (const entry of activeSwitchStates.values()) {
    entry.stopWatch()
    entry.switchState.stop()
  }
  activeSwitchStates.clear()
}

function showFeedback(type: 'success' | 'error', message: string) {
  actionFeedback.value = { type, message }
  setTimeout(() => {
    actionFeedback.value = null
  }, 2000)
}

const popupCallbacks: PopupCallbacks = {
  onPublishAction: handlePublishAction,
  onSwitchToggle: handleSwitchToggle,
  onPopupOpen: handlePopupOpen,
  onPopupClose: handlePopupClose
}

async function initializeMap() {
  await nextTick()
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

function updateMarkers() {
  if (!mapReady.value) return
  renderMarkers(markers.value, popupCallbacks)
}

let resizeObserver: ResizeObserver | null = null
let resizeObserverTimeout: number | null = null

onMounted(() => {
  initializeMap()
  resizeObserver = new ResizeObserver(() => {
    if (mapReady.value) invalidateSize()
  })
  resizeObserverTimeout = window.setTimeout(() => {
    const container = document.getElementById(mapContainerId.value)
    if (container?.parentElement && resizeObserver) {
      resizeObserver.observe(container.parentElement)
    }
  }, 100)
})

onUnmounted(() => {
  if (resizeObserverTimeout !== null) clearTimeout(resizeObserverTimeout)
  if (resizeObserver) resizeObserver.disconnect()
  stopAllSwitchStateWatchers()
  cleanup()
})

watch(theme, (newTheme) => updateTheme(newTheme === 'dark'))
watch(markers, updateMarkers, { deep: true })
watch([mapCenter, mapZoom], () => {
  if (!mapReady.value) return
  cleanup()
  mapReady.value = false
  initializeMap()
}, { deep: true })

// Watch variables: if variables change while a popup is open, we need to restart watchers
watch(() => dashboardStore.currentVariableValues, () => {
  if (openMarkerId.value) {
    // Restart watchers for the open marker to pick up new variable values
    const markerId = openMarkerId.value
    // Stop existing
    const marker = markers.value.find(m => m.id === markerId)
    if (marker) {
      marker.actions.forEach(a => {
        if (a.type === 'switch') stopSwitchStateWatcher(a.id)
      })
      // Restart
      marker.actions.forEach(a => {
        if (a.type === 'switch' && a.switchConfig) startSwitchStateWatcher(a)
      })
    }
  }
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

/* ==========================================================================
   Leaflet Popup Styles (Deep Selectors for Dynamic Content)
   ========================================================================== */

/* Popup Container Overrides */
:deep(.nats-map-popup .leaflet-popup-content-wrapper) {
  background: var(--panel);
  color: var(--text);
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border);
}

:deep(.nats-map-popup .leaflet-popup-content) {
  margin: 0;
  width: 100% !important;
  line-height: 1.4;
}

:deep(.nats-map-popup .leaflet-popup-tip) {
  background: var(--panel);
  border: 1px solid var(--border); /* Tip border matching */
  border-top: none;
  border-left: none;
}

:deep(.nats-map-popup .leaflet-popup-close-button) {
  color: var(--muted);
  padding: 8px;
  top: 4px;
  right: 4px;
  font-size: 16px;
}

:deep(.nats-map-popup .leaflet-popup-close-button:hover) {
  color: var(--text);
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
}

/* Popup Inner Content */
:deep(.map-popup-content) {
  display: flex;
  flex-direction: column;
  min-width: 200px;
}

:deep(.map-popup-header) {
  padding: 12px 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.1);
  font-size: 14px;
  padding-right: 32px; /* Space for close button */
}

:deep(.map-popup-actions) {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:deep(.map-popup-no-actions) {
  padding: 16px;
  text-align: center;
  color: var(--muted);
  font-style: italic;
  font-size: 12px;
}

/* Action Buttons */
:deep(.map-popup-action-btn) {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  text-align: center;
}

:deep(.map-popup-action-btn:hover) {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
}

:deep(.map-popup-action-btn:active) {
  transform: translateY(0);
}

:deep(.map-popup-action-btn.action-success) {
  background: var(--color-success);
  pointer-events: none;
}

/* Switch Toggle */
:deep(.map-popup-switch) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

:deep(.switch-label) {
  font-size: 13px;
  color: var(--text);
  flex: 1;
  font-weight: 500;
}

:deep(.switch-track) {
  width: 36px;
  height: 20px;
  background: var(--muted);
  border-radius: 10px;
  position: relative;
  border: none;
  cursor: pointer;
  transition: background 0.3s;
  padding: 0;
  flex-shrink: 0;
}

:deep(.switch-track:hover) {
  filter: brightness(1.1);
}

:deep(.switch-track.state-on) {
  background: var(--color-success);
}

:deep(.switch-track.state-pending) {
  background: var(--color-warning);
  opacity: 0.7;
}

:deep(.switch-thumb) {
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

:deep(.switch-track.state-on .switch-thumb) {
  transform: translateX(16px);
}

:deep(.switch-state-text) {
  font-size: 11px;
  font-family: var(--mono);
  color: var(--muted);
  min-width: 24px;
  text-align: right;
  font-weight: 600;
}

:deep(.switch-state-text.state-on) {
  color: var(--color-success);
}
</style>
