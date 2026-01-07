/**
 * Leaflet Map Composable
 * 
 * Grug say: Handle all Leaflet stuff in one place.
 * Theme switching, marker rendering, popup actions.
 * 
 * V2: Supports both publish (button) and switch (toggle) actions.
 */

import { ref, shallowRef } from 'vue'
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
 * Popup event callbacks
 */
export interface PopupCallbacks {
  onPublishAction: (action: MapMarkerAction) => void
  onSwitchToggle: (action: MapMarkerAction) => void
  onPopupOpen: (markerId: string, popupElement: HTMLElement) => void
  onPopupClose: (markerId: string) => void
}

/**
 * Fix Leaflet's broken icon paths in bundlers
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
  
  // Track marker instances for popup events
  const markerInstances = new Map<string, L.Marker>()

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
    markerInstances.clear()

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
   * @param callbacks - Event callbacks for popup interactions
   */
  function renderMarkers(
    markers: MapMarker[],
    callbacks: PopupCallbacks
  ) {
    if (!map.value || !markersLayer.value) return

    // Clear existing markers
    markersLayer.value.clearLayers()
    markerInstances.clear()

    markers.forEach(markerConfig => {
      const { id, lat, lon, label, actions } = markerConfig

      // Create marker
      const marker = L.marker([lat, lon], {
        title: label
      })

      // Build popup content
      const popupContent = createPopupContent(id, label, actions, callbacks)
      const popup = L.popup({
        className: 'nats-map-popup',
        minWidth: 180,
        maxWidth: 300,
        closeButton: true,
      }).setContent(popupContent)
      
      marker.bindPopup(popup)

      // Track popup open/close events
      marker.on('popupopen', () => {
        const popupEl = popup.getElement()
        if (popupEl) {
          callbacks.onPopupOpen(id, popupEl)
        }
      })

      marker.on('popupclose', () => {
        callbacks.onPopupClose(id)
      })

      // Store reference and add to layer
      markerInstances.set(id, marker)
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
   * Create popup HTML content with action buttons/toggles
   */
  function createPopupContent(
    markerId: string,
    label: string,
    actions: MapMarkerAction[],
    callbacks: PopupCallbacks
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
        if (action.type === 'publish') {
          // Publish action - button
          const btn = createPublishButton(action, callbacks.onPublishAction)
          actionList.appendChild(btn)
        } else if (action.type === 'switch') {
          // Switch action - toggle
          const toggle = createSwitchToggle(action, callbacks.onSwitchToggle)
          actionList.appendChild(toggle)
        }
      })

      container.appendChild(actionList)
    } else {
      // No actions hint
      const hint = document.createElement('div')
      hint.className = 'map-popup-no-actions'
      hint.textContent = 'No actions configured'
      container.appendChild(hint)
    }

    return container
  }

  /**
   * Create publish action button
   */
  function createPublishButton(
    action: MapMarkerAction,
    onAction: (action: MapMarkerAction) => void
  ): HTMLElement {
    const btn = document.createElement('button')
    btn.className = 'map-popup-action-btn publish'
    btn.dataset.actionId = action.id
    btn.textContent = action.label

    btn.onclick = (e) => {
      e.stopPropagation()
      onAction(action)
      
      // Visual feedback
      btn.classList.add('action-success')
      const originalText = btn.textContent
      btn.textContent = '✓ Sent!'
      setTimeout(() => {
        btn.classList.remove('action-success')
        btn.textContent = originalText
      }, 1500)
    }

    return btn
  }

  /**
   * Create switch action toggle
   */
  function createSwitchToggle(
    action: MapMarkerAction,
    onToggle: (action: MapMarkerAction) => void
  ): HTMLElement {
    const container = document.createElement('div')
    container.className = 'map-popup-switch'
    container.dataset.actionId = action.id

    // Label
    const label = document.createElement('span')
    label.className = 'switch-label'
    label.textContent = action.label

    // Toggle track
    const track = document.createElement('button')
    track.className = 'switch-track'
    track.dataset.state = 'unknown'

    // Thumb
    const thumb = document.createElement('span')
    thumb.className = 'switch-thumb'
    track.appendChild(thumb)

    // State text
    const stateText = document.createElement('span')
    stateText.className = 'switch-state-text'
    stateText.textContent = '...'

    track.onclick = (e) => {
      e.stopPropagation()
      onToggle(action)
    }

    container.appendChild(label)
    container.appendChild(track)
    container.appendChild(stateText)

    return container
  }

  /**
   * Update switch toggle state in popup
   * Called by MapWidget when switch state changes
   */
  function updateSwitchState(
    actionId: string,
    state: 'on' | 'off' | 'pending' | 'unknown',
    labels?: { on?: string; off?: string }
  ) {
    // Find the switch element in any open popup
    const switchEl = document.querySelector(
      `.map-popup-switch[data-action-id="${actionId}"]`
    ) as HTMLElement | null

    if (!switchEl) return

    const track = switchEl.querySelector('.switch-track') as HTMLElement
    const stateText = switchEl.querySelector('.switch-state-text') as HTMLElement

    if (track) {
      track.dataset.state = state
      track.classList.remove('state-on', 'state-off', 'state-pending', 'state-unknown')
      track.classList.add(`state-${state}`)
    }

    if (stateText) {
      switch (state) {
        case 'on':
          stateText.textContent = labels?.on || 'ON'
          stateText.className = 'switch-state-text state-on'
          break
        case 'off':
          stateText.textContent = labels?.off || 'OFF'
          stateText.className = 'switch-state-text state-off'
          break
        case 'pending':
          stateText.textContent = '...'
          stateText.className = 'switch-state-text state-pending'
          break
        default:
          stateText.textContent = '?'
          stateText.className = 'switch-state-text state-unknown'
      }
    }
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
   * Get marker instance by ID
   */
  function getMarker(markerId: string): L.Marker | undefined {
    return markerInstances.get(markerId)
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
    markerInstances.clear()
    initialized.value = false
  }

  return {
    map,
    initialized,
    initMap,
    updateTheme,
    renderMarkers,
    updateSwitchState,
    setView,
    invalidateSize,
    getMarker,
    cleanup,
  }
}
