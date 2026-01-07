<template>
  <div class="slider-widget">
    <!-- Slider container -->
    <div class="slider-container" :class="{ 'is-disabled': isDisabled }">
      <!-- Current value display -->
      <div class="value-display">
        <span class="value-number">{{ displayValue }}</span>
        <span v-if="cfg.unit" class="value-unit">{{ cfg.unit }}</span>
      </div>
      
      <!-- Slider wrapper -->
      <div 
        class="slider-wrapper vue-grid-item-no-drag"
        @mousedown.stop
        @touchstart.stop
        @pointermove.stop
      >
        <input
          type="range"
          v-model.number="localValue"
          :min="cfg.min"
          :max="cfg.max"
          :step="cfg.step"
          :disabled="isDisabled"
          @mousedown="isDragging = true"
          @touchstart="isDragging = true"
          @mouseup="handleRelease"
          @touchend="handleRelease"
          @input="handleInput"
          class="slider-input"
          :style="sliderStyle"
        />
        
        <!-- Min/Max labels (Hidden on small width) -->
        <div class="slider-labels">
          <span class="label-min">{{ cfg.min }}{{ cfg.unit }}</span>
          <span class="label-max">{{ cfg.max }}{{ cfg.unit }}</span>
        </div>
      </div>
    </div>
    
    <!-- Publish status -->
    <div v-if="publishStatus" class="publish-status" :class="statusClass">
      {{ publishStatus }}
    </div>
    
    <!-- Error message -->
    <div v-if="error" class="error-message">
      {{ error }}
      <button class="retry-btn" @click="retry">Retry</button>
    </div>
    
    <!-- Disconnected overlay -->
    <div v-if="!natsStore.isConnected" class="disconnected-overlay">
      <span class="disconnect-icon">⚠️</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { Kvm } from '@nats-io/kv'
import { JSONPath } from 'jsonpath-plus'
import type { WidgetConfig } from '@/types/dashboard'
import { encodeString, decodeBytes } from '@/utils/encoding'

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()
const requestConfirm = inject('requestConfirm') as (title: string, message: string, onConfirm: () => void) => void

// Component state
const localValue = ref(0)
const isDragging = ref(false)
const error = ref<string | null>(null)
const publishStatus = ref<string | null>(null)
const pendingValue = ref<number | null>(null)

// NATS/KV references
let kvWatcher: any = null
let kvInstance: any = null
let subscription: any = null

// Configuration shortcuts
const cfg = computed(() => props.config.sliderConfig!)
const mode = computed(() => cfg.value.mode || 'core')
const isDisabled = computed(() => !natsStore.isConnected)

const displayValue = computed(() => {
  return localValue.value.toFixed(getDecimalPlaces(cfg.value.step))
})

function getDecimalPlaces(step: number): number {
  const str = step.toString()
  if (str.indexOf('.') === -1) return 0
  return str.split('.')[1].length
}

const fillPercent = computed(() => {
  const range = cfg.value.max - cfg.value.min
  const value = localValue.value - cfg.value.min
  return (value / range) * 100
})

const sliderStyle = computed(() => ({
  '--fill-percent': `${fillPercent.value}%`
}))

const statusClass = computed(() => {
  if (publishStatus.value?.includes('✓')) return 'status-success'
  if (publishStatus.value?.includes('⚠️')) return 'status-error'
  return ''
})

async function initialize() {
  if (!natsStore.isConnected) return
  error.value = null
  if (mode.value === 'kv') await initializeKv()
  else await initializeCore()
}

async function initializeKv() {
  const bucket = cfg.value.kvBucket
  const key = cfg.value.kvKey
  if (!bucket || !key) {
    error.value = 'KV Bucket/Key required'
    return
  }

  try {
    const kvm = new Kvm(natsStore.nc!)
    const kv = await kvm.open(bucket)
    kvInstance = kv

    try {
      const entry = await kv.get(key)
      if (entry) processIncomingData(decodeBytes(entry.value))
    } catch (e: any) {
      if (!e.message?.includes('key not found')) throw e
    }

    const iter = await kv.watch({ key })
    kvWatcher = iter
    ;(async () => {
      try {
        for await (const e of iter) {
          if (e.key === key && e.operation === 'PUT') {
            processIncomingData(decodeBytes(e.value!))
          }
        }
      } catch (err) {}
    })()
  } catch (err: any) {
    console.error('[Slider] KV Error:', err)
    if (err.message.includes('stream not found')) {
      error.value = `Bucket "${bucket}" not found`
    } else {
      error.value = err.message
    }
  }
}

async function initializeCore() {
  const subject = cfg.value.stateSubject || cfg.value.publishSubject
  if (!subject) return

  try {
    subscription = natsStore.nc!.subscribe(subject)
    ;(async () => {
      try {
        for await (const msg of subscription) {
          processIncomingData(decodeBytes(msg.data))
        }
      } catch (err) {}
    })()
  } catch (err: any) {
    console.error('[Slider] Sub Error:', err)
    error.value = err.message
  }
}

function processIncomingData(text: string) {
  if (isDragging.value) return
  try {
    let val: any = text
    try { val = JSON.parse(text) } catch {}
    if (props.config.jsonPath && typeof val === 'object') {
      const extracted = JSONPath({ path: props.config.jsonPath, json: val, wrap: false })
      if (extracted !== undefined) val = extracted
    }
    const num = Number(val)
    if (!isNaN(num)) localValue.value = num
  } catch (err) {
    console.warn('[Slider] Failed to process incoming data', err)
  }
}

