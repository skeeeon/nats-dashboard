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
import { useLeafletMap } from '@/composables/useLeafletMap'
import { useNatsStore } from '@/stores/nats'
import { useTheme } from '@/composables/useTheme'
import { encodeString } from '@/utils/encoding'
import type { WidgetConfig, MapMarkerAction } from '@/types/dashboard'

/**
 * Map Widget
 * 
 * Grug say: Show map with markers. Click marker, see popup with actions.
 * Actions publish messages like button widget.
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()
const { theme } = useTheme()
const { initMap, updateTheme, renderMarkers, invalidateSize, cleanup } = useLeafletMap()

// Unique ID for this widget's map container
const mapContainerId = computed(() => `map-${props.config.id}`)
const mapReady = ref(false)

// Action feedback state
const actionFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null)

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
 * Handle marker action click
 */
function handleAction(action: MapMarkerAction) {
  if (!natsStore.nc || !natsStore.isConnected) {
    showFeedback('error', 'Not connected to NATS')
    return
  }

  try {
    const payload = encodeString(action.payload)
    natsStore.nc.publish(action.subject, payload)
    
    showFeedback('success', `Published to ${action.subject}`)
    console.log(`[MapWidget] Published to ${action.subject}`)
  } catch (err: any) {
    console.error('[MapWidget] Publish error:', err)
    showFeedback('error', 'Failed to publish')
  }
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
    
    renderMarkers(markers.value, handleAction)
    mapReady.value = true
  }, 50)
}

/**
 * Update markers when config changes
 */
function updateMarkers() {
  if (!mapReady.value) return
  renderMarkers(markers.value, handleAction)
}

// Initialize on mount
onMounted(() => {
  initializeMap()
})

// Cleanup on unmount
onUnmounted(() => {
  cleanup()
})

// Watch for theme changes
watch(theme, (newTheme) => {
  updateTheme(newTheme === 'dark')
})

// Watch for marker changes
watch(markers, updateMarkers, { deep: true })

// Watch for center/zoom changes
watch([mapCenter, mapZoom], () => {
  if (!mapReady.value) return
  // Re-initialize to apply new center/zoom
  initializeMap()
}, { deep: true })

// Handle resize when widget is resized
const resizeObserver = new ResizeObserver(() => {
  invalidateSize()
})

onMounted(() => {
  const container = document.getElementById(mapContainerId.value)
  if (container?.parentElement) {
    resizeObserver.observe(container.parentElement)
  }
})

onUnmounted(() => {
  resizeObserver.disconnect()
})
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
  /* Keep map below widget controls - Leaflet defaults to high z-index */
  z-index: 0;
}

/* Force Leaflet internals to stay contained */
.map-container :deep(.leaflet-pane),
.map-container :deep(.leaflet-control-container) {
  z-index: 0 !important;
}

.map-container :deep(.leaflet-top),
.map-container :deep(.leaflet-bottom) {
  z-index: 1 !important;
}

/* Loading state */
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

/* No markers hint */
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

.hint-icon {
  font-size: 14px;
}

/* Disconnected badge */
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

/* Action feedback toast */
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

/* Popup content styles */
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
  gap: 4px;
}

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
