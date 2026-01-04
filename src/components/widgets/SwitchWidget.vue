<template>
  <div class="switch-widget">
    <!-- Switch container -->
    <div 
      class="switch-container"
      :class="{ 'is-disabled': isDisabled }"
    >
      <!-- Switch track - FIXED: Added vue-grid-item-no-drag class -->
      <div 
        class="switch-track vue-grid-item-no-drag"
        :class="switchStateClass"
        @click="handleToggle"
        :title="switchTooltip"
      >
        <!-- Switch thumb -->
        <div class="switch-thumb">
          <div v-if="isPending" class="spinner"></div>
          <div v-else class="thumb-icon">{{ thumbIcon }}</div>
        </div>
        
        <!-- Labels -->
        <div class="switch-labels">
          <span class="label-off">{{ offLabel }}</span>
          <span class="label-on">{{ onLabel }}</span>
        </div>
      </div>
      
      <!-- State text -->
      <div class="state-text" :class="switchStateClass">
        {{ stateDisplayText }}
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
        <div class="confirm-header">Confirm Action</div>
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
import type { WidgetConfig } from '@/types/dashboard'

/**
 * Switch Widget Component
 * 
 * Grug say: Toggle switch with two modes:
 * - KV mode: Stateful, uses KV bucket for state (kv.put/get/watch)
 * - CORE mode: Subscribe to state subject (nc.publish/subscribe)
 * 
 * Visual states: unknown, on, off, pending
 * 
 * FIXED: 
 * 1. Grid drag conflict - Added .vue-grid-item-no-drag class to switch-track
 * 2. KV mode now properly uses kv.put() instead of nc.publish()
 *    - KV mode writes directly to KV store with kv.put(key, value)
 *    - CORE mode publishes to subject with nc.publish(subject, payload)
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()

// Component state
type SwitchState = 'unknown' | 'on' | 'off' | 'pending'
const currentState = ref<SwitchState>('unknown')
const error = ref<string | null>(null)
const isPending = ref(false)

// Confirmation dialog
const showConfirm = ref(false)
const pendingAction = ref<'on' | 'off' | null>(null)

// KV watcher and instance
let kvWatcher: any = null
let kvInstance: any = null  // Store KV instance for writes

// CORE subscription
let subscription: any = null
const decoder = new TextDecoder()

// Configuration shortcuts
const cfg = computed(() => props.config.switchConfig!)
const mode = computed(() => cfg.value.mode)
const onLabel = computed(() => cfg.value.labels?.on || 'ON')
const offLabel = computed(() => cfg.value.labels?.off || 'OFF')
const isDisabled = computed(() => !natsStore.isConnected || isPending.value)

/**
 * Switch state CSS class
 */
const switchStateClass = computed(() => {
  return `state-${currentState.value}`
})

/**
 * Thumb icon based on state
 */
const thumbIcon = computed(() => {
  switch (currentState.value) {
    case 'on': return '✓'
    case 'off': return ''
    case 'unknown': return '?'
    default: return ''
  }
})

/**
 * State display text
 */
const stateDisplayText = computed(() => {
  switch (currentState.value) {
    case 'on': return onLabel.value
    case 'off': return offLabel.value
    case 'pending': return 'Updating...'
    case 'unknown': return 'Loading...'
  }
})

/**
 * Tooltip text
 */
const switchTooltip = computed(() => {
  if (isDisabled.value) return 'Disabled'
  return currentState.value === 'on' ? `Turn ${offLabel.value}` : `Turn ${onLabel.value}`
})

/**
 * Confirmation message
 */
const confirmMessage = computed(() => {
  if (cfg.value.confirmMessage) {
    return cfg.value.confirmMessage
  }
  const action = pendingAction.value === 'on' ? onLabel.value : offLabel.value
  return `Turn ${action}?`
})

/**
 * Initialize based on mode
 */
async function initialize() {
  if (!natsStore.nc || !natsStore.isConnected) {
    error.value = 'Not connected to NATS'
    return
  }
  
  error.value = null
  
  if (mode.value === 'kv') {
    await initializeKvMode()
  } else {
    await initializeCoreMode()
  }
}

/**
 * Initialize KV mode
 */
