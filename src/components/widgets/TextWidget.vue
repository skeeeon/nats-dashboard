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
import { useThresholds } from '@/composables/useThresholds'
import type { WidgetConfig } from '@/types/dashboard'

const props = defineProps<{
  config: WidgetConfig
}>()

const dataStore = useWidgetDataStore()
const { evaluateThresholds } = useThresholds()

const fontSize = computed(() => props.config.textConfig?.fontSize || 24)
const configColor = computed(() => props.config.textConfig?.color)
const format = computed(() => props.config.textConfig?.format)
const thresholds = computed(() => props.config.textConfig?.thresholds || [])

const latestMessage = computed(() => {
  const buffer = dataStore.getBuffer(props.config.id)
  if (buffer.length === 0) return null
  return buffer[buffer.length - 1]
})

const latestValue = computed(() => latestMessage.value?.value)

const effectiveColor = computed(() => {
  const val = latestValue.value
  const thresholdColor = evaluateThresholds(val, thresholds.value)
  if (thresholdColor) return thresholdColor
  if (configColor.value) return configColor.value
  return null
})

const displayValue = computed(() => {
  const value = latestValue.value
  if (value === null || value === undefined) return 'Waiting...'
  if (format.value) {
    try { return format.value.replace('{value}', String(value)) } catch { return String(value) }
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
})

const timestamp = computed(() => {
  if (!latestMessage.value) return ''
  const date = new Date(latestMessage.value.timestamp)
  return date.toLocaleTimeString()
})

const showTimestamp = computed(() => latestMessage.value !== null)

const valueStyle = computed(() => {
  const style: Record<string, string> = {
    // Use clamp with cqw for responsive scaling, fallback to configured size
    fontSize: `clamp(12px, 15cqw, ${fontSize.value * 2}px)`,
    transition: 'color 0.3s ease'
  }
  if (effectiveColor.value) style.color = effectiveColor.value
  return style
})
</script>

<style scoped>
.text-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: var(--widget-bg);
  border-radius: 8px;
}

.value-display {
  font-weight: 600;
  text-align: center;
  word-break: break-word;
  line-height: 1.2;
  font-family: var(--mono);
  max-height: 100%;
  overflow-y: auto;
  color: var(--text);
}

.timestamp {
  margin-top: 8px;
  font-size: 11px;
  color: var(--muted);
  font-family: var(--mono);
}

/* Hide timestamp if widget is too short */
@container (height < 80px) {
  .timestamp { display: none; }
}
</style>
