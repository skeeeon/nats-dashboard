import { useNatsStore } from '@/stores/nats'
import { useWidgetDataStore } from '@/stores/widgetData'
import { JSONPath } from 'jsonpath-plus'
import type { Subscription } from '@nats-io/nats-core'

/**
 * Widget Listener
 * Grug say: One widget interested in a subject
 */
interface WidgetListener {
  widgetId: string
  jsonPath?: string  // How to extract data for this widget
}

/**
 * Subscription Reference
 * Grug say: One NATS subscription shared by multiple widgets
 */
interface SubscriptionRef {
  subject: string
  natsSubscription: Subscription
  listeners: Map<string, WidgetListener>  // widgetId -> listener
  isActive: boolean
}

/**
 * Subscription Manager
 * 
 * Grug say: This is the smart part. Instead of N widgets = N subscriptions,
 * we make 1 subject = 1 subscription, shared by all widgets.
 * 
 * Like mail delivery: One mailman visit street, give each house their mail.
 * Not send one mailman per house. That would be silly.
 * 
 * How it works:
 * 1. Widget say "I want messages from subject X"
 * 2. We check: Do we already subscribe to X?
 * 3. If yes: Add widget to listener list
 * 4. If no: Create new NATS subscription, add widget to listener list
 * 5. When message arrives: Extract data for each widget, send to buffer
 * 6. When widget destroyed: Remove from listener list
 * 7. If listener list empty: Unsubscribe from NATS
 * 
 * UPDATED: Less noisy console logging
 */
