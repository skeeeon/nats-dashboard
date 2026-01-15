// src/composables/useLeafletMap.ts
import { ref, shallowRef } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapMarker, MapMarkerItem } from '@/types/dashboard'
import { JSONPath } from 'jsonpath-plus'
import { resolveTemplate } from '@/utils/variables'
import type { BufferedMessage } from '@/stores/widgetData'

// Tile providers
const TILE_URLS = {
  light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
}

const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'

export interface PopupCallbacks {
  onPublishItem: (item: MapMarkerItem) => void
  onSwitchToggle: (item: MapMarkerItem) => void
  onPopupOpen: (markerId: string, popupElement: HTMLElement) => void
  onPopupClose: (markerId: string) => void
}

function fixLeafletIcons() {
  // @ts-ignore
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
  
  const markerInstances = new Map<string, L.Marker>()

  function initMap(
    containerId: string,
    center: { lat: number; lon: number },
    zoom: number,
    isDarkMode: boolean
  ) {
    if (map.value) {
      map.value.remove()
      map.value = null
    }
    markerInstances.clear()
    fixLeafletIcons()

    const container = document.getElementById(containerId)
    if (container) {
      if ((container as any)._leaflet_id) {
        ;(container as any)._leaflet_id = null
      }
    } else {
      return
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

    setTimeout(() => {
      mapInstance.invalidateSize()
    }, 100)
  }

  function updateTheme(isDarkMode: boolean) {
    if (!map.value) return
    if (tileLayer.value) map.value.removeLayer(tileLayer.value)

    const url = isDarkMode ? TILE_URLS.dark : TILE_URLS.light
    const newTileLayer = L.tileLayer(url, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19
    })
    newTileLayer.addTo(map.value)
    tileLayer.value = newTileLayer
  }

  function renderMarkers(markers: MapMarker[], callbacks: PopupCallbacks) {
    if (!map.value || !markersLayer.value) return

    markersLayer.value.clearLayers()
    markerInstances.clear()

    markers.forEach(markerConfig => {
      const { id, lat, lon, label, items } = markerConfig
      
      // Use configured lat/lon as initial position
      const marker = L.marker([lat, lon], { title: label })

      const popupContent = createPopupContent(id, label, items, callbacks)
      const popup = L.popup({
        className: 'nats-map-popup',
        minWidth: 180,
        maxWidth: 300,
        closeButton: true,
      }).setContent(popupContent)
      
      marker.bindPopup(popup)

      marker.on('popupopen', () => {
        const popupEl = popup.getElement()
        if (popupEl) callbacks.onPopupOpen(id, popupEl)
      })

      marker.on('popupclose', () => {
        callbacks.onPopupClose(id)
      })

      markerInstances.set(id, marker)
      markersLayer.value!.addLayer(marker)
    })
  }

  /**
   * Update marker positions based on incoming messages
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
      
      // Find latest message matching this subject
      // Iterate backwards for speed
      let match: BufferedMessage | undefined
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].subject === resolvedSubject) {
          match = messages[i]
          break
        }
      }

      if (match) {
        // Extract Lat/Lon
        const lat = extractValue(match.value, pos.latJsonPath)
        const lon = extractValue(match.value, pos.lonJsonPath)

        if (isValidCoord(lat) && isValidCoord(lon)) {
          const leafletMarker = markerInstances.get(marker.id)
          if (leafletMarker) {
            const current = leafletMarker.getLatLng()
            // Only update if moved significantly (micro-optimization)
            if (Math.abs(current.lat - lat) > 0.000001 || Math.abs(current.lng - lon) > 0.000001) {
              leafletMarker.setLatLng([lat, lon])
            }
          }
        }
      }
    })
  }

  function extractValue(data: any, path?: string): number {
    if (!path) return NaN
    try {
      // If data is object, query it. If string, try parse.
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

  function isValidCoord(val: number): boolean {
    return typeof val === 'number' && !isNaN(val)
  }

  // ... createPopupContent and other helpers (unchanged) ...
  function createPopupContent(
    _markerId: string,
    label: string,
    items: MapMarkerItem[],
    callbacks: PopupCallbacks
  ): HTMLElement {
    const container = document.createElement('div')
    container.className = 'map-popup-content'

    const header = document.createElement('div')
    header.className = 'map-popup-header'
    header.textContent = label
    container.appendChild(header)

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

  function createSwitchToggle(
    item: MapMarkerItem,
    onToggle: (item: MapMarkerItem) => void
  ): HTMLElement {
    const container = document.createElement('div')
    container.className = 'map-popup-switch'
    container.dataset.itemId = item.id

    const label = document.createElement('span')
    label.className = 'switch-label'
    label.textContent = item.label

    const track = document.createElement('button')
    track.className = 'switch-track state-unknown'
    track.dataset.state = 'unknown'

    const thumb = document.createElement('span')
    thumb.className = 'switch-thumb'
    track.appendChild(thumb)

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

  function createValueDisplay(item: MapMarkerItem): HTMLElement {
    const container = document.createElement('div')
    container.className = 'map-popup-value-display'
    container.dataset.itemId = item.id

    const label = document.createElement('span')
    label.className = 'value-label'
    label.textContent = item.label

    const value = document.createElement('span')
    value.className = 'value-text'
    value.textContent = '...' 

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

  function updateSwitchState(
    itemId: string,
    state: 'on' | 'off' | 'pending' | 'unknown',
    labels?: { on?: string; off?: string }
  ) {
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

  function setView(lat: number, lon: number, zoom: number) {
    if (!map.value) return
    map.value.setView([lat, lon], zoom)
  }

  function invalidateSize() {
    if (!map.value) return
    map.value.invalidateSize()
  }

  function getMarker(markerId: string): L.Marker | undefined {
    return markerInstances.get(markerId)
  }

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
    updateMarkerPositions, // Exported
    updateSwitchState,
    updateItemValue,
    setView,
    invalidateSize,
    getMarker,
    cleanup,
  }
}
