<template>
  <div class="text-widget">
    <div 
      class="value-display"
      :style="{
        fontSize: fontSize + 'px',
        color: color,
      }"
    >
      {{ displayValue }}
    </div>
    <div v-if="showTimestamp" class="timestamp">
      {{ timestamp }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWidgetDataStore } from '@/stores/widgetData'
import type { WidgetConfig } from '@/types/dashboard'

/**
 * Text Widget
 * 
 * Grug say: Simplest widget. Just show latest value.
 * No fancy chart. No button. Just text on screen.
 * If this not work, nothing work.
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const dataStore = useWidgetDataStore()

// Get configuration
const fontSize = computed(() => props.config.textConfig?.fontSize || 24)
const color = computed(() => props.config.textConfig?.color || '#e0e0e0')
const format = computed(() => props.config.textConfig?.format)

// Get latest value from buffer
const latestMessage = computed(() => {
  const buffer = dataStore.getBuffer(props.config.id)
  if (buffer.length === 0) return null
  return buffer[buffer.length - 1]
})

const latestValue = computed(() => {
  return latestMessage.value?.value
})

// Format display value
const displayValue = computed(() => {
  const value = latestValue.value
  
  // No data yet
  if (value === null || value === undefined) {
    return 'Waiting for data...'
  }
  
  // Apply format template if specified
  if (format.value) {
    try {
      return format.value.replace('{value}', String(value))
    } catch {
      return String(value)
    }
  }
  
  // Default: stringify value
  // Handle objects/arrays nicely
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  
  return String(value)
})

// Show timestamp of latest message
const timestamp = computed(() => {
  if (!latestMessage.value) return ''
  const date = new Date(latestMessage.value.timestamp)
  return date.toLocaleTimeString()
})

// Show timestamp if we have data
const showTimestamp = computed(() => latestMessage.value !== null)
</script>

<style scoped>
.text-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.value-display {
  font-weight: 600;
  text-align: center;
  word-break: break-word;
  line-height: 1.3;
  font-family: var(--mono, 'Courier New', monospace);
}

.timestamp {
  margin-top: 12px;
  font-size: 12px;
  color: #888;
  font-family: var(--mono, 'Courier New', monospace);
}

/* Handle long text gracefully */
.value-display {
  max-height: 100%;
  overflow-y: auto;
}
</style>
