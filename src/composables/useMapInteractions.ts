// src/composables/useMapInteractions.ts
import { ref, watch, onUnmounted } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { useLeafletMap } from '@/composables/useLeafletMap'
import { createSwitchState, type SwitchState } from '@/composables/useSwitchState'
import { encodeString, decodeBytes } from '@/utils/encoding'
import { resolveTemplate } from '@/utils/variables'
import { Kvm } from '@nats-io/kv'
import { JSONPath } from 'jsonpath-plus'
import { jetstream, jetstreamManager } from '@nats-io/jetstream'
import type { MapMarkerItem, MapMarker } from '@/types/dashboard'

interface SwitchStateEntry {
  switchState: SwitchState
  stopWatch: () => void
}

interface SubscriptionEntry {
  stop: () => void
}

export function useMapInteractions(markersSource: () => MapMarker[]) {
  const natsStore = useNatsStore()
  const dashboardStore = useDashboardStore()
  
  // We need access to the DOM updaters from the map composable
  const { updateSwitchState, updateItemValue } = useLeafletMap()

  // UI State
  const actionFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null)
  const openMarkerId = ref<string | null>(null)
  
  // Response Modal State
  const responseModal = ref({
    show: false,
    title: 'Response',
    data: '',
    status: 'success' as 'success' | 'error',
    latency: 0
  })

  // Internal State Maps
  const activeSwitchStates = new Map<string, SwitchStateEntry>()
  const activeSubscriptions = new Map<string, SubscriptionEntry>()

  // --- Helpers ---

  function showFeedback(type: 'success' | 'error', message: string) {
    actionFeedback.value = { type, message }
    setTimeout(() => {
      if (actionFeedback.value?.message === message) {
        actionFeedback.value = null
      }
    }, 2000)
  }

  function calculateStartTime(windowStr: string | undefined): Date {
    const now = Date.now()
    if (!windowStr) return new Date(now - 10 * 60 * 1000)
    
    const match = windowStr.match(/^(\d+)([smhd])$/)
    if (!match) return new Date(now - 10 * 60 * 1000)
    
    const val = parseInt(match[1])
    const unit = match[2]
    let ms = 0
    
    switch (unit) {
      case 's': ms = val * 1000; break
      case 'm': ms = val * 60 * 1000; break
      case 'h': ms = val * 60 * 60 * 1000; break
      case 'd': ms = val * 24 * 60 * 60 * 1000; break
    }
    return new Date(now - ms)
  }

  // --- Handlers ---

  async function handlePublishItem(item: MapMarkerItem) {
    if (!natsStore.nc || !natsStore.isConnected) {
      showFeedback('error', 'Not connected to NATS')
      return
    }

    const subject = resolveTemplate(item.subject, dashboardStore.currentVariableValues)
    const payloadStr = resolveTemplate(item.payload || '{}', dashboardStore.currentVariableValues)

    if (!subject) {
      showFeedback('error', 'No subject configured')
      return
    }

    const payload = encodeString(payloadStr)

    if (item.actionType === 'request') {
      const timeout = item.timeout || 1000
      showFeedback('success', `Requesting ${subject}...`)
      const start = Date.now()

      try {
        const msg = await natsStore.nc.request(subject, payload, { timeout })
        
        actionFeedback.value = null // Clear toast
        
        responseModal.value = {
          show: true,
          title: item.label || 'Response',
          data: decodeBytes(msg.data),
          status: 'success',
          latency: Date.now() - start
        }
      } catch (err: any) {
        responseModal.value = {
          show: true,
          title: 'Request Failed',
          data: err.message || 'Request failed',
          status: 'error',
          latency: Date.now() - start
        }
      }
    } else {
      try {
        natsStore.nc.publish(subject, payload)
        showFeedback('success', `Published to ${subject}`)
      } catch (err: any) {
        console.error('[MapInteractions] Publish error:', err)
        showFeedback('error', 'Failed to publish')
      }
    }
  }

  function handleSwitchToggle(item: MapMarkerItem) {
    if (!natsStore.isConnected) {
      showFeedback('error', 'Not connected to NATS')
      return
    }

    const entry = activeSwitchStates.get(item.id)
    if (!entry) {
      console.warn('[MapInteractions] No switch state found for item:', item.id)
      return
    }

    entry.switchState.toggle()
  }

  function handlePopupOpen(markerId: string, _popupElement: HTMLElement) {
    openMarkerId.value = markerId
    const markers = markersSource()
    const marker = markers.find(m => m.id === markerId)
    if (!marker) return

    for (const item of marker.items) {
      if (item.type === 'switch' && item.switchConfig) {
        startSwitchStateWatcher(item)
      } else if (item.type === 'text' && item.textConfig) {
        startTextSubscription(item)
      } else if (item.type === 'kv' && item.kvConfig) {
        startKvWatcher(item)
      }
    }
  }

  function handlePopupClose(markerId: string) {
    openMarkerId.value = null
    const markers = markersSource()
    const marker = markers.find(m => m.id === markerId)
    if (!marker) return

    for (const item of marker.items) {
      if (item.type === 'switch') {
        stopSwitchStateWatcher(item.id)
      } else if (item.type === 'text' || item.type === 'kv') {
        stopSubscription(item.id)
      }
    }
  }

  // --- Subscription Logic ---

  async function startSwitchStateWatcher(item: MapMarkerItem) {
    if (!item.switchConfig) return

    if (activeSwitchStates.has(item.id)) {
      const existing = activeSwitchStates.get(item.id)!
      if (existing.switchState.isActive()) return
    }

    const vars = dashboardStore.currentVariableValues
    const resolvedConfig = {
      mode: item.switchConfig.mode,
      kvBucket: resolveTemplate(item.switchConfig.kvBucket, vars),
      kvKey: resolveTemplate(item.switchConfig.kvKey, vars),
      publishSubject: resolveTemplate(item.switchConfig.publishSubject, vars),
      stateSubject: resolveTemplate(item.switchConfig.stateSubject, vars),
      onPayload: item.switchConfig.onPayload,
      offPayload: item.switchConfig.offPayload,
      defaultState: 'off' as const
    }

    const switchState = createSwitchState(resolvedConfig)
    await switchState.start()

    updateSwitchState(item.id, switchState.state.value, item.switchConfig.labels)

    const stopWatch = watch(switchState.state, (newState) => {
      updateSwitchState(item.id, newState, item.switchConfig?.labels)
    })

    activeSwitchStates.set(item.id, { switchState, stopWatch })
  }

  function stopSwitchStateWatcher(itemId: string) {
    const entry = activeSwitchStates.get(itemId)
    if (entry) {
      entry.stopWatch()
      entry.switchState.stop()
      activeSwitchStates.delete(itemId)
    }
  }

  async function startTextSubscription(item: MapMarkerItem) {
    if (!natsStore.nc || !natsStore.isConnected || !item.textConfig) return
    
    const subject = resolveTemplate(item.textConfig.subject, dashboardStore.currentVariableValues)
    if (!subject) return

    try {
      if (item.textConfig.useJetStream) {
        const jsm = await jetstreamManager(natsStore.nc)
        let streamName: string
        try {
          streamName = await jsm.streams.find(subject)
        } catch (e) {
          updateItemValue(item.id, 'No Stream')
          return
        }

        const js = jetstream(natsStore.nc)
        const consumerOpts: any = {
          filter_subjects: [subject],
          deliver_policy: item.textConfig.deliverPolicy || 'last',
        }

        if (item.textConfig.deliverPolicy === 'by_start_time') {
          consumerOpts.opt_start_time = calculateStartTime(item.textConfig.timeWindow).toISOString()
        }

        const consumer = await js.consumers.get(streamName, consumerOpts)
        const messages = await consumer.consume()

        activeSubscriptions.set(item.id, {
          stop: () => { try { messages.stop() } catch {} }
        })

        ;(async () => {
          try {
            for await (const msg of messages) {
              msg.ack()
              processMessageData(item, msg.data)
            }
          } catch (err) {}
        })()

      } else {
        const sub = natsStore.nc.subscribe(subject)
        activeSubscriptions.set(item.id, {
          stop: () => { try { sub.unsubscribe() } catch {} }
        })

        ;(async () => {
          try {
            for await (const msg of sub) {
              processMessageData(item, msg.data)
            }
          } catch (err) {}
        })()
      }
    } catch (err: any) {
      console.error('[MapInteractions] Subscribe error:', err)
      updateItemValue(item.id, 'Error')
    }
  }

  function processMessageData(item: MapMarkerItem, rawData: Uint8Array) {
    const text = decodeBytes(rawData)
    let val: any = text
    try { val = JSON.parse(text) } catch {}
    
    if (item.textConfig?.jsonPath && typeof val === 'object') {
      try {
        const extracted = JSONPath({ path: item.textConfig.jsonPath, json: val, wrap: false })
        if (extracted !== undefined) val = extracted
      } catch {}
    }
    updateItemValue(item.id, String(val))
  }

  async function startKvWatcher(item: MapMarkerItem) {
    if (!natsStore.nc || !natsStore.isConnected || !item.kvConfig) return

    const bucket = resolveTemplate(item.kvConfig.kvBucket, dashboardStore.currentVariableValues)
    const key = resolveTemplate(item.kvConfig.kvKey, dashboardStore.currentVariableValues)
    
    if (!bucket || !key) return

    try {
      const kvm = new Kvm(natsStore.nc)
      const kv = await kvm.open(bucket)
      
      try {
        const entry = await kv.get(key)
        if (entry) processKvValue(item, entry.value)
        else updateItemValue(item.id, '<empty>')
      } catch {
        updateItemValue(item.id, '<empty>')
      }

      const iter = await kv.watch({ key })
      
      ;(async () => {
        try {
          for await (const e of iter) {
            if (e.key === key) {
              if (e.operation === 'PUT') processKvValue(item, e.value!)
              else if (e.operation === 'DEL' || e.operation === 'PURGE') updateItemValue(item.id, '<deleted>')
            }
          }
        } catch (err) {}
      })()

      activeSubscriptions.set(item.id, {
        stop: () => { try { iter.stop() } catch {} }
      })

    } catch (err) {
      console.error('[MapInteractions] KV error:', err)
      updateItemValue(item.id, 'Error')
    }
  }

  function processKvValue(item: MapMarkerItem, data: Uint8Array) {
    const text = decodeBytes(data)
    let val: any = text
    try { val = JSON.parse(text) } catch {}
    
    if (item.kvConfig?.jsonPath && typeof val === 'object') {
      try {
        const extracted = JSONPath({ path: item.kvConfig.jsonPath, json: val, wrap: false })
        if (extracted !== undefined) val = extracted
      } catch {}
    }
    updateItemValue(item.id, String(val))
  }

  function stopAll() {
    for (const entry of activeSwitchStates.values()) {
      entry.stopWatch()
      entry.switchState.stop()
    }
    activeSwitchStates.clear()

    for (const entry of activeSubscriptions.values()) {
      entry.stop()
    }
    activeSubscriptions.clear()
  }

  // --- Watchers ---

  // Re-subscribe if connection restores while popup is open
  watch(() => natsStore.isConnected, (connected) => {
    if (connected && openMarkerId.value) {
      const markers = markersSource()
      const marker = markers.find(m => m.id === openMarkerId.value)
      if (marker) {
        marker.items.forEach(item => {
          if (item.type === 'text' || item.type === 'kv') {
            stopSubscription(item.id)
            if (item.type === 'text' && item.textConfig) startTextSubscription(item)
            else if (item.type === 'kv' && item.kvConfig) startKvWatcher(item)
          }
        })
      }
    }
  })

  // Re-subscribe if variables change while popup is open
  watch(() => dashboardStore.currentVariableValues, () => {
    if (openMarkerId.value) {
      const markerId = openMarkerId.value
      const markers = markersSource()
      const marker = markers.find(m => m.id === markerId)
      if (marker) {
        // Stop all for this marker
        marker.items.forEach(a => {
          if (a.type === 'switch') stopSwitchStateWatcher(a.id)
          else if (a.type === 'text' || a.type === 'kv') stopSubscription(a.id)
        })
        // Restart all
        marker.items.forEach(a => {
          if (a.type === 'switch' && a.switchConfig) startSwitchStateWatcher(a)
          else if (a.type === 'text' && a.textConfig) startTextSubscription(a)
          else if (a.type === 'kv' && a.kvConfig) startKvWatcher(a)
        })
      }
    }
  }, { deep: true })

  function stopSubscription(itemId: string) {
    const entry = activeSubscriptions.get(itemId)
    if (entry) {
      entry.stop()
      activeSubscriptions.delete(itemId)
    }
  }

  onUnmounted(() => {
    stopAll()
  })

  return {
    actionFeedback,
    responseModal,
    callbacks: {
      onPublishItem: handlePublishItem,
      onSwitchToggle: handleSwitchToggle,
      onPopupOpen: handlePopupOpen,
      onPopupClose: handlePopupClose
    }
  }
}