export function useSubscriptionManager() {
  const natsStore = useNatsStore()
  const dataStore = useWidgetDataStore()
  
  // Map of subject -> subscription reference
  // Grug say: This is where we track which subjects we're subscribed to
  const subscriptions = new Map<string, SubscriptionRef>()
  
  // Text encoder/decoder for NATS messages
  const decoder = new TextDecoder()
  
  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================
  
  /**
   * Subscribe widget to subject
   * Grug say: Widget calls this to start receiving messages
   */
  function subscribe(widgetId: string, subject: string, jsonPath?: string) {
    if (!natsStore.nc) {
      console.error('Cannot subscribe: Not connected to NATS')
      return
    }
    
    if (import.meta.env.DEV) {
      console.log(`[SubMgr] Widget ${widgetId} subscribing to ${subject}`)
    }
    
    // Check if subscription already exists
    let subRef = subscriptions.get(subject)
    
    if (subRef) {
      // Subscription exists - just add this widget to listeners
      if (import.meta.env.DEV) {
        console.log(`[SubMgr] Reusing existing subscription to ${subject}`)
      }
      subRef.listeners.set(widgetId, { widgetId, jsonPath })
      return
    }
    
    // Subscription doesn't exist - create new one
    if (import.meta.env.DEV) {
      console.log(`[SubMgr] Creating new subscription to ${subject}`)
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
      
      // Start processing messages
      processMessages(subRef)
      
    } catch (err) {
      console.error(`[SubMgr] Failed to subscribe to ${subject}:`, err)
    }
  }
  
  /**
   * Unsubscribe widget from subject
   * Grug say: Widget calls this when destroyed or changed
   * 
   * UPDATED: Less noisy - don't warn if subscription doesn't exist
   */
  function unsubscribe(widgetId: string, subject: string) {
    const subRef = subscriptions.get(subject)
    if (!subRef) {
      // Silently return - this happens during initial page load
      // when we unsubscribe before any subscriptions exist
      return
    }
    
    // Remove widget from listeners
    subRef.listeners.delete(widgetId)
    
    // If no more listeners, clean up NATS subscription
    if (subRef.listeners.size === 0) {
      if (import.meta.env.DEV) {
        console.log(`[SubMgr] No more listeners for ${subject}, cleaning up subscription`)
      }
      cleanup(subRef)
      subscriptions.delete(subject)
    }
  }
  
  /**
   * Process incoming messages for a subscription
   * Grug say: This is the hot path - runs for every message
   */
  async function processMessages(subRef: SubscriptionRef) {
    try {
      for await (const msg of subRef.natsSubscription) {
        if (!subRef.isActive) break
        
        // Decode message data
        let data: any
        try {
          const text = decoder.decode(msg.data)
          // Try to parse as JSON
          try {
            data = JSON.parse(text)
          } catch {
            // Not JSON - use raw text
            data = text
          }
        } catch (err) {
          console.error(`[SubMgr] Failed to decode message from ${msg.subject}:`, err)
          continue
        }
        
        // Send to each listening widget
        for (const listener of subRef.listeners.values()) {
          try {
            // Extract value using JSONPath if specified
            let value = data
            if (listener.jsonPath) {
              value = extractJsonPath(data, listener.jsonPath)
            }
            
            // Add to widget's buffer
            dataStore.addMessage(listener.widgetId, value, data)
          } catch (err) {
            console.error(`[SubMgr] Failed to process message for widget ${listener.widgetId}:`, err)
          }
        }
      }
    } catch (err) {
      console.error(`[SubMgr] Message processing error for ${subRef.subject}:`, err)
    }
  }
  
  /**
   * Clean up NATS subscription
   * Grug say: Stop subscription and mark inactive
   */
  function cleanup(subRef: SubscriptionRef) {
    subRef.isActive = false
    try {
      subRef.natsSubscription.unsubscribe()
    } catch (err) {
      console.error(`[SubMgr] Error unsubscribing from ${subRef.subject}:`, err)
    }
  }
  
  /**
   * Cleanup all subscriptions
   * Grug say: Call this when disconnecting from NATS
   */
  function cleanupAll() {
    if (import.meta.env.DEV) {
      console.log(`[SubMgr] Cleaning up ${subscriptions.size} subscriptions`)
    }
    
    for (const subRef of subscriptions.values()) {
      cleanup(subRef)
    }
    
    subscriptions.clear()
  }
  
  // ============================================================================
  // JSON PATH EXTRACTION
  // ============================================================================
  
  /**
   * Extract value from object using JSONPath
   * Grug say: JSONPath is like map to find treasure in nested object
   * 
   * Examples:
   * - "$.temperature" extracts { temperature: 25 } -> 25
   * - "$.sensors[0].value" extracts first sensor value
   * - "$" returns whole object
   */
  function extractJsonPath(data: any, path: string): any {
    // If no path or path is "$", return whole object
    if (!path || path === '$') {
      return data
    }
    
    try {
      const result = JSONPath({ path, json: data, wrap: false })
      return result
    } catch (err) {
      console.error(`[SubMgr] JSONPath extraction failed for path "${path}":`, err)
      // Return null on error so widget doesn't crash
      return null
    }
  }
  
  // ============================================================================
  // DEBUGGING / STATS
  // ============================================================================
  
  /**
   * Get subscription stats
   * Grug say: For debugging and monitoring
   */
  function getStats() {
    const stats = {
      subscriptionCount: subscriptions.size,
      subscriptions: [] as any[],
    }
    
    for (const [subject, subRef] of subscriptions.entries()) {
      stats.subscriptions.push({
        subject,
        listenerCount: subRef.listeners.size,
        listeners: Array.from(subRef.listeners.keys()),
        isActive: subRef.isActive,
      })
    }
    
    return stats
  }
  
  /**
   * Check if subscribed to subject
   */
  function isSubscribed(subject: string): boolean {
    return subscriptions.has(subject)
  }
  
  /**
   * Get listener count for subject
   */
  function getListenerCount(subject: string): number {
    const subRef = subscriptions.get(subject)
    return subRef ? subRef.listeners.size : 0
  }
  
  // ============================================================================
  // RETURN PUBLIC API
  // ============================================================================
  
  return {
    // Core operations
    subscribe,
    unsubscribe,
    cleanupAll,
    
    // Utility
    extractJsonPath,
    
    // Stats
    getStats,
    isSubscribed,
    getListenerCount,
  }
}

// Singleton instance for app-wide use
// Grug say: One manager for whole app, not one per component
let managerInstance: ReturnType<typeof useSubscriptionManager> | null = null

/**
 * Get singleton subscription manager instance
 * Grug say: Everyone use same manager
 */
export function getSubscriptionManager(): ReturnType<typeof useSubscriptionManager> {
  if (!managerInstance) {
    managerInstance = useSubscriptionManager()
  }
  return managerInstance
}
