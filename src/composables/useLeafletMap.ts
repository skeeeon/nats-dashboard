/**
 * Leaflet Map Composable
 * 
 * Grug say: Handle all Leaflet stuff in one place.
 * Theme switching, marker rendering, popup items.
 * 
 * V2: Supports publish, switch, text, and kv items.
 */

import { ref, shallowRef } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapMarker, MapMarkerItem } from '@/types/dashboard'

// Tile providers
const TILE_URLS = {
  light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
}

const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'

/**
 * Popup event callbacks - EXPORTED for use by MapWidget
 */
export interface PopupCallbacks {
  onPublishItem: (item: MapMarkerItem) => void
  onSwitchToggle: (item: MapMarkerItem) => void
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
   */
  function renderMarkers(markers: MapMarker[], callbacks: PopupCallbacks) {
    if (!map.value || !markersLayer.value) return

    // Clear existing markers
    markersLayer.value.clearLayers()
    markerInstances.clear()

    markers.forEach(markerConfig => {
      const { id, lat, lon, label, items } = markerConfig

      const marker = L.marker([lat, lon], { title: label })

      // Build popup content with callbacks wired up
      const popupContent = createPopupContent(id, label, items, callbacks)
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

      markerInstances.set(id, marker)
      markersLayer.value!.addLayer(marker)
    })

    // Fit bounds if multiple markers
    if (markers.length > 1) {
      const bounds = markers.map(m => [m.lat, m.lon] as [number, number])
      map.value.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    } else if (markers.length === 1) {
      map.value.setView([markers[0].lat, markers[0].lon], map.value.getZoom())
    }
  }

  /**
   * Create popup HTML content with item buttons/toggles/displays
   */
  function createPopupContent(
    _markerId: string,
    label: string,
    items: MapMarkerItem[],
    callbacks: PopupCallbacks
  ): HTMLElement {
    const container = document.createElement('div')
    container.className = 'map-popup-content'

    // Header
    const header = document.createElement('div')
    header.className = 'map-popup-header'
    header.textContent = label
    container.appendChild(header)

    // Items
    if (items.length > 0) {
      const itemList = document.createElement('div')
      itemList.className = 'map-popup-items'

      items.forEach(item => {
        if (item.type === 'publish') {
          const btn = createPublishButton(item, callbacks.onPublishItem)
          itemList.appendChild(btn)
        } else if (item.type === 'switch') {
          const toggle = createSwitchToggle(item, callbacks.onSwitchToggle)
          itemList.appendChild(toggle)
        } else if (item.type === 'text' || item.type === 'kv') {
          const display = createValueDisplay(item)
          itemList.appendChild(display)
        }
      })

      container.appendChild(itemList)
    } else {
      const hint = document.createElement('div')
      hint.className = 'map-popup-no-items'
      hint.textContent = 'No items configured'
      container.appendChild(hint)
    }

    return container
  }

  /**
   * Create publish item button
   */
  function createPublishButton(
    item: MapMarkerItem,
    onAction: (item: MapMarkerItem) => void
  ): HTMLElement {
    const btn = document.createElement('button')
    btn.className = 'map-popup-item-btn publish'
    btn.dataset.itemId = item.id
    btn.textContent = item.label

    btn.onclick = (e) => {
      e.stopPropagation()
      onAction(item)
      
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
   * Create switch item toggle
   */
  function createSwitchToggle(
    item: MapMarkerItem,
    onToggle: (item: MapMarkerItem) => void
  ): HTMLElement {
    const container = document.createElement('div')
    container.className = 'map-popup-switch'
    container.dataset.itemId = item.id

    // Label
    const label = document.createElement('span')
    label.className = 'switch-label'
    label.textContent = item.label

    // Toggle track
    const track = document.createElement('button')
    track.className = 'switch-track state-unknown'
    track.dataset.state = 'unknown'

    // Thumb
    const thumb = document.createElement('span')
    thumb.className = 'switch-thumb'
    track.appendChild(thumb)

    // State text
    const stateText = document.createElement('span')
    stateText.className = 'switch-state-text state-unknown'
    stateText.textContent = '...'

    track.onclick = (e) => {
      e.stopPropagation()
      onToggle(item)
    }

    container.appendChild(label)
    container.appendChild(track)
    container.appendChild(stateText)

    return container
  }

  /**
   * Create value display for Text/KV items
   */
  function createValueDisplay(item: MapMarkerItem): HTMLElement {
    const container = document.createElement('div')
    container.className = 'map-popup-value-display'
    container.dataset.itemId = item.id

    const label = document.createElement('span')
    label.className = 'value-label'
    label.textContent = item.label

    const value = document.createElement('span')
    value.className = 'value-text'
    value.textContent = '...' // Placeholder

    const unit = document.createElement('span')
    unit.className = 'value-unit'
    if (item.type === 'text' && item.textConfig?.unit) {
      unit.textContent = item.textConfig.unit
    }

    container.appendChild(label)
    container.appendChild(value)
    if (unit.textContent) container.appendChild(unit)

    return container
  }

  /**
   * Update switch toggle state in popup
   */
  function updateSwitchState(
    itemId: string,
    state: 'on' | 'off' | 'pending' | 'unknown',
    labels?: { on?: string; off?: string }
  ) {
    // Find the switch element in any open popup
    const switchEl = document.querySelector(
      `.map-popup-switch[data-item-id="${itemId}"]`
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
      stateText.classList.remove('state-on', 'state-off', 'state-pending', 'state-unknown')
      stateText.classList.add(`state-${state}`)
      
      switch (state) {
        case 'on':
          stateText.textContent = labels?.on || 'ON'
          break
        case 'off':
          stateText.textContent = labels?.off || 'OFF'
          break
        case 'pending':
          stateText.textContent = '...'
          break
        default:
          stateText.textContent = '?'
      }
    }
  }

  /**
   * Update value display in popup
   */
  function updateItemValue(itemId: string, value: string) {
    const displayEl = document.querySelector(
      `.map-popup-value-display[data-item-id="${itemId}"]`
    ) as HTMLElement | null

    if (!displayEl) return

    const valueText = displayEl.querySelector('.value-text')
    if (valueText) {
      valueText.textContent = value
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
    updateItemValue,
    setView,
    invalidateSize,
    getMarker,
    cleanup,
  }
}
