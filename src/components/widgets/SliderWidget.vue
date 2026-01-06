<template>
  <div class="slider-widget">
    <!-- Slider container -->
    <div class="slider-container" :class="{ 'is-disabled': isDisabled }">
      <!-- Current value display -->
      <div class="value-display">
        <span class="value-number">{{ displayValue }}</span>
        <span v-if="cfg.unit" class="value-unit">{{ cfg.unit }}</span>
      </div>
      
      <!-- Slider wrapper - FIXED: Stop all events from bubbling to grid -->
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
        
        <!-- Min/Max labels -->
        <div class="slider-labels">
          <span class="label-min">{{ cfg.min }}{{ cfg.unit }}</span>
          <span class="label-max">{{ cfg.max }}{{ cfg.unit }}</span>
        </div>
      </div>
    </div>
    
    <!-- Publish status - FIXED: Positioned absolutely to prevent layout shift -->
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
      <span class="disconnect-text">Not connected</span>
    </div>
    
    <!-- Confirmation Dialog -->
    <div v-if="showConfirm" class="confirm-overlay" @click.self="cancelConfirm">
      <div class="confirm-dialog">
        <div class="confirm-header">Confirm Change</div>
        <div class="confirm-body">
          {{ confirmMessage }}
        </div>
        <div class="confirm-actions">
          <button class="btn-cancel" @click="cancelConfirm">Cancel</button>
          <button class="btn-confirm" @click="confirmAction">Confirm</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { Kvm } from '@nats-io/kv'
import { JSONPath } from 'jsonpath-plus'
import type { WidgetConfig } from '@/types/dashboard'
import { encodeString, decodeBytes } from '@/utils/encoding'

/**
 * Slider Widget Component
 * 
 * Grug say: Drag slider, publish value when release.
 * Now smarter: Listens for updates (CORE or KV) and syncs position.
 * Doesn't jump while user is dragging.
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()

// Component state
const localValue = ref(0)
const isDragging = ref(false) // Critical: prevents remote updates while user interacts
const error = ref<string | null>(null)
const publishStatus = ref<string | null>(null)
const showConfirm = ref(false)
const pendingValue = ref<number | null>(null)

// NATS/KV references
let kvWatcher: any = null
let kvInstance: any = null
let subscription: any = null

// Configuration shortcuts
const cfg = computed(() => props.config.sliderConfig!)
const mode = computed(() => cfg.value.mode || 'core')
const isDisabled = computed(() => !natsStore.isConnected)

/**
 * Display value with formatting
 */
const displayValue = computed(() => {
  return localValue.value.toFixed(getDecimalPlaces(cfg.value.step))
})

/**
 * Get decimal places from step size
 */
function getDecimalPlaces(step: number): number {
  const str = step.toString()
  if (str.indexOf('.') === -1) return 0
  return str.split('.')[1].length
}

/**
 * Slider fill percentage for visual feedback
 */
const fillPercent = computed(() => {
  const range = cfg.value.max - cfg.value.min
  const value = localValue.value - cfg.value.min
  return (value / range) * 100
})

/**
 * Dynamic slider styling
 */
const sliderStyle = computed(() => ({
  '--fill-percent': `${fillPercent.value}%`
}))

/**
 * Status CSS class
 */
const statusClass = computed(() => {
  if (publishStatus.value?.includes('✓')) return 'status-success'
  if (publishStatus.value?.includes('⚠️')) return 'status-error'
  return ''
})

/**
 * Confirmation message
 */
const confirmMessage = computed(() => {
  if (cfg.value.confirmMessage) {
    return cfg.value.confirmMessage.replace('{value}', displayValue.value + (cfg.value.unit || ''))
  }
  return `Set value to ${displayValue.value}${cfg.value.unit || ''}?`
})

// --- Initialization ---