function handleInput() {
  isDragging.value = true
}

function handleRelease() {
  isDragging.value = false
  
  if (cfg.value.confirmOnChange) {
    pendingValue.value = localValue.value
    const message = cfg.value.confirmMessage 
      ? cfg.value.confirmMessage.replace('{value}', displayValue.value + (cfg.value.unit || ''))
      : `Set value to ${displayValue.value}${cfg.value.unit || ''}?`
      
    requestConfirm('Confirm Change', message, () => {
      if (pendingValue.value !== null) publishValue(pendingValue.value)
      pendingValue.value = null
    })
  } else {
    publishValue(localValue.value)
  }
}

async function publishValue(val: number) {
  if (!natsStore.isConnected) {
    error.value = 'Not connected'
    return
  }

  error.value = null
  publishStatus.value = 'Publishing...'

  let payloadStr = String(val)
  if (cfg.value.valueTemplate) {
    payloadStr = cfg.value.valueTemplate.replace('{{value}}', String(val))
  }

  if (payloadStr.trim().startsWith('{') || payloadStr.trim().startsWith('[')) {
    try {
      payloadStr = JSON.stringify(JSON.parse(payloadStr))
    } catch (e) {
      error.value = "Invalid JSON Template"
      publishStatus.value = '⚠️ Error'
      return
    }
  }

  const data = encodeString(payloadStr)

  try {
    if (mode.value === 'kv') {
      if (!kvInstance || !cfg.value.kvKey) throw new Error('KV not initialized')
      await kvInstance.put(cfg.value.kvKey, data)
    } else {
      natsStore.nc!.publish(cfg.value.publishSubject, data)
    }
    
    publishStatus.value = `✓ Sent: ${val}${cfg.value.unit || ''}`
    setTimeout(() => {
      if (publishStatus.value?.includes('✓')) publishStatus.value = null
    }, 2000)
  } catch (err: any) {
    console.error('[Slider] Publish Error:', err)
    error.value = err.message
    publishStatus.value = '⚠️ Failed'
  }
}

function retry() {
  error.value = null
  initialize()
}

function cleanup() {
  if (kvWatcher) { try { kvWatcher.stop() } catch {} }
  if (subscription) { try { subscription.unsubscribe() } catch {} }
  kvWatcher = null
  subscription = null
  kvInstance = null
}

onMounted(() => {
  localValue.value = cfg.value.defaultValue
  if (natsStore.isConnected) initialize()
})

onUnmounted(cleanup)

watch(() => natsStore.isConnected, (connected) => {
  if (connected) initialize()
  else cleanup()
})

watch(() => [
  cfg.value.mode, 
  cfg.value.kvBucket, 
  cfg.value.kvKey, 
  cfg.value.stateSubject, 
  cfg.value.publishSubject
], () => {
  cleanup()
  if (natsStore.isConnected) initialize()
})
</script>

<style scoped>
.slider-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--widget-bg);
  position: relative;
}

.slider-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 400px;
}

.slider-container.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

/* Value Display - Responsive */
.value-display {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.value-number {
  font-size: clamp(24px, 20cqw, 48px);
  font-weight: 700;
  font-family: var(--mono);
  color: var(--color-accent);
  line-height: 1;
}

.value-unit {
  font-size: clamp(16px, 10cqw, 24px);
  font-weight: 500;
  color: var(--muted);
}

/* Slider Wrapper */
.slider-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: default;
}

/* Slider Input - Thicker track */
.slider-input {
  -webkit-appearance: none;
  width: 100%;
  height: 12px; /* Thicker */
  border-radius: 6px;
  background: linear-gradient(
    to right,
    var(--color-accent) 0%,
    var(--color-accent) var(--fill-percent),
    rgba(255, 255, 255, 0.1) var(--fill-percent),
    rgba(255, 255, 255, 0.1) 100%
  );
  outline: none;
  cursor: pointer;
  transition: all 0.2s;
}

.slider-input:hover {
  transform: scaleY(1.1);
}

.slider-input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* Webkit Thumb */
.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: white;
  border: 3px solid var(--color-accent);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.2s;
}

.slider-input::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4);
}

/* Slider Labels - Hide on small width */
.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 18px;
  color: var(--muted);
  font-family: var(--mono);
}

@container (width < 150px) {
  .slider-labels { display: none; }
}

/* Publish Status */
.publish-status {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 4px;
  transition: all 0.3s;
  white-space: nowrap;
  animation: slideInUp 0.3s ease-out;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 5;
}

@keyframes slideInUp {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.publish-status.status-success {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.publish-status.status-error {
  color: var(--color-error);
  background: var(--color-error-bg);
}

/* Error Message */
.error-message {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
  border-radius: 4px;
  padding: 8px;
  font-size: 11px;
  color: var(--color-error);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  z-index: 10;
}

.retry-btn {
  padding: 4px 8px;
  background: var(--color-error);
  color: white;
  border: none;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

/* Disconnected Overlay */
.disconnected-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
  pointer-events: none;
}

.disconnect-icon {
  font-size: 14px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
}
</style>
