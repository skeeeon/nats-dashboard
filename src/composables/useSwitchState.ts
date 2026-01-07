// src/composables/useSwitchState.ts
import { ref, type Ref } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { Kvm } from '@nats-io/kv'
import { decodeBytes, encodeString } from '@/utils/encoding'

/**
 * Switch State Configuration
 * Grug say: Same config for SwitchWidget and Map switch actions
 */
export interface SwitchStateConfig {
  mode: 'kv' | 'core'
  kvBucket?: string
  kvKey?: string
  publishSubject?: string
  stateSubject?: string
  onPayload: any
  offPayload: any
  defaultState?: 'on' | 'off'
}

export type SwitchStateValue = 'on' | 'off' | 'pending' | 'unknown'

/**
 * Switch State Instance
 * Returned by createSwitchState factory
 */
export interface SwitchState {
  state: Ref<SwitchStateValue>
  error: Ref<string | null>
  isPending: Ref<boolean>
  start: () => Promise<void>
  stop: () => void
  toggle: (requestConfirm?: (onConfirm: () => void) => void) => Promise<void>
  isActive: () => boolean
}

/**
 * Create Switch State Instance
 * 
 * Grug say: Factory function. Create one per switch action.
 * Call start() to begin watching, stop() to cleanup.
 * Can be used outside Vue lifecycle.
 * 
 * @param config - Switch configuration
 * @returns SwitchState instance with reactive state and control methods
 */