async function initialize() {
  if (!natsStore.isConnected) return
  
  error.value = null
  
  if (mode.value === 'kv') {
    await initializeKv()
  } else {
    await initializeCore()
  }
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

    // Get initial value
    try {
      const entry = await kv.get(key)
      if (entry) processIncomingData(decodeBytes(entry.value))
    } catch (e: any) {
      if (!e.message?.includes('key not found')) throw e
    }

    // Watch for changes
    const iter = await kv.watch({ key })
    kvWatcher = iter
    ;(async () => {
      try {
        for await (const e of iter) {
          if (e.key === key && e.operation === 'PUT') {
            processIncomingData(decodeBytes(e.value!))
          }
        }
      } catch (err) {
        // Ignore watch stop errors
      }
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
  // Determine subject to listen to (State Subject > Publish Subject)
  const subject = cfg.value.stateSubject || cfg.value.publishSubject
  if (!subject) return

  try {
    subscription = natsStore.nc!.subscribe(subject)
    ;(async () => {
      try {
        for await (const msg of subscription) {
          processIncomingData(decodeBytes(msg.data))
        }
      } catch (err) {
        // Ignore unsubscribe errors
      }
    })()
  } catch (err: any) {
    console.error('[Slider] Sub Error:', err)
    error.value = err.message
  }
}

// --- Data Processing ---

/**
 * Handles data coming FROM NATS/KV
 */
function processIncomingData(text: string) {
  // If user is dragging, IGNORE remote updates to prevent fighting
  if (isDragging.value) return

  try {
    let val: any = text
    
    // 1. Try to parse JSON
    try { val = JSON.parse(text) } catch {}

    // 2. Extract via JSONPath if configured
    if (props.config.jsonPath && typeof val === 'object') {
      const extracted = JSONPath({ path: props.config.jsonPath, json: val, wrap: false })
      if (extracted !== undefined) val = extracted
    }

    // 3. Convert to number
    const num = Number(val)
    if (!isNaN(num)) {
      localValue.value = num
    }
  } catch (err) {
    console.warn('[Slider] Failed to process incoming data', err)
  }
}

// --- User Interaction ---

function handleInput() {
  // Called while dragging - just updates local visual state
  isDragging.value = true
}

function handleRelease() {
  isDragging.value = false
  
  if (cfg.value.confirmOnChange) {
    pendingValue.value = localValue.value
    showConfirm.value = true
  } else {
    publishValue(localValue.value)
  }
}

function confirmAction() {
  if (pendingValue.value !== null) {
    publishValue(pendingValue.value)
  }
  cancelConfirm()
}

function cancelConfirm() {
  showConfirm.value = false
  pendingValue.value = null
  // We don't revert localValue here because the user might want to adjust slightly
  // But if a remote update comes in, it will overwrite the unconfirmed value
}

async function publishValue(val: number) {
  if (!natsStore.isConnected) {
    error.value = 'Not connected'
    return
  }

  error.value = null
  publishStatus.value = 'Publishing...'

  // 1. Format Payload
  let payloadStr = String(val)
  
  // Apply template if exists (e.g. '{"brightness": {{value}}}')
  if (cfg.value.valueTemplate) {
    payloadStr = cfg.value.valueTemplate.replace('{{value}}', String(val))
  }

  // Validate JSON if it looks like JSON
  if (payloadStr.trim().startsWith('{') || payloadStr.trim().startsWith('[')) {
    try {
      // Minify/Validate
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

// --- Lifecycle ---

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

// Re-init if config changes significantly
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
  padding: 20px;
  background: var(--widget-bg);
  position: relative;
}

.slider-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: 100%;
  max-width: 400px;
}

.slider-container.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

/* Value Display */
.value-display {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.value-number {
  font-size: 48px;
  font-weight: 700;
  font-family: var(--mono);
  color: var(--color-accent);
  line-height: 1;
}

.value-unit {
  font-size: 24px;
  font-weight: 500;
  color: var(--muted);
}

/* Slider Wrapper - Grid drag prevention using both class and event stopping */
.slider-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: default;
}

/* Slider Input */
.slider-input {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
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
  transform: scaleY(1.2);
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

.slider-input:active::-webkit-slider-thumb {
  transform: scale(1.3);
}

/* Firefox Thumb */
.slider-input::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: white;
  border: 3px solid var(--color-accent);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.2s;
}

.slider-input::-moz-range-thumb:hover {
  transform: scale(1.2);
}

/* Slider Labels */
.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
  font-family: var(--mono);
}

/* Publish Status - FIXED: Positioned absolutely to prevent layout shift */
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
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
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
  transition: opacity 0.2s;
}

.retry-btn:hover {
  opacity: 0.8;
}

/* Disconnected Overlay */
.disconnected-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
  border-radius: 4px;
  font-size: 11px;
  color: var(--color-error);
}

.disconnect-icon {
  font-size: 14px;
}

/* Confirmation Dialog */
.confirm-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.confirm-dialog {
  background: var(--panel);
  border: 2px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  min-width: 200px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.confirm-header {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text);
}

.confirm-body {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 16px;
  line-height: 1.4;
}

.confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-cancel,
.btn-confirm {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-confirm {
  background: var(--color-primary);
  color: white;
}

.btn-confirm:hover {
  background: var(--color-primary-hover);
}

/* Mobile Adjustments */
@media (max-width: 600px) {
  .value-number {
    font-size: 36px;
  }
  
  .value-unit {
    font-size: 18px;
  }
}
</style>