async function initializeKvMode() {
  const bucket = cfg.value.kvBucket
  const key = cfg.value.kvKey
  
  if (!bucket || !key) {
    error.value = 'KV bucket and key required'
    return
  }
  
  try {
    const kvm = new Kvm(natsStore.nc!)
    const kv = await kvm.open(bucket)
    
    // Store KV instance for writes
    kvInstance = kv
    
    // Get initial value
    const entry = await kv.get(key)
    if (entry) {
      const value = JSON.parse(decoder.decode(entry.value))
      updateStateFromValue(value)
    } else {
      currentState.value = 'off' // Default to off if no value
    }
    
    // Watch for changes
    const iter = await kv.watch({ key })
    kvWatcher = iter
    
    ;(async () => {
      try {
        for await (const e of iter) {
          if (e.key === key) {
            if (e.operation === 'PUT') {
              const value = JSON.parse(decoder.decode(e.value!))
              updateStateFromValue(value)
              isPending.value = false
            } else if (e.operation === 'DEL' || e.operation === 'PURGE') {
              currentState.value = 'off'
              isPending.value = false
            }
          }
        }
      } catch (err: any) {
        if (!err.message?.includes('connection closed')) {
          console.error('[Switch] KV watch error:', err)
          error.value = 'KV watch failed'
        }
      }
    })()
    
  } catch (err: any) {
    console.error('[Switch] KV init error:', err)
    if (err.message.includes('stream not found')) {
      error.value = `Bucket "${bucket}" not found`
    } else {
      error.value = err.message || 'Failed to initialize KV'
    }
  }
}

/**
 * Initialize CORE mode
 */
async function initializeCoreMode() {
  // Set default state
  currentState.value = cfg.value.defaultState || 'off'
  
  // Subscribe to state subject (defaults to publish subject)
  const stateSubject = cfg.value.stateSubject || cfg.value.publishSubject
  
  try {
    subscription = natsStore.nc!.subscribe(stateSubject)
    
    ;(async () => {
      try {
        for await (const msg of subscription) {
          const data = parseMessage(msg.data)
          updateStateFromValue(data)
          isPending.value = false
        }
      } catch (err: any) {
        if (!err.message?.includes('connection closed')) {
          console.error('[Switch] Subscription error:', err)
          error.value = 'Subscription failed'
        }
      }
    })()
    
  } catch (err: any) {
    console.error('[Switch] CORE init error:', err)
    error.value = err.message || 'Failed to subscribe'
  }
}

/**
 * Parse message data
 */
function parseMessage(data: Uint8Array): any {
  try {
    const text = decoder.decode(data)
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } catch {
    return null
  }
}

/**
 * Update state from received value
 */
function updateStateFromValue(value: any) {
  if (matchesPayload(value, cfg.value.onPayload)) {
    currentState.value = 'on'
  } else if (matchesPayload(value, cfg.value.offPayload)) {
    currentState.value = 'off'
  } else {
    // Value doesn't match either payload - keep current state
    console.warn('[Switch] Received value does not match on/off payloads:', value)
  }
}

/**
 * Check if value matches payload
 */
function matchesPayload(value: any, payload: any): boolean {
  return JSON.stringify(value) === JSON.stringify(payload)
}

/**
 * Handle toggle click
 */
function handleToggle() {
  if (isDisabled.value) return
  
  const targetState = currentState.value === 'on' ? 'off' : 'on'
  
  if (cfg.value.confirmOnChange) {
    pendingAction.value = targetState
    showConfirm.value = true
  } else {
    executeToggle(targetState)
  }
}

/**
 * Confirm action
 */
function confirmAction() {
  if (pendingAction.value) {
    executeToggle(pendingAction.value)
  }
  cancelConfirm()
}

/**
 * Cancel confirmation
 */
function cancelConfirm() {
  showConfirm.value = false
  pendingAction.value = null
}

/**
 * Execute toggle action
 * FIXED: Now properly handles KV mode vs CORE mode
 */
