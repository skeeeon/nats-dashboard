<template>
  <div class="switch-widget">
    <!-- Switch container -->
    <div 
      class="switch-container"
      :class="{ 'is-disabled': isDisabled }"
    >
      <!-- Switch track -->
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
        
        <!-- Labels (Hidden on small sizes) -->
        <div class="switch-labels">
          <span class="label-off">{{ offLabel }}</span>
          <span class="label-on">{{ onLabel }}</span>
        </div>
      </div>
      
      <!-- State text (Hidden on small sizes) -->
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { Kvm } from '@nats-io/kv'
import type { WidgetConfig } from '@/types/dashboard'
import { decodeBytes, encodeString } from '@/utils/encoding'

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()
const requestConfirm = inject('requestConfirm') as (title: string, message: string, onConfirm: () => void) => void

// Component state
type SwitchState = 'unknown' | 'on' | 'off' | 'pending'
const currentState = ref<SwitchState>('unknown')
const error = ref<string | null>(null)
const isPending = ref(false)

// KV watcher and instance
let kvWatcher: any = null
let kvInstance: any = null
let subscription: any = null

// Configuration shortcuts
const cfg = computed(() => props.config.switchConfig!)
const mode = computed(() => cfg.value.mode)
const onLabel = computed(() => cfg.value.labels?.on || 'ON')
const offLabel = computed(() => cfg.value.labels?.off || 'OFF')
const isDisabled = computed(() => !natsStore.isConnected || isPending.value)

const switchStateClass = computed(() => `state-${currentState.value}`)

const thumbIcon = computed(() => {
  switch (currentState.value) {
    case 'on': return '✓'
    case 'off': return ''
    case 'unknown': return '?'
    default: return ''
  }
})

const stateDisplayText = computed(() => {
  switch (currentState.value) {
    case 'on': return onLabel.value
    case 'off': return offLabel.value
    case 'pending': return 'Updating...'
    case 'unknown': return 'Loading...'
  }
})

const switchTooltip = computed(() => {
  if (isDisabled.value) return 'Disabled'
  return currentState.value === 'on' ? `Turn ${offLabel.value}` : `Turn ${onLabel.value}`
})

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
    kvInstance = kv
    
    const entry = await kv.get(key)
    if (entry) {
      const value = JSON.parse(decodeBytes(entry.value))
      updateStateFromValue(value)
    } else {
      currentState.value = 'off'
    }
    
    const iter = await kv.watch({ key })
    kvWatcher = iter
    
    ;(async () => {
      try {
        for await (const e of iter) {
          if (e.key === key) {
            if (e.operation === 'PUT') {
              const value = JSON.parse(decodeBytes(e.value!))
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

async function initializeCoreMode() {
  currentState.value = cfg.value.defaultState || 'off'
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

function parseMessage(data: Uint8Array): any {
  try {
    const text = decodeBytes(data)
    try { return JSON.parse(text) } catch { return text }
  } catch { return null }
}

function updateStateFromValue(value: any) {
  if (matchesPayload(value, cfg.value.onPayload)) {
    currentState.value = 'on'
  } else if (matchesPayload(value, cfg.value.offPayload)) {
    currentState.value = 'off'
  } else {
    console.warn('[Switch] Received value does not match on/off payloads:', value)
  }
}

function matchesPayload(value: any, payload: any): boolean {
  return JSON.stringify(value) === JSON.stringify(payload)
}

function handleToggle() {
  if (isDisabled.value) return
  
  const targetState = currentState.value === 'on' ? 'off' : 'on'
  
  if (cfg.value.confirmOnChange) {
    const action = targetState === 'on' ? onLabel.value : offLabel.value
    const message = cfg.value.confirmMessage || `Turn ${action}?`
    
    requestConfirm('Confirm Action', message, () => {
      executeToggle(targetState)
    })
  } else {
    executeToggle(targetState)
  }
}

async function executeToggle(targetState: 'on' | 'off') {
  error.value = null
  isPending.value = true
  currentState.value = 'pending'
  
  const payload = targetState === 'on' ? cfg.value.onPayload : cfg.value.offPayload
  
  try {
    if (mode.value === 'kv') {
      if (!kvInstance) throw new Error('KV instance not initialized')
      const key = cfg.value.kvKey!
      const data = encodeString(JSON.stringify(payload))
      await kvInstance.put(key, data)
    } else {
      if (!natsStore.nc) throw new Error('Not connected to NATS')
      const subject = cfg.value.publishSubject
      const data = serializePayload(payload)
      natsStore.nc.publish(subject, data)
      
      if (!cfg.value.stateSubject) {
        currentState.value = targetState
        isPending.value = false
      }
    }
    
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
    currentState.value = targetState === 'on' ? 'off' : 'on'
  }
}

function serializePayload(payload: any): Uint8Array {
  if (typeof payload === 'string') return encodeString(payload)
  else if (typeof payload === 'number' || typeof payload === 'boolean') return encodeString(String(payload))
  else return encodeString(JSON.stringify(payload))
}

function retry() {
  error.value = null
  initialize()
}

function cleanup() {
  if (kvWatcher) { try { kvWatcher.stop() } catch {} kvWatcher = null }
  kvInstance = null
  if (subscription) { try { subscription.unsubscribe() } catch {} subscription = null }
}

onMounted(() => {
  if (natsStore.isConnected) initialize()
})

onUnmounted(cleanup)

watch(() => natsStore.isConnected, (connected) => {
  if (connected) initialize()
  else {
    cleanup()
    currentState.value = 'unknown'
  }
})

watch(() => props.config.switchConfig, () => {
  cleanup()
  if (natsStore.isConnected) initialize()
}, { deep: true })
</script>

<style scoped>
.switch-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: var(--widget-bg);
  position: relative;
}

.switch-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  height: 100%;
}

.switch-container.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

/* Switch Track - Responsive Sizing */
.switch-track {
  position: relative;
  width: 80%;
  max-width: 120px;
  height: 40%;
  max-height: 56px;
  min-height: 32px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px; /* Pill shape */
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

/* Switch Thumb - Responsive */
.switch-thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  aspect-ratio: 1/1;
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.state-off .switch-thumb {
  left: 2px;
}

.state-on .switch-thumb,
.state-pending .switch-thumb {
  left: calc(100% - 2px);
  transform: translateX(-100%);
}

.thumb-icon {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

/* Hide icon on very small sizes */
@container (height < 40px) {
  .thumb-icon { display: none; }
}

.state-on .thumb-icon {
  color: var(--color-success);
}

/* Spinner */
.spinner {
  width: 60%;
  height: 60%;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: #333;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Labels - Hide on small height */
.switch-labels {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  pointer-events: none;
}

@container (height < 50px) {
  .switch-labels { display: none; }
}

.label-off,
.label-on {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.6);
  transition: opacity 0.3s;
}

.state-on .label-off,
.state-off .label-on {
  opacity: 0.3;
}

/* State Text - Hide on small height */
.state-text {
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  transition: color 0.3s;
}

@container (height < 80px) {
  .state-text { display: none; }
}

.state-text.state-on { color: var(--color-success); }
.state-text.state-off { color: var(--muted); }
.state-text.state-pending { color: var(--color-warning); }
.state-text.state-unknown { color: var(--muted); }

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
  transition: opacity 0.2s;
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