export function createSwitchState(config: SwitchStateConfig): SwitchState {
  const natsStore = useNatsStore()
  
  // Reactive state
  const state = ref<SwitchStateValue>('unknown')
  const error = ref<string | null>(null)
  const isPending = ref(false)
  
  // Internal references for cleanup
  let kvWatcher: any = null
  let kvInstance: any = null
  let subscription: any = null
  let active = false
  
  /**
   * Start watching for state changes
   */
  async function start(): Promise<void> {
    if (active) return
    if (!natsStore.nc || !natsStore.isConnected) {
      error.value = 'Not connected to NATS'
      return
    }
    
    active = true
    error.value = null
    
    if (config.mode === 'kv') {
      await initializeKvMode()
    } else {
      await initializeCoreMode()
    }
  }
  
  /**
   * Stop watching and cleanup
   */
  function stop(): void {
    active = false
    
    if (kvWatcher) {
      try { kvWatcher.stop() } catch {}
      kvWatcher = null
    }
    kvInstance = null
    
    if (subscription) {
      try { subscription.unsubscribe() } catch {}
      subscription = null
    }
  }
  
  /**
   * Check if currently active
   */
  function isActive(): boolean {
    return active
  }
  
  /**
   * Initialize KV mode watcher
   */
  async function initializeKvMode(): Promise<void> {
    const bucket = config.kvBucket
    const key = config.kvKey
    
    if (!bucket || !key) {
      error.value = 'KV bucket and key required'
      return
    }
    
    try {
      const kvm = new Kvm(natsStore.nc!)
      const kv = await kvm.open(bucket)
      kvInstance = kv
      
      // Try to get current value
      try {
        const entry = await kv.get(key)
        if (entry) {
          const value = JSON.parse(decodeBytes(entry.value))
          updateStateFromValue(value)
        } else {
          state.value = config.defaultState || 'off'
        }
      } catch (e: any) {
        if (!e.message?.includes('key not found')) throw e
        state.value = config.defaultState || 'off'
      }
      
      // Start watching
      const iter = await kv.watch({ key })
      kvWatcher = iter
      
      ;(async () => {
        try {
          for await (const e of iter) {
            if (!active) break
            if (e.key === key) {
              if (e.operation === 'PUT') {
                const value = JSON.parse(decodeBytes(e.value!))
                updateStateFromValue(value)
                isPending.value = false
              } else if (e.operation === 'DEL' || e.operation === 'PURGE') {
                state.value = 'off'
                isPending.value = false
              }
            }
          }
        } catch (err: any) {
          if (active && !err.message?.includes('connection closed')) {
            console.error('[SwitchState] KV watch error:', err)
            error.value = 'KV watch failed'
          }
        }
      })()
      
    } catch (err: any) {
      console.error('[SwitchState] KV init error:', err)
      if (err.message?.includes('stream not found')) {
        error.value = `Bucket "${bucket}" not found`
      } else {
        error.value = err.message || 'Failed to initialize KV'
      }
    }
  }
  
  /**
   * Initialize Core mode subscription
   */
  async function initializeCoreMode(): Promise<void> {
    state.value = config.defaultState || 'off'
    const stateSubject = config.stateSubject || config.publishSubject
    
    if (!stateSubject) {
      error.value = 'No state subject configured'
      return
    }
    
    try {
      subscription = natsStore.nc!.subscribe(stateSubject)
      
      ;(async () => {
        try {
          for await (const msg of subscription) {
            if (!active) break
            const data = parseMessage(msg.data)
            updateStateFromValue(data)
            isPending.value = false
          }
        } catch (err: any) {
          if (active && !err.message?.includes('connection closed')) {
            console.error('[SwitchState] Subscription error:', err)
            error.value = 'Subscription failed'
          }
        }
      })()
      
    } catch (err: any) {
      console.error('[SwitchState] CORE init error:', err)
      error.value = err.message || 'Failed to subscribe'
    }
  }
  
  /**
   * Parse incoming message
   */
  function parseMessage(data: Uint8Array): any {
    try {
      const text = decodeBytes(data)
      try { return JSON.parse(text) } catch { return text }
    } catch { return null }
  }
  
  /**
   * Update state based on incoming value
   */
  function updateStateFromValue(value: any): void {
    if (matchesPayload(value, config.onPayload)) {
      state.value = 'on'
    } else if (matchesPayload(value, config.offPayload)) {
      state.value = 'off'
    } else {
      console.warn('[SwitchState] Value does not match on/off payloads:', value)
    }
  }
  
  /**
   * Check if value matches payload
   */
  function matchesPayload(value: any, payload: any): boolean {
    return JSON.stringify(value) === JSON.stringify(payload)
  }
  
  /**
   * Toggle the switch
   * 
   * @param requestConfirm - Optional confirmation callback
   */
  async function toggle(requestConfirm?: (onConfirm: () => void) => void): Promise<void> {
    if (!natsStore.isConnected) {
      error.value = 'Not connected'
      return
    }
    
    const targetState = state.value === 'on' ? 'off' : 'on'
    
    if (requestConfirm) {
      requestConfirm(() => executeToggle(targetState))
    } else {
      await executeToggle(targetState)
    }
  }
  
  /**
   * Execute the toggle action
   */
  async function executeToggle(targetState: 'on' | 'off'): Promise<void> {
    error.value = null
    isPending.value = true
    const previousState = state.value
    state.value = 'pending'
    
    const payload = targetState === 'on' ? config.onPayload : config.offPayload
    
    try {
      if (config.mode === 'kv') {
        if (!kvInstance) throw new Error('KV instance not initialized')
        const key = config.kvKey!
        const data = encodeString(JSON.stringify(payload))
        await kvInstance.put(key, data)
      } else {
        if (!natsStore.nc) throw new Error('Not connected to NATS')
        const subject = config.publishSubject
        if (!subject) throw new Error('No publish subject')
        const data = serializePayload(payload)
        natsStore.nc.publish(subject, data)
        
        // If no state subject, assume success immediately
        if (!config.stateSubject) {
          state.value = targetState
          isPending.value = false
        }
      }
      
      // Timeout for confirmation
      setTimeout(() => {
        if (isPending.value) {
          isPending.value = false
          error.value = 'No confirmation received'
        }
      }, 5000)
      
    } catch (err: any) {
      console.error('[SwitchState] Toggle error:', err)
      error.value = err.message || 'Failed to toggle switch'
      isPending.value = false
      state.value = previousState === 'pending' ? 'unknown' : previousState
    }
  }
  
  /**
   * Serialize payload to bytes
   */
  function serializePayload(payload: any): Uint8Array {
    if (typeof payload === 'string') return encodeString(payload)
    if (typeof payload === 'number' || typeof payload === 'boolean') {
      return encodeString(String(payload))
    }
    return encodeString(JSON.stringify(payload))
  }
  
  return {
    state,
    error,
    isPending,
    start,
    stop,
    toggle,
    isActive,
  }
}

/**
 * Composable wrapper for use in Vue components
 * Grug say: Use this in SwitchWidget. Handles lifecycle automatically.
 */
export function useSwitchState(config: Ref<SwitchStateConfig> | SwitchStateConfig) {
  // This is a simple wrapper that returns createSwitchState
  // For more complex lifecycle management, components can use createSwitchState directly
  const resolvedConfig = 'value' in config ? config.value : config
  return createSwitchState(resolvedConfig)
}
