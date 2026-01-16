<template>
  <div class="marker-item-text">
    <span class="text-label">{{ item.label }}</span>
    <div class="text-value-row">
      <span class="text-value" :class="{ 'is-stale': isStale }">
        {{ displayValue }}
      </span>
      <span v-if="item.textConfig?.unit" class="text-unit">
        {{ item.textConfig.unit }}
      </span>
    </div>
    <div v-if="error" class="text-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { decodeBytes } from '@/utils/encoding'
import { resolveTemplate } from '@/utils/variables'
import { JSONPath } from 'jsonpath-plus'
import { jetstream, jetstreamManager } from '@nats-io/jetstream'
import type { MapMarkerItem } from '@/types/dashboard'

/**
 * Marker Item: Text Display
 * 
 * Subscribes to a NATS subject and displays the extracted value.
 * Supports Core and JetStream subscriptions.
 */

const props = defineProps<{
  item: MapMarkerItem
}>()

const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()

const value = ref<any>(null)
const error = ref<string | null>(null)
const lastUpdate = ref<number>(0)
const isStale = ref(false)

let subscription: any = null
let staleCheckInterval: number | null = null

const displayValue = computed(() => {
  if (error.value) return '—'
  if (value.value === null) return '...'
  return String(value.value)
})

// Calculate start time for JetStream time window
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

async function subscribe() {
  if (!natsStore.nc || !natsStore.isConnected || !props.item.textConfig) return
  
  const cfg = props.item.textConfig
  const subject = resolveTemplate(cfg.subject, dashboardStore.currentVariableValues)
  if (!subject) return
  
  error.value = null
  
  try {
    if (cfg.useJetStream) {
      // JetStream subscription
      const jsm = await jetstreamManager(natsStore.nc)
      let streamName: string
      
      try {
        streamName = await jsm.streams.find(subject)
      } catch {
        error.value = 'No Stream'
        return
      }
      
      const js = jetstream(natsStore.nc)
      const consumerOpts: any = {
        filter_subjects: [subject],
        deliver_policy: cfg.deliverPolicy || 'last',
        inactive_threshold: 30000 * 1_000_000 // 30s in nanoseconds
      }
      
      if (cfg.deliverPolicy === 'by_start_time') {
        consumerOpts.opt_start_time = calculateStartTime(cfg.timeWindow).toISOString()
      }
      
      const consumer = await js.consumers.get(streamName, consumerOpts)
      const messages = await consumer.consume()
      subscription = messages
      
      ;(async () => {
        try {
          for await (const msg of messages) {
            msg.ack()
            processMessage(msg.data)
          }
        } catch {
          // Iterator ended
        }
      })()
      
    } else {
      // Core NATS subscription
      const sub = natsStore.nc.subscribe(subject)
      subscription = sub
      
      ;(async () => {
        try {
          for await (const msg of sub) {
            processMessage(msg.data)
          }
        } catch {
          // Subscription ended
        }
      })()
    }
  } catch (err: any) {
    console.error('[MarkerItemText] Subscribe error:', err)
    error.value = err.message || 'Subscribe failed'
  }
}

function processMessage(rawData: Uint8Array) {
  try {
    const text = decodeBytes(rawData)
    let parsed: any = text
    
    try {
      parsed = JSON.parse(text)
    } catch {
      // Keep as string
    }
    
    // Apply JSONPath if configured
    if (props.item.textConfig?.jsonPath && typeof parsed === 'object') {
      try {
        const extracted = JSONPath({ 
          path: props.item.textConfig.jsonPath, 
          json: parsed, 
          wrap: false 
        })
        if (extracted !== undefined) {
          parsed = extracted
        }
      } catch {
        // Keep original
      }
    }
    
    value.value = parsed
    lastUpdate.value = Date.now()
    isStale.value = false
  } catch (err) {
    console.error('[MarkerItemText] Process error:', err)
  }
}

function unsubscribe() {
  if (subscription) {
    try {
      if (typeof subscription.stop === 'function') {
        subscription.stop()
      } else if (typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe()
      }
    } catch {
      // Ignore cleanup errors
    }
    subscription = null
  }
}

function startStaleCheck() {
  // Check every 10 seconds if data is stale (no update in 30s)
  staleCheckInterval = window.setInterval(() => {
    if (lastUpdate.value > 0 && Date.now() - lastUpdate.value > 30000) {
      isStale.value = true
    }
  }, 10000)
}

function stopStaleCheck() {
  if (staleCheckInterval) {
    clearInterval(staleCheckInterval)
    staleCheckInterval = null
  }
}

// Lifecycle
onMounted(() => {
  if (natsStore.isConnected) {
    subscribe()
  }
  startStaleCheck()
})

onUnmounted(() => {
  unsubscribe()
  stopStaleCheck()
})

// Reconnection handling
watch(() => natsStore.isConnected, (connected) => {
  if (connected) {
    unsubscribe()
    subscribe()
  } else {
    unsubscribe()
  }
})

// Variable changes - resubscribe
watch(() => dashboardStore.currentVariableValues, () => {
  if (natsStore.isConnected) {
    unsubscribe()
    subscribe()
  }
}, { deep: true })
</script>

<style scoped>
.marker-item-text {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.text-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  flex-shrink: 0;
}

.text-value-row {
  display: flex;
  align-items: baseline;
  gap: 3px;
  min-width: 0;
}

.text-value {
  font-size: 14px;
  font-weight: 600;
  font-family: var(--mono);
  color: var(--text);
  transition: opacity 0.3s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-value.is-stale {
  opacity: 0.5;
}

.text-unit {
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}

.text-error {
  font-size: 10px;
  color: var(--color-error);
  padding: 2px 6px;
  background: var(--color-error-bg);
  border-radius: 3px;
}
</style>
