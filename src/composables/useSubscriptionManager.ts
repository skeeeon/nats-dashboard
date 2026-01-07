// src/composables/useSubscriptionManager.ts
import { useNatsStore } from '@/stores/nats'
import { useWidgetDataStore } from '@/stores/widgetData'
import { JSONPath } from 'jsonpath-plus'
import type { Subscription } from '@nats-io/nats-core'
import { decodeBytes } from '@/utils/encoding'

interface WidgetListener {
  widgetId: string
  jsonPath?: string
}

interface SubscriptionRef {
  subject: string
  natsSubscription: Subscription
  listeners: Map<string, WidgetListener>
  isActive: boolean
}

// Queue Item Structure
interface QueuedMessage {
  widgetId: string
  value: any
  raw: any
  timestamp: number
}

// Quick Win A: Bound the queue to prevent browser crash on high throughput
const MAX_QUEUE_SIZE = 5000 

export function useSubscriptionManager() {
  const natsStore = useNatsStore()
  const dataStore = useWidgetDataStore()
  
  const subscriptions = new Map<string, SubscriptionRef>()
  
  // --- Throttling Logic ---
  
  // Simple array for buffering. Non-reactive.
  const messageQueue: QueuedMessage[] = []
  let flushPending = false
  
  // Grug say: Flush queue to store once per frame
  function flushQueue() {
    if (messageQueue.length === 0) {
      flushPending = false
      return
    }
    
    // Take everything currently in queue
    // Grug say: Copy array fast
    const batch = [...messageQueue]
    messageQueue.length = 0 // Clear queue
    
    // Send to store in one big chunk
    dataStore.batchAddMessages(batch)
    
    // Request next frame
    requestAnimationFrame(flushQueue)
  }
  
  function queueMessage(widgetId: string, value: any, raw: any) {
    // Quick Win A: Safety valve.
    // If NATS sends 100k messages/sec, queue gets too big. Browser die.
    // We check size. If too big, we drop oldest rocks to make room for new rocks.
    if (messageQueue.length >= MAX_QUEUE_SIZE) {
      // Drop oldest 1000 messages
      messageQueue.splice(0, 1000)
      if (Math.random() > 0.99) {
        console.warn(`[SubMgr] High load! Queue full (${MAX_QUEUE_SIZE}). Dropped 1000 oldest messages.`)
      }
    }

    messageQueue.push({
      widgetId,
      value,
      raw,
      timestamp: Date.now()
    })
    
    // Start loop if not running
    if (!flushPending) {
      flushPending = true
      requestAnimationFrame(flushQueue)
    }
  }

  // --- Subscription Logic ---

  function subscribe(widgetId: string, subject: string, jsonPath?: string) {
    if (!natsStore.nc) {
      console.error('Cannot subscribe: Not connected to NATS')
      return
    }
    
    let subRef = subscriptions.get(subject)
    
    if (subRef) {
      subRef.listeners.set(widgetId, { widgetId, jsonPath })
      return
    }
    
    try {
      const natsSub = natsStore.nc.subscribe(subject)
      
      subRef = {
        subject,
        natsSubscription: natsSub,
        listeners: new Map([[widgetId, { widgetId, jsonPath }]]),
        isActive: true,
      }
      
      subscriptions.set(subject, subRef)
      processMessages(subRef)
      
    } catch (err) {
      console.error(`[SubMgr] Failed to subscribe to ${subject}:`, err)
    }
  }
  
  function unsubscribe(widgetId: string, subject: string) {
    const subRef = subscriptions.get(subject)
    if (!subRef) return
    
    subRef.listeners.delete(widgetId)
    
    if (subRef.listeners.size === 0) {
      cleanup(subRef)
      subscriptions.delete(subject)
    }
  }
  
  async function processMessages(subRef: SubscriptionRef) {
    try {
      for await (const msg of subRef.natsSubscription) {
        if (!subRef.isActive) break
        
        let data: any
        try {
          const text = decodeBytes(msg.data)
          try { data = JSON.parse(text) } catch { data = text }
        } catch (err) {
          continue
        }
        
        // Dispatch to listeners
        for (const listener of subRef.listeners.values()) {
          try {
            let value = data
            if (listener.jsonPath) {
              value = extractJsonPath(data, listener.jsonPath)
            }
            
            // Queue instead of direct add
            queueMessage(listener.widgetId, value, data)
            
          } catch (err) {
            console.error(`[SubMgr] Processing error widget ${listener.widgetId}:`, err)
          }
        }
      }
    } catch (err) {
      console.error(`[SubMgr] Stream error ${subRef.subject}:`, err)
    }
  }
  
  function cleanup(subRef: SubscriptionRef) {
    subRef.isActive = false
    try { subRef.natsSubscription.unsubscribe() } catch {}
  }
  
  function cleanupAll() {
    for (const subRef of subscriptions.values()) {
      cleanup(subRef)
    }
    subscriptions.clear()
    messageQueue.length = 0 // Clear pending messages
  }
  
  function extractJsonPath(data: any, path: string): any {
    if (!path || path === '$') return data
    try {
      return JSONPath({ path, json: data, wrap: false })
    } catch {
      return null
    }
  }
  
  function getStats() {
    const stats = {
      subscriptionCount: subscriptions.size,
      queueSize: messageQueue.length,
      maxQueueSize: MAX_QUEUE_SIZE, // EXPORTED LIMIT
      subscriptions: [] as any[],
    }
    
    for (const [subject, subRef] of subscriptions.entries()) {
      stats.subscriptions.push({
        subject,
        listenerCount: subRef.listeners.size,
        isActive: subRef.isActive,
      })
    }
    return stats
  }
  
  function isSubscribed(subject: string): boolean {
    return subscriptions.has(subject)
  }
  
  function getListenerCount(subject: string): number {
    const subRef = subscriptions.get(subject)
    return subRef ? subRef.listeners.size : 0
  }
  
  return {
    subscribe,
    unsubscribe,
    cleanupAll,
    extractJsonPath,
    getStats,
    isSubscribed,
    getListenerCount,
  }
}

let managerInstance: ReturnType<typeof useSubscriptionManager> | null = null

export function getSubscriptionManager(): ReturnType<typeof useSubscriptionManager> {
  if (!managerInstance) {
    managerInstance = useSubscriptionManager()
  }
  return managerInstance
}
