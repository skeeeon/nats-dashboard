<template>
  <div class="map-widget">
    <div :id="mapContainerId" class="map-container" @click="handleMapClick" />
    <div v-if="!mapReady" class="map-loading">
      <div class="loading-spinner"></div>
      <span>Loading map...</span>
    </div>
    <div v-if="mapReady && markers.length === 0" class="no-markers-hint">No markers configured</div>
    <div v-if="mapReady && markers.length > 1" class="map-controls">
      <!-- Wrap in arrow function to prevent PointerEvent being passed as padding -->
      <button class="map-control-btn" @click="() => fitAllMarkers()">⊡</button>
    </div>
    <MarkerDetailPanel v-if="selectedMarker" :marker="selectedMarker" :is-mobile="isMobile" @close="closePanel" />
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

const props = defineProps<{ config: WidgetConfig; isFullscreen?: boolean }>()
const { theme } = useTheme()
const dataStore = useWidgetDataStore()
const dashboardStore = useDashboardStore()
const { initMap, updateTheme, renderMarkers, setSelectedMarker, updateMarkerPositions, fitAllMarkers, invalidateSize, cleanup } = useLeafletMap()

const mapContainerId = computed(() => `map-${props.config.id}${props.isFullscreen ? '-fs' : ''}`)
const mapReady = ref(false)
const selectedMarkerId = ref<string | null>(null)
const isMobile = ref(window.innerWidth < 768)

const markers = computed(() => props.config.mapConfig?.markers || [])
const buffer = computed(() => dataStore.getBuffer(props.config.id))
const selectedMarker = computed(() => markers.value.find(m => m.id === selectedMarkerId.value) || null)

function syncMarkerPositions() {
  if (mapReady.value && buffer.value.length > 0) {
    updateMarkerPositions(markers.value, buffer.value, dashboardStore.currentVariableValues)
  }
}

watch(mapReady, (ready) => { if (ready) syncMarkerPositions() })
watch(buffer, () => syncMarkerPositions(), { deep: true })
watch(() => dashboardStore.currentVariableValues, () => syncMarkerPositions(), { deep: true })
watch(theme, (t) => updateTheme(t === 'dark'))

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  initMap(mapContainerId.value, props.config.mapConfig!.center, props.config.mapConfig!.zoom, theme.value === 'dark')
  renderMarkers(markers.value, (id) => {
    selectedMarkerId.value = id
    setSelectedMarker(id)
  })
  mapReady.value = true

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

function closePanel() { selectedMarkerId.value = null; setSelectedMarker(null) }
function handleMapClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.leaflet-marker-icon')) closePanel()
}
</script>

<style scoped>
.map-widget { height: 100%; width: 100%; position: relative; background: var(--widget-bg); border-radius: 4px; overflow: hidden; }
.map-container { position: absolute; inset: 0; }
.map-loading { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--widget-bg); }
.loading-spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--color-accent); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.map-controls { position: absolute; top: 10px; right: 10px; z-index: 1000; }
.map-control-btn { width: 32px; height: 32px; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text); display: flex; align-items: center; justify-content: center; }
</style>
