<template>
  <div class="slider-widget">
    <!-- Slider container -->
    <div class="slider-container" :class="{ 'is-disabled': isDisabled }">
      <!-- Current value display -->
      <div class="value-display">
        <span class="value-number">{{ displayValue }}</span>
        <span v-if="cfg.unit" class="value-unit">{{ cfg.unit }}</span>
      </div>
      
      <!-- Slider input -->
      <div class="slider-wrapper">
        <input
          type="range"
          v-model.number="currentValue"
          :min="cfg.min"
          :max="cfg.max"
          :step="cfg.step"
          :disabled="isDisabled"
          @mouseup="handleRelease"
          @touchend="handleRelease"
          class="slider-input"
          :style="sliderStyle"
        />
        
        <!-- Min/Max labels -->
        <div class="slider-labels">
          <span class="label-min">{{ cfg.min }}{{ cfg.unit }}</span>
          <span class="label-max">{{ cfg.max }}{{ cfg.unit }}</span>
        </div>
      </div>
      
      <!-- Publish status -->
      <div v-if="publishStatus" class="publish-status" :class="statusClass">
        {{ publishStatus }}
      </div>
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
import { ref, computed, onMounted } from 'vue'
import { useNatsStore } from '@/stores/nats'
import type { WidgetConfig } from '@/types/dashboard'

/**
 * Slider Widget Component
 * 
 * Grug say: Drag slider, publish value when release.
 * Simple range control for IoT devices.
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()

// Component state
const currentValue = ref(0)
const lastPublishedValue = ref(0)
const error = ref<string | null>(null)
const publishStatus = ref<string | null>(null)
const showConfirm = ref(false)
const pendingValue = ref<number | null>(null)

// Configuration shortcut
const cfg = computed(() => props.config.sliderConfig!)
const isDisabled = computed(() => !natsStore.isConnected)

/**
 * Display value with formatting
 */
const displayValue = computed(() => {
  return currentValue.value.toFixed(getDecimalPlaces(cfg.value.step))
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
  const value = currentValue.value - cfg.value.min
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

/**
 * Handle slider release
 */
function handleRelease() {
  // Only publish if value changed
  if (currentValue.value === lastPublishedValue.value) {
    return
  }
  
  if (cfg.value.confirmOnChange) {
    pendingValue.value = currentValue.value
    showConfirm.value = true
  } else {
    publishValue(currentValue.value)
  }
}

/**
 * Confirm action
 */
function confirmAction() {
  if (pendingValue.value !== null) {
    publishValue(pendingValue.value)
  }
  cancelConfirm()
}

/**
 * Cancel confirmation
 */
function cancelConfirm() {
  showConfirm.value = false
  if (pendingValue.value !== null) {
    // Revert to last published value
    currentValue.value = lastPublishedValue.value
    pendingValue.value = null
  }
}

/**
 * Publish value to NATS
 */
function publishValue(value: number) {
  if (!natsStore.nc) {
    error.value = 'Not connected to NATS'
    return
  }
  
  error.value = null
  publishStatus.value = 'Publishing...'
  
  try {
    const encoder = new TextEncoder()
    const payload = encoder.encode(JSON.stringify({ value }))
    
    natsStore.nc.publish(cfg.value.publishSubject, payload)
    
    lastPublishedValue.value = value
    publishStatus.value = `✓ Published: ${displayValue.value}${cfg.value.unit || ''}`
    
    console.log(`[Slider] Published ${value} to ${cfg.value.publishSubject}`)
    
    // Clear status after 2 seconds
    setTimeout(() => {
      publishStatus.value = null
    }, 2000)
    
  } catch (err: any) {
    console.error('[Slider] Publish error:', err)
    error.value = err.message || 'Failed to publish'
    publishStatus.value = '⚠️ Publish failed'
  }
}

/**
 * Retry after error
 */
function retry() {
  error.value = null
  publishStatus.value = null
  publishValue(currentValue.value)
}

/**
 * Initialize
 */
onMounted(() => {
  currentValue.value = cfg.value.defaultValue
  lastPublishedValue.value = cfg.value.defaultValue
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

/* Slider Wrapper */
.slider-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
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

/* Publish Status */
.publish-status {
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 4px;
  transition: all 0.3s;
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
