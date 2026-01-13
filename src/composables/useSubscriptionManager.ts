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
  key: string
  subject: string
  natsSubscription?: Subscription 
  iterator?: ConsumerMessages
  listeners: Map<string, WidgetListener>
  isActive: boolean
  isJetStream: boolean
  initPromise?: Promise<void>
}

interface QueuedMessage {
  widgetId: string
  value: any
  raw: any
  subject?: string // Added subject
  timestamp: number
}

const MAX_QUEUE_SIZE = 5000 

export function useSubscriptionManager() {
  const natsStore = useNatsStore()
  const dataStore = useWidgetDataStore()
  
  const subscriptions = new Map<string, SubscriptionRef>()
  
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
  
  function queueMessage(widgetId: string, value: any, raw: any, subject?: string) {
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
      subject, // Pass subject
      timestamp: Date.now()
    })
    if (!flushPending) {
      flushPending = true
      requestAnimationFrame(flushQueue)
    }
  }

  // ... existing calculateStartTime ...
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

  // ... existing getSubscriptionKey ...
  function getSubscriptionKey(widgetId: string, config: DataSourceConfig): string {
    if (config.useJetStream) {
      return `js:${widgetId}`
    }
    return `core:${config.subject}`
  }

  // ... existing subscribe ...
  async function subscribe(widgetId: string, config: DataSourceConfig, jsonPath?: string) {
    if (!natsStore.nc) {
      console.error('Cannot subscribe: Not connected to NATS')
      return
    }

    const subject = config.subject
    if (!subject) return
    
    const key = getSubscriptionKey(widgetId, config)
    let subRef = subscriptions.get(key)
    
    if (subRef) {
      if (subRef.initPromise) {
        try {
          await subRef.initPromise
        } catch (e) {
          subscriptions.delete(key)
          subRef = undefined
        }
      }
      
      subRef = subscriptions.get(key)
      if (subRef) {
        const isCoreDead = !subRef.isJetStream && subRef.natsSubscription?.isClosed()
        
        if (isCoreDead) {
          subscriptions.delete(key)
        } else {
          subRef.listeners.set(widgetId, { widgetId, jsonPath })
          return
        }
      }
    }
    
    const newSubRef: SubscriptionRef = {
      key,
      subject,
      listeners: new Map([[widgetId, { widgetId, jsonPath }]]),
      isActive: true,
      isJetStream: !!config.useJetStream
    }
    
    const initWork = async () => {
      try {
        if (config.useJetStream) {
          const jsm = await jetstreamManager(natsStore.nc!)
          
          let streamName: string
          try {
            streamName = await jsm.streams.find(subject)
          } catch (e) {
            console.error(`[SubMgr] No stream found for subject: ${subject}`)
            subscriptions.delete(key)
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
          
          newSubRef.iterator = messages
          processJetStreamMessages(newSubRef)

        } else {
          const natsSub = natsStore.nc!.subscribe(subject)
          
          newSubRef.natsSubscription = natsSub
          processCoreMessages(newSubRef)
        }
      } catch (err) {
        console.error(`[SubMgr] Failed to subscribe to ${subject}:`, err)
        subscriptions.delete(key)
        throw err
      } finally {
        newSubRef.initPromise = undefined
      }
    }

    newSubRef.initPromise = initWork()
    subscriptions.set(key, newSubRef)
    
    await newSubRef.initPromise
  }
  
  // ... existing unsubscribe ...
  function unsubscribe(widgetId: string, config: DataSourceConfig) {
    if (!config.subject) return

    const key = getSubscriptionKey(widgetId, config)
    const subRef = subscriptions.get(key)
    if (!subRef) return
    
    subRef.listeners.delete(widgetId)
    
    if (subRef.listeners.size === 0) {
      cleanup(subRef)
      subscriptions.delete(key)
    }
  }
  
  async function processCoreMessages(subRef: SubscriptionRef) {
    if (!subRef.natsSubscription) return
    try {
      for await (const msg of subRef.natsSubscription) {
        if (!subRef.isActive) break
        dispatchMessage(subRef, msg.data, msg.subject) // Pass subject
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
        dispatchMessage(subRef, msg.data, msg.subject) // Pass subject
      }
    } catch (err) {
      // Iterator ended
    }
  }

  function dispatchMessage(subRef: SubscriptionRef, rawData: Uint8Array, subject: string) {
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
        queueMessage(listener.widgetId, value, data, subject) // Pass subject
      } catch (err) {
        // ignore
      }
    }
  }
  
  // ... existing cleanup/utils ...
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
    
    for (const [key, subRef] of subscriptions.entries()) {
      stats.subscriptions.push({
        subject: subRef.subject,
        key: key,
        listenerCount: subRef.listeners.size,
        isActive: subRef.isActive,
        type: subRef.isJetStream ? 'JetStream' : 'Core'
      })
    }
    return stats
  }
  
  function isSubscribed(widgetId: string, config: DataSourceConfig): boolean {
    const key = getSubscriptionKey(widgetId, config)
    return subscriptions.has(key)
  }
  
  return {
    subscribe,
    unsubscribe,
    cleanupAll,
    extractJsonPath,
    getStats,
    isSubscribed,
  }
}

let managerInstance: ReturnType<typeof useSubscriptionManager> | null = null

export function getSubscriptionManager(): ReturnType<typeof useSubscriptionManager> {
  if (!managerInstance) {
    managerInstance = useSubscriptionManager()
  }
  return managerInstance
}
