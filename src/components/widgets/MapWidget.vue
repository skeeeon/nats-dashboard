<template>
  <div class="map-widget">
    <!-- Map container -->
    <div 
      :id="mapContainerId" 
      class="map-container"
      @click="handleMapClick"
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
    
    <!-- Map Controls -->
    <div v-if="mapReady && markers.length > 1" class="map-controls">
      <button 
        class="map-control-btn" 
        @click="() => fitAllMarkers()"
        title="Fit all markers"
      >
        ⊡
      </button>
    </div>
    
    <!-- Marker Detail Panel -->
    <MarkerDetailPanel
      v-if="selectedMarker"
      :marker="selectedMarker"
      :is-mobile="isMobile"
      @close="closePanel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useLeafletMap } from '@/composables/useLeafletMap'
import { useTheme } from '@/composables/useTheme'
import { useWidgetDataStore } from '@/stores/widgetData'
import { useDashboardStore } from '@/stores/dashboard'
import MarkerDetailPanel from './map/MarkerDetailPanel.vue'
import type { WidgetConfig } from '@/types/dashboard'

const props = withDefaults(defineProps<{
  config: WidgetConfig
  isFullscreen?: boolean
}>(), {
  isFullscreen: false
})

const { theme } = useTheme()
const dataStore = useWidgetDataStore()
const dashboardStore = useDashboardStore()

const { 
  initMap, 
  updateTheme, 
  renderMarkers, 
  setSelectedMarker,
  updateMarkerPositions,
  fitAllMarkers,
  invalidateSize, 
  cleanup 
} = useLeafletMap()

const mapContainerId = computed(() => `map-${props.config.id}${props.isFullscreen ? '-fs' : ''}`)
const mapReady = ref(false)
const selectedMarkerId = ref<string | null>(null)
const isMobile = ref(window.innerWidth < 768)

const markers = computed(() => props.config.mapConfig?.markers || [])
const buffer = computed(() => dataStore.getBuffer(props.config.id))

// Find the marker object based on the ID
const selectedMarker = computed(() => {
  if (!selectedMarkerId.value) return null
  return markers.value.find(m => m.id === selectedMarkerId.value) || null
})

/**
 * Centralized Marker Click Handler
 */
function handleMarkerClick(markerId: string) {
  if (selectedMarkerId.value === markerId) {
    closePanel()
  } else {
    selectedMarkerId.value = markerId
    setSelectedMarker(markerId)
    
    // On desktop, the panel takes up space, so we need to tell Leaflet to resize
    if (!isMobile.value) {
      nextTick(() => invalidateSize())
    }
  }
}

/**
 * Sync positions from data buffer
 */
function syncMarkerPositions() {
  if (mapReady.value && buffer.value.length > 0) {
    updateMarkerPositions(markers.value, buffer.value, dashboardStore.currentVariableValues)
  }
}

/**
 * Close the panel and clear selection
 */
function closePanel() {
  selectedMarkerId.value = null
  setSelectedMarker(null)
  if (!isMobile.value) nextTick(() => invalidateSize())
}

/**
 * Handle clicks on the map background
 */
function handleMapClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  // Don't close if we clicked a marker icon or the panel itself
  if (target.closest('.leaflet-marker-icon') || target.closest('.marker-detail-panel')) {
    return
  }
  closePanel()
}

// --- Watchers ---

// Re-sync positions when data or variables change
watch(buffer, () => syncMarkerPositions(), { deep: true })
watch(() => dashboardStore.currentVariableValues, () => syncMarkerPositions(), { deep: true })

// Handle theme changes
watch(theme, (newTheme) => updateTheme(newTheme === 'dark'))

// Handle marker configuration changes
watch(markers, (newMarkers) => {
  if (mapReady.value) {
    renderMarkers(newMarkers, handleMarkerClick)
    // Re-apply selection visual if it still exists
    if (selectedMarkerId.value) {
      setSelectedMarker(selectedMarkerId.value)
    }
    syncMarkerPositions()
  }
}, { deep: true })

// Handle map view changes
watch(() => [props.config.mapConfig?.center, props.config.mapConfig?.zoom], () => {
  cleanup()
  mapReady.value = false
  selectedMarkerId.value = null
  initializeMap()
}, { deep: true })

/**
 * Map Initialization
 */
async function initializeMap() {
  await nextTick()
  const container = document.getElementById(mapContainerId.value)
  if (!container) return

  initMap(
    mapContainerId.value, 
    props.config.mapConfig!.center, 
    props.config.mapConfig!.zoom, 
    theme.value === 'dark'
  )
  
  renderMarkers(markers.value, handleMarkerClick)
  mapReady.value = true
  syncMarkerPositions()
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  window.addEventListener('resize', () => { isMobile.value = window.innerWidth < 768 })
  initializeMap()
  
  // Watch for container size changes to keep Leaflet tiles aligned
  resizeObserver = new ResizeObserver(() => {
    if (mapReady.value) invalidateSize()
  })
  
  const container = document.getElementById(mapContainerId.value)
  if (container?.parentElement) resizeObserver.observe(container.parentElement)
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  cleanup()
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
  z-index: 1;
}

/* Ensure Leaflet doesn't overlap UI elements */
.map-container :deep(.leaflet-pane) { z-index: 1; }
.map-container :deep(.leaflet-control-container) { z-index: 2; }

/* Selected marker glow */
.map-container :deep(.marker-selected) {
  filter: hue-rotate(180deg) saturate(1.5) drop-shadow(0 0 8px var(--color-primary));
}

.map-loading {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--widget-bg);
  gap: 12px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.no-markers-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  padding: 6px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  color: var(--muted);
  pointer-events: none;
}

.map-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.map-control-btn {
  width: 32px;
  height: 32px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

.map-control-btn:hover {
  background: var(--color-info-bg);
}
</style>
