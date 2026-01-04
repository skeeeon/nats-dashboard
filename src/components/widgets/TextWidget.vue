<template>
  <div class="text-widget">
    <div 
      class="value-display"
      :style="valueStyle"
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
import { useDesignTokens } from '@/composables/useDesignTokens'
import { useThresholds } from '@/composables/useThresholds'
import type { WidgetConfig } from '@/types/dashboard'

const props = defineProps<{
  config: WidgetConfig
}>()

const dataStore = useWidgetDataStore()
const { baseColors } = useDesignTokens()
const { evaluateThresholds } = useThresholds()

// Get configuration
const fontSize = computed(() => props.config.textConfig?.fontSize || 24)
const defaultColor = computed(() => props.config.textConfig?.color || baseColors.value.text)
const format = computed(() => props.config.textConfig?.format)
const thresholds = computed(() => props.config.textConfig?.thresholds || [])

// Get latest value from buffer
const latestMessage = computed(() => {
  const buffer = dataStore.getBuffer(props.config.id)
  if (buffer.length === 0) return null
  return buffer[buffer.length - 1]
})

const latestValue = computed(() => {
  return latestMessage.value?.value
})

// Determine Color (Threshold > Config > Default)
const currentColor = computed(() => {
  const val = latestValue.value
  const thresholdColor = evaluateThresholds(val, thresholds.value)
  
  if (thresholdColor) return thresholdColor
  return defaultColor.value
})

// Format display value
const displayValue = computed(() => {
  const value = latestValue.value
  
  if (value === null || value === undefined) {
    return 'Waiting for data...'
  }
  
  if (format.value) {
    try {
      return format.value.replace('{value}', String(value))
    } catch {
      return String(value)
    }
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  
  return String(value)
})

const timestamp = computed(() => {
  if (!latestMessage.value) return ''
  const date = new Date(latestMessage.value.timestamp)
  return date.toLocaleTimeString()
})

const showTimestamp = computed(() => latestMessage.value !== null)

const valueStyle = computed(() => ({
  fontSize: fontSize.value + 'px',
  color: currentColor.value,
  transition: 'color 0.3s ease'
}))
</script>

<style scoped>
.text-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--widget-bg);
  border-radius: 8px;
}

.value-display {
  font-weight: 600;
  text-align: center;
  word-break: break-word;
  line-height: 1.3;
  font-family: var(--mono);
  max-height: 100%;
  overflow-y: auto;
}

.timestamp {
  margin-top: 12px;
  font-size: 12px;
  color: var(--muted);
  font-family: var(--mono);
}
</style>
