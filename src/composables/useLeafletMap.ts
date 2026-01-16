// src/composables/useLeafletMap.ts
import { ref, shallowRef } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapMarker } from '@/types/dashboard'
import { JSONPath } from 'jsonpath-plus'
import { resolveTemplate } from '@/utils/variables'
import type { BufferedMessage } from '@/stores/widgetData'

/**
 * Leaflet Map Composable (Simplified)
 * 
 * Manages Leaflet map lifecycle:
 * - Map initialization and cleanup
 * - Theme switching (light/dark tiles)
 * - Marker rendering with selection state
 * - Dynamic marker position updates
 * 
 * Grug say: Map show markers. Click marker, tell parent. No popup nonsense.
 */

// Tile providers
const TILE_URLS = {
  light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
}

const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'

// Fix Leaflet default icon paths
function fixLeafletIcons() {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })
}

// Custom icon for selected markers
function createSelectedIcon(): L.Icon {
  return L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    shadowSize: [41, 41],
    className: 'marker-selected'
  })
}

export function useLeafletMap() {
  const map = shallowRef<L.Map | null>(null)
  const markersLayer = shallowRef<L.LayerGroup | null>(null)
  const tileLayer = shallowRef<L.TileLayer | null>(null)
  const initialized = ref(false)
  
  // Track marker instances for updates
  const markerInstances = new Map<string, L.Marker>()
  
  // Track selected marker
  let selectedMarkerId: string | null = null
  const defaultIcon = new L.Icon.Default()
  const selectedIcon = createSelectedIcon()

  /**
   * Initialize the Leaflet map
   */
  function initMap(
    containerId: string,
    center: { lat: number; lon: number },
    zoom: number,
    isDarkMode: boolean
  ) {
    // Cleanup existing map
    if (map.value) {
      map.value.remove()
      map.value = null
    }
    markerInstances.clear()
    selectedMarkerId = null
    
    fixLeafletIcons()

    const container = document.getElementById(containerId)
    if (!container) return
    
    // Clear any stale Leaflet state
    if ((container as any)._leaflet_id) {
      (container as any)._leaflet_id = null
    }

    const mapInstance = L.map(containerId, {
      center: [center.lat, center.lon],
      zoom: zoom,
      zoomControl: true,
      attributionControl: true,
    })

    map.value = mapInstance
    updateTheme(isDarkMode)

    const layerGroup = L.layerGroup()
    layerGroup.addTo(mapInstance)
    markersLayer.value = layerGroup

    initialized.value = true

    // Ensure proper sizing after init
    setTimeout(() => {
      mapInstance.invalidateSize()
    }, 100)
  }

  /**
   * Switch between light and dark tile layers
   */
  function updateTheme(isDarkMode: boolean) {
    if (!map.value) return
    
    if (tileLayer.value) {
      map.value.removeLayer(tileLayer.value)
    }

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
   * @param markers - Array of marker configurations
   * @param onMarkerClick - Callback when marker is clicked
   */
  function renderMarkers(
    markers: MapMarker[], 
    onMarkerClick: (markerId: string) => void
  ) {
    if (!map.value || !markersLayer.value) return

    markersLayer.value.clearLayers()
    markerInstances.clear()

    markers.forEach(markerConfig => {
      const { id, lat, lon, label } = markerConfig
      
      const isSelected = id === selectedMarkerId
      const icon = isSelected ? selectedIcon : defaultIcon
      
      const marker = L.marker([lat, lon], { 
        title: label,
        icon: icon
      })

      // Simple click handler - just notify parent
      marker.on('click', () => {
        onMarkerClick(id)
      })

      // Add tooltip with label
      marker.bindTooltip(label, {
        permanent: false,
        direction: 'top',
        offset: [0, -40]
      })

      markerInstances.set(id, marker)
      markersLayer.value!.addLayer(marker)
    })
  }

  /**
   * Update selected marker visual state
   */
  function setSelectedMarker(markerId: string | null) {
    // Deselect previous
    if (selectedMarkerId && markerInstances.has(selectedMarkerId)) {
      const prevMarker = markerInstances.get(selectedMarkerId)!
      prevMarker.setIcon(defaultIcon)
    }
    
    // Select new
    selectedMarkerId = markerId
    if (markerId && markerInstances.has(markerId)) {
      const newMarker = markerInstances.get(markerId)!
      newMarker.setIcon(selectedIcon)
      
      // Optionally pan to selected marker
      const latlng = newMarker.getLatLng()
      if (map.value) {
        // Check if marker is in view, if not pan to it
        const bounds = map.value.getBounds()
        if (!bounds.contains(latlng)) {
          map.value.panTo(latlng)
        }
      }
    }
  }

  /**
   * Update marker positions from incoming messages
   * Used for dynamic markers that receive position updates via NATS
   */
  function updateMarkerPositions(
    markersConfig: MapMarker[], 
    messages: BufferedMessage[],
    variables: Record<string, string>
  ) {
    if (!map.value || messages.length === 0) return

    // Filter for dynamic markers
    const dynamicMarkers = markersConfig.filter(m => 
      m.positionConfig?.mode === 'dynamic' && m.positionConfig.subject
    )

    if (dynamicMarkers.length === 0) return

    // For each dynamic marker, find the latest relevant message
    dynamicMarkers.forEach(marker => {
      const pos = marker.positionConfig!
      const resolvedSubject = resolveTemplate(pos.subject, variables)
      
      // Find latest message matching this subject (iterate backwards)
      let match: BufferedMessage | undefined
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].subject === resolvedSubject) {
          match = messages[i]
          break
        }
      }

      if (match) {
        const lat = extractValue(match.value, pos.latJsonPath)
        const lon = extractValue(match.value, pos.lonJsonPath)

        if (isValidCoord(lat) && isValidCoord(lon)) {
          const leafletMarker = markerInstances.get(marker.id)
          if (leafletMarker) {
            const current = leafletMarker.getLatLng()
            // Only update if moved significantly
            if (Math.abs(current.lat - lat) > 0.000001 || Math.abs(current.lng - lon) > 0.000001) {
              leafletMarker.setLatLng([lat, lon])
            }
          }
        }
      }
    })
  }

  /**
   * Extract numeric value from data using JSONPath
   */
  function extractValue(data: any, path?: string): number {
    if (!path) return NaN
    try {
      let json = data
      if (typeof data === 'string') {
        try { json = JSON.parse(data) } catch { return NaN }
      }
      
      const result = JSONPath({ path, json, wrap: false })
      return parseFloat(result)
    } catch {
      return NaN
    }
  }

  /**
   * Check if a value is a valid coordinate
   */
  function isValidCoord(val: number): boolean {
    return typeof val === 'number' && !isNaN(val)
  }

  /**
   * Pan and zoom to specific location
   */
  function setView(lat: number, lon: number, zoom: number) {
    if (!map.value) return
    map.value.setView([lat, lon], zoom)
  }

  /**
   * Force map to recalculate its size
   * Call after container resize
   */
  function invalidateSize() {
    if (!map.value) return
    map.value.invalidateSize()
  }

  /**
   * Get a marker instance by ID
   */
  function getMarker(markerId: string): L.Marker | undefined {
    return markerInstances.get(markerId)
  }

  /**
   * Pan map to show selected marker with offset for panel
   * On mobile, offset upward for bottom sheet
   * On desktop, offset left for side panel
   */
  function panToMarkerWithOffset(markerId: string, isMobile: boolean) {
    const marker = markerInstances.get(markerId)
    if (!marker || !map.value) return
    
    const latlng = marker.getLatLng()
    const point = map.value.latLngToContainerPoint(latlng)
    
    if (isMobile) {
      // Offset upward for bottom sheet (move point up by 25% of container height)
      const container = map.value.getContainer()
      const offsetY = container.clientHeight * 0.15
      point.y -= offsetY
    } else {
      // Offset left for side panel (move point left by 140px, half panel width)
      point.x -= 140
    }
    
    const newLatLng = map.value.containerPointToLatLng(point)
    map.value.panTo(newLatLng)
  }

  /**
   * Cleanup map instance
   */
  function cleanup() {
    if (map.value) {
      map.value.remove()
      map.value = null
    }
    markersLayer.value = null
    tileLayer.value = null
    markerInstances.clear()
    selectedMarkerId = null
    initialized.value = false
  }

  return {
    map,
    initialized,
    initMap,
    updateTheme,
    renderMarkers,
    setSelectedMarker,
    updateMarkerPositions,
    panToMarkerWithOffset,
    setView,
    invalidateSize,
    getMarker,
    cleanup,
  }
}
