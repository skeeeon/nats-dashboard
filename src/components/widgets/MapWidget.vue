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

/**
 * Map Widget
 * 
 * Displays an interactive Leaflet map with configurable markers.
 * Clicking a marker opens a detail panel:
 * - Desktop: Side panel (280px wide)
 * - Mobile: Full overlay panel
 */

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
  invalidateSize, 
  cleanup 
} = useLeafletMap()

// Unique container ID (different for fullscreen to allow both instances)
const mapContainerId = computed(() => {
  const suffix = props.isFullscreen ? '-fullscreen' : ''
  return `map-${props.config.id}${suffix}`
})

// Map state
const mapReady = ref(false)
const selectedMarkerId = ref<string | null>(null)
const isMobile = ref(false)

// Config computed values
const markers = computed(() => props.config.mapConfig?.markers || [])
const mapCenter = computed(() => props.config.mapConfig?.center || { lat: 39.8283, lon: -98.5795 })
const mapZoom = computed(() => props.config.mapConfig?.zoom || 4)

// Data buffer for dynamic marker positions
const buffer = computed(() => dataStore.getBuffer(props.config.id))

// Selected marker object
const selectedMarker = computed(() => {
  if (!selectedMarkerId.value) return null
  return markers.value.find(m => m.id === selectedMarkerId.value) || null
})

// Initialization tracking
let initTimeout: number | null = null

/**
 * Check if we're on mobile viewport
 */
function checkMobile() {
  isMobile.value = window.innerWidth < 768
}

/**
 * Initialize the map
 */
async function initializeMap() {
  if (initTimeout) {
    clearTimeout(initTimeout)
    initTimeout = null
  }

  await nextTick()
  
  initTimeout = window.setTimeout(() => {
    const container = document.getElementById(mapContainerId.value)
    if (!container) return

    initMap(
      mapContainerId.value,
      mapCenter.value,
      mapZoom.value,
      theme.value === 'dark'
    )
    
    renderMarkers(markers.value, handleMarkerClick)
    mapReady.value = true
    initTimeout = null
    
    // Initial position update if we have buffered data
    if (buffer.value.length > 0) {
      updateMarkerPositions(markers.value, buffer.value, dashboardStore.currentVariableValues)
    }
  }, 50)
}

/**
 * Handle marker click - open detail panel
 */
function handleMarkerClick(markerId: string) {
  // If clicking the same marker, close panel
  if (selectedMarkerId.value === markerId) {
    closePanel()
    return
  }
  
  selectedMarkerId.value = markerId
  setSelectedMarker(markerId)
  
  // Invalidate size since panel affects available space (desktop only)
  if (!isMobile.value) {
    nextTick(() => {
      invalidateSize()
    })
  }
}

/**
 * Close the detail panel
 */
function closePanel() {
  selectedMarkerId.value = null
  setSelectedMarker(null)
  
  if (!isMobile.value) {
    nextTick(() => {
      invalidateSize()
    })
  }
}

/**
 * Re-render markers (called when config changes)
 */
function updateMarkers() {
  if (!mapReady.value) return
  
  renderMarkers(markers.value, handleMarkerClick)
  
  // Re-apply selection if still valid
  if (selectedMarkerId.value) {
    const stillExists = markers.value.some(m => m.id === selectedMarkerId.value)
    if (stillExists) {
      setSelectedMarker(selectedMarkerId.value)
    } else {
      closePanel()
    }
  }
  
  // Re-apply positions
  if (buffer.value.length > 0) {
    updateMarkerPositions(markers.value, buffer.value, dashboardStore.currentVariableValues)
  }
}

// ResizeObserver for container size changes
let resizeObserver: ResizeObserver | null = null
let resizeObserverTimeout: number | null = null

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  
  initializeMap()
  
  // Setup resize observer
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
  window.removeEventListener('resize', checkMobile)
  
  if (initTimeout) clearTimeout(initTimeout)
  if (resizeObserverTimeout !== null) clearTimeout(resizeObserverTimeout)
  if (resizeObserver) resizeObserver.disconnect()
  
  cleanup()
})

// Watch for theme changes
watch(theme, (newTheme) => {
  updateTheme(newTheme === 'dark')
})

// Watch for marker config changes
watch(markers, updateMarkers, { deep: true })

// Watch for center/zoom changes - reinitialize map
watch([mapCenter, mapZoom], () => {
  if (initTimeout) clearTimeout(initTimeout)
  cleanup()
  mapReady.value = false
  selectedMarkerId.value = null
  initializeMap()
}, { deep: true })

// Watch buffer for dynamic position updates
watch(buffer, (newMessages) => {
  if (mapReady.value && newMessages.length > 0) {
    updateMarkerPositions(markers.value, newMessages, dashboardStore.currentVariableValues)
  }
}, { deep: true })

// Watch for variable changes
watch(() => dashboardStore.currentVariableValues, () => {
  if (mapReady.value && buffer.value.length > 0) {
    updateMarkerPositions(markers.value, buffer.value, dashboardStore.currentVariableValues)
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

/* Leaflet z-index overrides */
.map-container :deep(.leaflet-pane),
.map-container :deep(.leaflet-control-container) {
  z-index: 0 !important;
}

.map-container :deep(.leaflet-top),
.map-container :deep(.leaflet-bottom) {
  z-index: 1 !important;
}

/* 
 * Selected marker styling - static glow effect
 * Using box-shadow instead of transform to avoid conflicting with Leaflet's positioning
 */
.map-container :deep(.marker-selected) {
  filter: hue-rotate(180deg) saturate(1.5) drop-shadow(0 0 8px rgba(116, 128, 255, 0.8));
}

/* Loading overlay */
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
  z-index: 5;
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
</style>
