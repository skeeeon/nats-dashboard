// src/composables/useSwitchState.ts
import { ref, type Ref, onMounted, onUnmounted, watch, isRef } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { Kvm } from '@nats-io/kv'
import { decodeBytes, encodeString } from '@/utils/encoding'

/**
 * Switch State Configuration
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
 * Create Switch State Instance (Factory)
 */
export function createSwitchState(config: SwitchStateConfig): SwitchState {
  const natsStore = useNatsStore()
  
  const state = ref<SwitchStateValue>('unknown')
  const error = ref<string | null>(null)
  const isPending = ref(false)
  
  let kvWatcher: any = null
  let kvInstance: any = null
  let subscription: any = null
  let active = false
  
  async function start(): Promise<void> {
    if (active) return
    if (!natsStore.nc || !natsStore.isConnected) {
      error.value = 'Not connected to NATS'
      return
    }
    
    active = true
    error.value = null
    isPending.value = true // Lock UI while initializing
    
    try {
      if (config.mode === 'kv') {
        await initializeKvMode()
      } else {
        await initializeCoreMode()
      }
    } catch (err: any) {
      error.value = err.message
      isPending.value = false
    }
  }
  
  function stop(): void {
    active = false
    if (kvWatcher) { try { kvWatcher.stop() } catch {} kvWatcher = null }
    kvInstance = null
    if (subscription) { try { subscription.unsubscribe() } catch {} subscription = null }
    isPending.value = false
  }
  
  function isActive(): boolean {
    return active
  }
  
  async function initializeKvMode(): Promise<void> {
    const bucket = config.kvBucket
    const key = config.kvKey
    
    if (!bucket || !key) {
      throw new Error('KV bucket and key required')
    }
    
    try {
      const kvm = new Kvm(natsStore.nc!)
      const kv = await kvm.open(bucket)
      kvInstance = kv
      
      // Get initial value
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
      
      // Initialization done, unlock UI
      isPending.value = false
      
      // Start watching for updates
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
          // Ignore connection closed errors
        }
      })()
      
    } catch (err: any) {
      if (err.message?.includes('stream not found')) {
        throw new Error(`Bucket "${bucket}" not found`)
      }
      throw err
    }
  }
  
  async function initializeCoreMode(): Promise<void> {
    state.value = config.defaultState || 'off'
    const stateSubject = config.stateSubject || config.publishSubject
    
    if (!stateSubject) throw new Error('No state subject configured')
    
    // Core mode doesn't fetch initial state, so we unlock immediately
    isPending.value = false
    
    try {
      subscription = natsStore.nc!.subscribe(stateSubject)
      ;(async () => {
        for await (const msg of subscription) {
          if (!active) break
          const data = parseMessage(msg.data)
          updateStateFromValue(data)
          isPending.value = false
        }
      })()
    } catch (err: any) {
      throw err
    }
  }
  
  function parseMessage(data: Uint8Array): any {
    try {
      const text = decodeBytes(data)
      try { return JSON.parse(text) } catch { return text }
    } catch { return null }
  }
  
  function updateStateFromValue(value: any): void {
    if (matchesPayload(value, config.onPayload)) {
      state.value = 'on'
    } else if (matchesPayload(value, config.offPayload)) {
      state.value = 'off'
    }
  }
  
  function matchesPayload(value: any, payload: any): boolean {
    return JSON.stringify(value) === JSON.stringify(payload)
  }
  
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
        
        if (!config.stateSubject) {
          state.value = targetState
          isPending.value = false
        }
      }
      
      // Confirmation timeout watchdog
      setTimeout(() => {
        if (isPending.value && state.value === 'pending') {
          isPending.value = false
          // Don't revert state visually, just stop spinner. 
          // If we revert, we might flicker if the ACK comes 1ms later.
        }
      }, 5000)
      
    } catch (err: any) {
      console.error('[SwitchState] Toggle error:', err)
      error.value = err.message || 'Failed to toggle switch'
      isPending.value = false
      state.value = previousState === 'pending' ? 'unknown' : previousState
    }
  }
  
  function serializePayload(payload: any): Uint8Array {
    if (typeof payload === 'string') return encodeString(payload)
    if (typeof payload === 'number' || typeof payload === 'boolean') {
      return encodeString(String(payload))
    }
    return encodeString(JSON.stringify(payload))
  }
  
  return { state, error, isPending, start, stop, toggle, isActive }
}

/**
 * Composable wrapper that HANDLES LIFECYCLE
 */
export function useSwitchState(configSource: Ref<SwitchStateConfig> | SwitchStateConfig) {
  const natsStore = useNatsStore()
  
  // Create stable refs to return to the component
  const state = ref<SwitchStateValue>('unknown')
  const error = ref<string | null>(null)
  const isPending = ref(true) // Default to true so button is disabled until init
  
  let instance: SwitchState | null = null
  let stateWatcherStop: (() => void) | null = null

  // Function to tear down old instance and create new one
  function init() {
    // 1. Cleanup old
    if (instance) {
      instance.stop()
      if (stateWatcherStop) stateWatcherStop()
    }

    // 2. Create new
    const cfg = isRef(configSource) ? configSource.value : configSource
    instance = createSwitchState(cfg)

    // 3. Sync initial values
    state.value = instance.state.value
    error.value = instance.error.value
    isPending.value = instance.isPending.value

    // 4. Watch internal instance state and update our proxy refs
    stateWatcherStop = watch(
      [instance.state, instance.error, instance.isPending], 
      ([s, e, p]) => {
        state.value = s
        error.value = e
        isPending.value = p
      }
    )

    // 5. Start if connected
    if (natsStore.isConnected) {
      instance.start()
    }
  }

  // Lifecycle Hooks
  onMounted(() => {
    init()
  })

  onUnmounted(() => {
    if (instance) instance.stop()
    if (stateWatcherStop) stateWatcherStop()
  })

  // Watch for variable changes (config update)
  if (isRef(configSource)) {
    watch(configSource, () => init(), { deep: true })
  }

  // Watch for connection changes
  watch(() => natsStore.isConnected, (connected) => {
    if (connected && instance) instance.start()
    else if (!connected && instance) instance.stop()
  })

  // Proxy the toggle method
  const toggle = async (cb?: (c: () => void) => void) => {
    if (instance) await instance.toggle(cb)
  }

  return { state, error, isPending, toggle }
}
