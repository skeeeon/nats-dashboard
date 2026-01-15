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
    
    <!-- Action feedback toast -->
    <div 
      v-if="interactions.actionFeedback.value" 
      class="action-feedback"
      :class="interactions.actionFeedback.value.type"
    >
      {{ interactions.actionFeedback.value.message }}
    </div>

    <!-- Response Modal for Request/Reply Items -->
    <ResponseModal
      v-model="interactions.responseModal.value.show"
      :title="interactions.responseModal.value.title"
      :status="interactions.responseModal.value.status"
      :data="interactions.responseModal.value.data"
      :latency="interactions.responseModal.value.latency"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useLeafletMap } from '@/composables/useLeafletMap'
import { useMapInteractions } from '@/composables/useMapInteractions'
import { useTheme } from '@/composables/useTheme'
import { useWidgetDataStore } from '@/stores/widgetData'
import { useDashboardStore } from '@/stores/dashboard'
import type { WidgetConfig } from '@/types/dashboard'
import ResponseModal from '@/components/common/ResponseModal.vue'

const props = withDefaults(defineProps<{
  config: WidgetConfig
  isFullscreen?: boolean
}>(), {
  isFullscreen: false
})

const { theme } = useTheme()
const dataStore = useWidgetDataStore()
const dashboardStore = useDashboardStore()
const { initMap, updateTheme, renderMarkers, updateMarkerPositions, invalidateSize, cleanup } = useLeafletMap()

// Unique ID
const mapContainerId = computed(() => {
  const suffix = props.isFullscreen ? '-fullscreen' : ''
  return `map-${props.config.id}${suffix}`
})

const mapReady = ref(false)
const markers = computed(() => props.config.mapConfig?.markers || [])
const mapCenter = computed(() => props.config.mapConfig?.center || { lat: 39.8283, lon: -98.5795 })
const mapZoom = computed(() => props.config.mapConfig?.zoom || 4)

// Data Buffer for Dynamic Markers
const buffer = computed(() => dataStore.getBuffer(props.config.id))

// Initialize Interactions Logic
const interactions = useMapInteractions(() => markers.value)

// Initialization tracking
let initTimeout: number | null = null

async function initializeMap() {
  if (initTimeout) {
    clearTimeout(initTimeout)
    initTimeout = null
  }

  await nextTick()
  initTimeout = window.setTimeout(() => {
    if (!document.getElementById(mapContainerId.value)) return

    initMap(
      mapContainerId.value,
      mapCenter.value,
      mapZoom.value,
      theme.value === 'dark'
    )
    renderMarkers(markers.value, interactions.callbacks)
    mapReady.value = true
    initTimeout = null
    
    // Initial position update if we have buffered data
    if (buffer.value.length > 0) {
      updateMarkerPositions(markers.value, buffer.value, dashboardStore.currentVariableValues)
    }
  }, 50)
}

function updateMarkers() {
  if (!mapReady.value) return
  renderMarkers(markers.value, interactions.callbacks)
  // Re-apply positions after re-render
  if (buffer.value.length > 0) {
    updateMarkerPositions(markers.value, buffer.value, dashboardStore.currentVariableValues)
  }
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
  if (initTimeout) clearTimeout(initTimeout)
  if (resizeObserverTimeout !== null) clearTimeout(resizeObserverTimeout)
  if (resizeObserver) resizeObserver.disconnect()
  cleanup()
})

watch(theme, (newTheme) => updateTheme(newTheme === 'dark'))
watch(markers, updateMarkers, { deep: true })
watch([mapCenter, mapZoom], () => {
  if (initTimeout) clearTimeout(initTimeout)
  cleanup()
  mapReady.value = false
  initializeMap()
}, { deep: true })

// Watch buffer for live updates
watch(buffer, (newMessages) => {
  if (mapReady.value && newMessages.length > 0) {
    updateMarkerPositions(markers.value, newMessages, dashboardStore.currentVariableValues)
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

:deep(.map-popup-items) {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:deep(.map-popup-no-items) {
  padding: 16px;
  text-align: center;
  color: var(--muted);
  font-style: italic;
  font-size: 12px;
}

/* Item Buttons */
:deep(.map-popup-item-btn) {
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

:deep(.map-popup-item-btn:hover) {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
}

:deep(.map-popup-item-btn:active) {
  transform: translateY(0);
}

:deep(.map-popup-item-btn.action-success) {
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

/* Value Display (Text/KV) */
:deep(.map-popup-value-display) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

:deep(.value-label) {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}

:deep(.value-text) {
  font-size: 13px;
  color: var(--text);
  font-family: var(--mono);
  font-weight: 600;
  text-align: right;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.value-unit) {
  font-size: 11px;
  color: var(--muted);
  margin-left: 2px;
}
</style>
