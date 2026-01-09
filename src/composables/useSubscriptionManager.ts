// src/composables/useSubscriptionManager.ts
import { useNatsStore } from '@/stores/nats'
import { useWidgetDataStore } from '@/stores/widgetData'
import { JSONPath } from 'jsonpath-plus'
import type { Subscription } from '@nats-io/nats-core'
import { 
  jetstream, 
  jetstreamManager,
  type ConsumerMessages
} from '@nats-io/jetstream'
import { decodeBytes } from '@/utils/encoding'
import type { DataSourceConfig } from '@/types/dashboard'

interface WidgetListener {
  widgetId: string
  jsonPath?: string
}

interface SubscriptionRef {
  subject: string
  natsSubscription?: Subscription 
  iterator?: ConsumerMessages
  listeners: Map<string, WidgetListener>
  isActive: boolean
  isJetStream: boolean
  // Grug add: Promise to track initialization
  initPromise?: Promise<void>
}

interface QueuedMessage {
  widgetId: string
  value: any
  raw: any
  timestamp: number
}

const MAX_QUEUE_SIZE = 5000 

export function useSubscriptionManager() {
  const natsStore = useNatsStore()
  const dataStore = useWidgetDataStore()
  
  const subscriptions = new Map<string, SubscriptionRef>()
  
  // --- Throttling Logic ---
  const messageQueue: QueuedMessage[] = []
  let flushPending = false
  
  function flushQueue() {
    if (messageQueue.length === 0) {
      flushPending = false
      return
    }
    const batch = [...messageQueue]
    messageQueue.length = 0
    dataStore.batchAddMessages(batch)
    requestAnimationFrame(flushQueue)
  }
  
  function queueMessage(widgetId: string, value: any, raw: any) {
    if (messageQueue.length >= MAX_QUEUE_SIZE) {
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
    if (!flushPending) {
      flushPending = true
      requestAnimationFrame(flushQueue)
    }
  }

  function calculateStartTime(windowStr: string | undefined): Date {
    const now = Date.now()
    if (!windowStr) return new Date(now - 10 * 60 * 1000)
    
    const match = windowStr.match(/^(\d+)([smhd])$/)
    if (!match) return new Date(now - 10 * 60 * 1000)
    
    const val = parseInt(match[1])
    const unit = match[2]
    let ms = 0
    
    switch (unit) {
      case 's': ms = val * 1000; break
      case 'm': ms = val * 60 * 1000; break
      case 'h': ms = val * 60 * 60 * 1000; break
      case 'd': ms = val * 24 * 60 * 60 * 1000; break
    }
    
    return new Date(now - ms)
  }

  // --- Subscription Logic ---

  async function subscribe(widgetId: string, config: DataSourceConfig, jsonPath?: string) {
    if (!natsStore.nc) {
      console.error('Cannot subscribe: Not connected to NATS')
      return
    }

    const subject = config.subject
    if (!subject) return
    
    let subRef = subscriptions.get(subject)
    
    // 1. If subscription exists (or is initializing), join it
    if (subRef) {
      // If it's initializing, wait for it
      if (subRef.initPromise) {
        try {
          await subRef.initPromise
        } catch (e) {
          // Init failed, we will try again below as if it didn't exist
          subscriptions.delete(subject)
          subRef = undefined
        }
      }
      
      // Re-check after await
      subRef = subscriptions.get(subject)
      if (subRef) {
        const isCoreDead = !subRef.isJetStream && subRef.natsSubscription?.isClosed()
        
        if (isCoreDead) {
          subscriptions.delete(subject)
        } else {
          subRef.listeners.set(widgetId, { widgetId, jsonPath })
          return
        }
      }
    }
    
    // 2. Create placeholder immediately to block other calls
    const newSubRef: SubscriptionRef = {
      subject,
      listeners: new Map([[widgetId, { widgetId, jsonPath }]]),
      isActive: true,
      isJetStream: !!config.useJetStream
    }
    
    // Create the promise that defines the initialization work
    const initWork = async () => {
      try {
        if (config.useJetStream) {
          const jsm = await jetstreamManager(natsStore.nc!)
          
          let streamName: string
          try {
            streamName = await jsm.streams.find(subject)
          } catch (e) {
            console.error(`[SubMgr] No stream found for subject: ${subject}`)
            subscriptions.delete(subject) // Clean up placeholder
            return
          }

          const js = jetstream(natsStore.nc!)
          
          const consumerOpts: any = {
            filter_subjects: [subject],
            deliver_policy: config.deliverPolicy || 'last',
          }

          if (config.deliverPolicy === 'by_start_time') {
            consumerOpts.opt_start_time = calculateStartTime(config.timeWindow).toISOString()
          }

          const consumer = await js.consumers.get(streamName, consumerOpts)
          const messages = await consumer.consume()
          
          console.log(`[SubMgr] Consuming ${subject} from stream ${streamName} (${config.deliverPolicy})`)

          newSubRef.iterator = messages
          processJetStreamMessages(newSubRef)

        } else {
          const natsSub = natsStore.nc!.subscribe(subject)
          console.log(`[SubMgr] Subscribed to ${subject} (Core)`)
          
          newSubRef.natsSubscription = natsSub
          processCoreMessages(newSubRef)
        }
      } catch (err) {
        console.error(`[SubMgr] Failed to subscribe to ${subject}:`, err)
        subscriptions.delete(subject) // Clean up placeholder on error
        throw err
      } finally {
        // Clear the promise so future checks know it's done
        newSubRef.initPromise = undefined
      }
    }

    // Attach promise to ref and put in map
    newSubRef.initPromise = initWork()
    subscriptions.set(subject, newSubRef)
    
    // Await it (optional, but good for caller)
    await newSubRef.initPromise
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
  
  async function processCoreMessages(subRef: SubscriptionRef) {
    if (!subRef.natsSubscription) return
    try {
      for await (const msg of subRef.natsSubscription) {
        if (!subRef.isActive) break
        dispatchMessage(subRef, msg.data)
      }
    } catch (err) {
      // Connection closed
    }
  }

  async function processJetStreamMessages(subRef: SubscriptionRef) {
    if (!subRef.iterator) return
    try {
      for await (const msg of subRef.iterator) {
        if (!subRef.isActive) break
        msg.ack()
        dispatchMessage(subRef, msg.data)
      }
    } catch (err) {
      console.log(`[SubMgr] JetStream iterator ended for ${subRef.subject}`)
    }
  }

  function dispatchMessage(subRef: SubscriptionRef, rawData: Uint8Array) {
    let data: any
    try {
      const text = decodeBytes(rawData)
      try { data = JSON.parse(text) } catch { data = text }
    } catch (err) {
      return 
    }
    
    for (const listener of subRef.listeners.values()) {
      try {
        let value = data
        if (listener.jsonPath) {
          value = extractJsonPath(data, listener.jsonPath)
        }
        queueMessage(listener.widgetId, value, data)
      } catch (err) {
        // ignore
      }
    }
  }
  
  function cleanup(subRef: SubscriptionRef) {
    subRef.isActive = false
    if (subRef.natsSubscription) {
      try { subRef.natsSubscription.unsubscribe() } catch {}
    }
    if (subRef.iterator) {
      try { subRef.iterator.stop() } catch {}
    }
  }
  
  function cleanupAll() {
    for (const subRef of subscriptions.values()) {
      cleanup(subRef)
    }
    subscriptions.clear()
    messageQueue.length = 0
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
      maxQueueSize: MAX_QUEUE_SIZE,
      subscriptions: [] as any[],
    }
    
    for (const [subject, subRef] of subscriptions.entries()) {
      stats.subscriptions.push({
        subject,
        listenerCount: subRef.listeners.size,
        isActive: subRef.isActive,
        type: subRef.isJetStream ? 'JetStream' : 'Core'
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
