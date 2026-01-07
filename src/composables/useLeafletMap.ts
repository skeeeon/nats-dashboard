/**
 * Leaflet Map Composable
 * 
 * Grug say: Handle all Leaflet stuff in one place.
 * Theme switching, marker rendering, popup actions.
 */

import { ref, shallowRef, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapMarker, MapMarkerAction } from '@/types/dashboard'

// Tile providers - OpenStreetMap for light, CartoDB for dark
const TILE_URLS = {
  light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
}

const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'

/**
 * Fix Leaflet's broken icon paths in bundlers
 * Grug say: Leaflet and Vite don't play nice. This fixes it.
 */
function fixLeafletIcons() {
  // @ts-ignore - Leaflet internals
  delete L.Icon.Default.prototype._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })
}

export function useLeafletMap() {
  // Use shallowRef for Leaflet instances - prevents Vue reactivity issues
  const map = shallowRef<L.Map | null>(null)
  const markersLayer = shallowRef<L.LayerGroup | null>(null)
  const tileLayer = shallowRef<L.TileLayer | null>(null)
  const initialized = ref(false)

  /**
   * Initialize the map
   */
  function initMap(
    containerId: string,
    center: { lat: number; lon: number },
    zoom: number,
    isDarkMode: boolean
  ) {
    // Clean up existing map if any
    if (map.value) {
      map.value.remove()
      map.value = null
    }

    fixLeafletIcons()

    // Create map instance
    const mapInstance = L.map(containerId, {
      center: [center.lat, center.lon],
      zoom: zoom,
      zoomControl: true,
      attributionControl: true,
    })

    map.value = mapInstance

    // Add tile layer
    updateTheme(isDarkMode)

    // Create marker layer group
    const layerGroup = L.layerGroup()
    layerGroup.addTo(mapInstance)
    markersLayer.value = layerGroup

    initialized.value = true

    // Handle container resize
    setTimeout(() => {
      mapInstance.invalidateSize()
    }, 100)
  }

  /**
   * Update tile layer based on theme
   */
  function updateTheme(isDarkMode: boolean) {
    if (!map.value) return

    // Remove existing tile layer
    if (tileLayer.value) {
      map.value.removeLayer(tileLayer.value)
    }

    // Add new tile layer
    const url = isDarkMode ? TILE_URLS.dark : TILE_URLS.light
    const newTileLayer = L.tileLayer(url, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19
    })
    newTileLayer.addTo(map.value)
    tileLayer.value = newTileLayer
  }

  /**
   * Render markers on the map
   * 
   * @param markers - Array of marker configs
   * @param onAction - Callback when action is clicked
   */
  function renderMarkers(
    markers: MapMarker[],
    onAction: (action: MapMarkerAction) => void
  ) {
    if (!map.value || !markersLayer.value) return

    // Clear existing markers
    markersLayer.value.clearLayers()

    markers.forEach(markerConfig => {
      const { lat, lon, label, actions } = markerConfig

      // Create marker
      const marker = L.marker([lat, lon], {
        title: label
      })

      // Build popup content
      const popupContent = createPopupContent(label, actions, onAction)
      marker.bindPopup(popupContent, {
        className: 'nats-map-popup',
        minWidth: 150,
        maxWidth: 250
      })

      // Add to layer
      markersLayer.value!.addLayer(marker)
    })

    // Fit bounds if multiple markers
    if (markers.length > 1) {
      const bounds = markers.map(m => [m.lat, m.lon] as [number, number])
      map.value.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    } else if (markers.length === 1) {
      // Center on single marker
      map.value.setView([markers[0].lat, markers[0].lon], map.value.getZoom())
    }
  }

  /**
   * Create popup HTML content with action buttons
   * Grug say: Build DOM elements, attach click handlers. Simple.
   */
  function createPopupContent(
    label: string,
    actions: MapMarkerAction[],
    onAction: (action: MapMarkerAction) => void
  ): HTMLElement {
    const container = document.createElement('div')
    container.className = 'map-popup-content'

    // Header
    const header = document.createElement('div')
    header.className = 'map-popup-header'
    header.textContent = label
    container.appendChild(header)

    // Actions
    if (actions.length > 0) {
      const actionList = document.createElement('div')
      actionList.className = 'map-popup-actions'

      actions.forEach(action => {
        const btn = document.createElement('button')
        btn.className = 'map-popup-action-btn'
        btn.textContent = action.label
        btn.onclick = (e) => {
          e.stopPropagation()
          onAction(action)
          
          // Visual feedback
          btn.classList.add('action-success')
          btn.textContent = '✓ Sent!'
          setTimeout(() => {
            btn.classList.remove('action-success')
            btn.textContent = action.label
          }, 1500)
        }
        actionList.appendChild(btn)
      })

      container.appendChild(actionList)
    }

    return container
  }

  /**
   * Update map view (center + zoom)
   */
  function setView(lat: number, lon: number, zoom: number) {
    if (!map.value) return
    map.value.setView([lat, lon], zoom)
  }

  /**
   * Force map to recalculate size
   * Call after container resize
   */
  function invalidateSize() {
    if (!map.value) return
    map.value.invalidateSize()
  }

  /**
   * Cleanup
   */
  function cleanup() {
    if (map.value) {
      map.value.remove()
      map.value = null
    }
    markersLayer.value = null
    tileLayer.value = null
    initialized.value = false
  }

  // Auto-cleanup on unmount
  onUnmounted(cleanup)

  return {
    map,
    initialized,
    initMap,
    updateTheme,
    renderMarkers,
    setView,
    invalidateSize,
    cleanup,
  }
}