async function executeToggle(targetState: 'on' | 'off') {
  error.value = null
  isPending.value = true
  currentState.value = 'pending'
  
  const payload = targetState === 'on' ? cfg.value.onPayload : cfg.value.offPayload
  
  try {
    if (mode.value === 'kv') {
      // KV MODE: Write directly to KV store
      if (!kvInstance) {
        throw new Error('KV instance not initialized')
      }
      
      const key = cfg.value.kvKey!
      const encoder = new TextEncoder()
      const data = encoder.encode(JSON.stringify(payload))
      
      await kvInstance.put(key, data)
      
      console.log(`[Switch] KV put ${targetState} to ${cfg.value.kvBucket}/${key}`)
      
      // State will be updated via the watcher when KV confirms the write
      
    } else {
      // CORE MODE: Publish to subject
      if (!natsStore.nc) {
        throw new Error('Not connected to NATS')
      }
      
      const subject = cfg.value.publishSubject
      const data = serializePayload(payload)
      natsStore.nc.publish(subject, data)
      
      console.log(`[Switch] Published ${targetState} to ${subject}`)
      
      // For CORE mode without state subject, update immediately (fire & forget)
      if (!cfg.value.stateSubject) {
        currentState.value = targetState
        isPending.value = false
      }
    }
    
    // Set timeout for pending state (in case no confirmation)
    setTimeout(() => {
      if (isPending.value) {
        isPending.value = false
        error.value = 'No confirmation received'
      }
    }, 5000)
    
  } catch (err: any) {
    console.error('[Switch] Toggle error:', err)
    error.value = err.message || 'Failed to toggle switch'
    isPending.value = false
    currentState.value = targetState === 'on' ? 'off' : 'on' // Revert
  }
}

/**
 * Serialize payload to Uint8Array
 */
function serializePayload(payload: any): Uint8Array {
  const encoder = new TextEncoder()
  
  if (typeof payload === 'string') {
    return encoder.encode(payload)
  } else if (typeof payload === 'number' || typeof payload === 'boolean') {
    return encoder.encode(String(payload))
  } else {
    return encoder.encode(JSON.stringify(payload))
  }
}

/**
 * Retry after error
 */
function retry() {
  error.value = null
  initialize()
}

/**
 * Cleanup
 */
function cleanup() {
  if (kvWatcher) {
    try { kvWatcher.stop() } catch {}
    kvWatcher = null
  }
  
  // Clear KV instance reference
  kvInstance = null
  
  if (subscription) {
    try { subscription.unsubscribe() } catch {}
    subscription = null
  }
}

// Lifecycle
onMounted(() => {
  if (natsStore.isConnected) {
    initialize()
  }
})

onUnmounted(() => {
  cleanup()
})

// Watch for connection changes
watch(() => natsStore.isConnected, (connected) => {
  if (connected) {
    initialize()
  } else {
    cleanup()
    currentState.value = 'unknown'
  }
})

// Watch for config changes
watch(() => props.config.switchConfig, () => {
  cleanup()
  if (natsStore.isConnected) {
    initialize()
  }
}, { deep: true })
</script>

<style scoped>
.switch-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--widget-bg);
  position: relative;
}

.switch-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.switch-container.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

/* Switch Track - Grid drag prevention handled by .vue-grid-item-no-drag class */
.switch-track {
  position: relative;
  width: 120px;
  height: 56px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 28px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid var(--border);
}

.switch-track:hover {
  transform: scale(1.05);
}

.switch-track.state-on {
  background: var(--color-success);
  border-color: var(--color-success);
}

.switch-track.state-off {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--border);
}

.switch-track.state-pending {
  background: var(--color-warning);
  border-color: var(--color-warning);
}

.switch-track.state-unknown {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--muted);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Switch Thumb */
.switch-thumb {
  position: absolute;
  top: 4px;
  width: 44px;
  height: 44px;
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.state-off .switch-thumb {
  left: 4px;
}

.state-on .switch-thumb,
.state-pending .switch-thumb {
  left: calc(100% - 48px);
}

.thumb-icon {
  font-size: 20px;
  font-weight: bold;
  color: #333;
}

.state-on .thumb-icon {
  color: var(--color-success);
}

/* Spinner */
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-top-color: #333;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Labels */
.switch-labels {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  pointer-events: none;
}

.label-off,
.label-on {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.6);
  transition: opacity 0.3s;
}

.state-on .label-off,
.state-off .label-on {
  opacity: 0.3;
}

/* State Text */
.state-text {
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  transition: color 0.3s;
}

.state-text.state-on {
  color: var(--color-success);
}

.state-text.state-off {
  color: var(--muted);
}

.state-text.state-pending {
  color: var(--color-warning);
}

.state-text.state-unknown {
  color: var(--muted);
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
</style>
