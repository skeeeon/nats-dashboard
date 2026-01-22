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
  config: DataSourceConfig
  initPromise?: Promise<void>
  lastError?: string
}

interface QueuedMessage {
  widgetId: string
  value: any
  raw: any
  subject?: string
  timestamp: number
}

const MAX_QUEUE_SIZE = 5000 

export function useSubscriptionManager() {
  const natsStore = useNatsStore()
  const dataStore = useWidgetDataStore()
  
  const subscriptions = new Map<string, SubscriptionRef>()
  const messageQueue: QueuedMessage[] = []
  let flushPending = false
  let reconnectListenerAttached = false
  
  const stats = {
    messagesReceived: 0,
    messagesDropped: 0,
    lastDropTime: null as number | null,
    subscriptionErrors: 0
  }

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
    stats.messagesReceived++
    if (messageQueue.length >= MAX_QUEUE_SIZE) {
      const dropCount = 1000
      messageQueue.splice(0, dropCount)
      stats.messagesDropped += dropCount
      stats.lastDropTime = Date.now()
    }
    messageQueue.push({ widgetId, value, raw, subject, timestamp: Date.now() })
    if (!flushPending) {
      flushPending = true
      requestAnimationFrame(flushQueue)
    }
  }

  function calculateStartTime(windowStr: string | undefined): string {
    const now = Date.now()
    let ms = 5 * 60 * 1000 
    if (windowStr) {
      const match = windowStr.match(/^(\d+)([smhd])$/)
      if (match) {
        const val = parseInt(match[1])
        const unit = match[2]
        switch (unit) {
          case 's': ms = val * 1000; break
          case 'm': ms = val * 60 * 1000; break
          case 'h': ms = val * 60 * 60 * 1000; break
          case 'd': ms = val * 24 * 60 * 60 * 1000; break
        }
      }
    }
    return new Date(now - ms).toISOString()
  }

  function getSubscriptionKey(widgetId: string, config: DataSourceConfig): string {
    if (config.useJetStream) return `js:${widgetId}:${config.subject}`
    return `core:${config.subject}`
  }

  async function handleReconnect() {
    for (const [key, subRef] of subscriptions.entries()) {
      if (subRef.listeners.size === 0) {
        subscriptions.delete(key)
        continue
      }
      cleanupSubscription(subRef)
      try {
        await createSubscription(subRef)
      } catch (err) {
        subRef.lastError = String(err)
        stats.subscriptionErrors++
      }
    }
  }

  async function subscribe(widgetId: string, config: DataSourceConfig, jsonPath?: string) {
    if (!natsStore.nc) return
    const subject = config.subject
    if (!subject) return
    
    if (!reconnectListenerAttached) {
      window.addEventListener('nats:reconnected', handleReconnect)
      reconnectListenerAttached = true
    }

    const key = getSubscriptionKey(widgetId, config)
    let subRef = subscriptions.get(key)
    
    if (subRef) {
      subRef.listeners.set(widgetId, { widgetId, jsonPath })
      return
    }
    
    const newSubRef: SubscriptionRef = {
      key, subject,
      listeners: new Map([[widgetId, { widgetId, jsonPath }]]),
      isActive: true,
      isJetStream: !!config.useJetStream,
      config: { ...config },
    }
    
    subscriptions.set(key, newSubRef)
    newSubRef.initPromise = createSubscription(newSubRef)
    await newSubRef.initPromise
  }

  async function createSubscription(subRef: SubscriptionRef): Promise<void> {
    if (subRef.config.useJetStream) {
      const js = jetstream(natsStore.nc!)
      const jsm = await jetstreamManager(natsStore.nc!)
      const streamName = await jsm.streams.find(subRef.subject)
      
      const consumerOpts: any = { filter_subjects: [subRef.subject] }
      const policy = subRef.config.deliverPolicy || 'last'
      consumerOpts.deliver_policy = policy
      
      if (policy === 'by_start_time') {
        consumerOpts.opt_start_time = calculateStartTime(subRef.config.timeWindow)
      }

      const consumer = await js.consumers.get(streamName, consumerOpts)
      subRef.iterator = await consumer.consume()
      processMessages(subRef, true)
    } else {
      subRef.natsSubscription = natsStore.nc!.subscribe(subRef.subject)
      processMessages(subRef, false)
    }
  }

  async function processMessages(subRef: SubscriptionRef, isJS: boolean) {
    const source = isJS ? subRef.iterator : subRef.natsSubscription
    if (!source) return
    try {
      for await (const msg of (source as any)) {
        if (!subRef.isActive) break
        let data: any
        try {
          const text = decodeBytes(msg.data)
          try { data = JSON.parse(text) } catch { data = text }
        } catch { continue }
        
        for (const listener of subRef.listeners.values()) {
          let value = data
          if (listener.jsonPath) value = extractJsonPath(data, listener.jsonPath)
          queueMessage(listener.widgetId, value, data, msg.subject)
        }
      }
    } catch (err) {
      subRef.isActive = false
    }
  }

  function unsubscribe(widgetId: string, config: DataSourceConfig) {
    const key = getSubscriptionKey(widgetId, config)
    const subRef = subscriptions.get(key)
    if (!subRef) return
    subRef.listeners.delete(widgetId)
    if (subRef.listeners.size === 0) {
      cleanupSubscription(subRef)
      subscriptions.delete(key)
    }
  }

  function cleanupSubscription(subRef: SubscriptionRef) {
    subRef.isActive = false
    if (subRef.natsSubscription) subRef.natsSubscription.unsubscribe()
    if (subRef.iterator) subRef.iterator.stop()
  }

  function extractJsonPath(data: any, path: string): any {
    if (!path || path === '$') return data
    try { return JSONPath({ path, json: data, wrap: false }) } catch { return null }
  }

  function getStats() {
    const subscriptionList: any[] = []
    for (const [key, subRef] of subscriptions.entries()) {
      subscriptionList.push({
        key,
        subject: subRef.subject,
        listenerCount: subRef.listeners.size,
        isActive: subRef.isActive,
        type: subRef.isJetStream ? 'JetStream (Ordered)' : 'Core',
        error: subRef.lastError || null
      })
    }
    return {
      subscriptionCount: subscriptions.size,
      messagesReceived: stats.messagesReceived,
      messagesDropped: stats.messagesDropped,
      lastDropTime: stats.lastDropTime,
      subscriptionErrors: stats.subscriptionErrors,
      queueSize: messageQueue.length,
      maxQueueSize: MAX_QUEUE_SIZE,
      subscriptions: subscriptionList
    }
  }

  return { subscribe, unsubscribe, getStats, extractJsonPath }
}

let managerInstance: ReturnType<typeof useSubscriptionManager> | null = null
export function getSubscriptionManager() {
  if (!managerInstance) managerInstance = useSubscriptionManager()
  return managerInstance
}
