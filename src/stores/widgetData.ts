import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Buffered Message Entry
 * Grug say: One message after JSONPath extraction
 */
export interface BufferedMessage {
  timestamp: number  // When message received
  value: any        // Extracted value (via JSONPath)
  raw?: any         // Original message (optional, for debugging)
}

/**
 * Widget Data Buffer
 * Grug say: Holds messages for one widget
 */
interface WidgetDataBuffer {
  widgetId: string
  messages: BufferedMessage[]
  maxCount: number
  maxAge?: number  // Future: time-based pruning
}

/**
 * Widget Data Store
 * 
 * Grug say: This store hold actual data flowing through system.
 * Config store hold blueprints. This store hold real data.
 * 
 * Think of it like this:
 * - Config store = Recipe
 * - This store = Actual food in kitchen
 * 
 * When widget destroyed, we clean up its buffer to prevent memory leak.
 */
export const useWidgetDataStore = defineStore('widgetData', () => {
  // ============================================================================
  // STATE
  // ============================================================================
  
  // Map of widgetId -> buffer
  // Grug say: Use Map for fast lookup
  const buffers = ref<Map<string, WidgetDataBuffer>>(new Map())
  
  // ============================================================================
  // BUFFER MANAGEMENT
  // ============================================================================
  
  /**
   * Initialize buffer for widget
   * Grug say: Call this when widget created
   */
  function initializeBuffer(widgetId: string, maxCount: number = 100, maxAge?: number) {
    if (!buffers.value.has(widgetId)) {
      buffers.value.set(widgetId, {
        widgetId,
        messages: [],
        maxCount,
        maxAge,
      })
    }
  }
  
  /**
   * Add message to widget buffer
   * Grug say: This is hot path - called frequently
   */
  function addMessage(widgetId: string, value: any, raw?: any) {
    let buffer = buffers.value.get(widgetId)
    
    // Auto-initialize if buffer doesn't exist
    if (!buffer) {
      initializeBuffer(widgetId)
      buffer = buffers.value.get(widgetId)!
    }
    
    // Create message entry
    const message: BufferedMessage = {
      timestamp: Date.now(),
      value,
      raw,
    }
    
    // Add to buffer
    buffer.messages.push(message)
    
    // Prune old messages (count-based)
    if (buffer.messages.length > buffer.maxCount) {
      // Remove oldest messages
      buffer.messages = buffer.messages.slice(-buffer.maxCount)
    }
    
    // TODO: Time-based pruning (future enhancement)
    // if (buffer.maxAge) {
    //   const cutoff = Date.now() - buffer.maxAge
    //   buffer.messages = buffer.messages.filter(m => m.timestamp >= cutoff)
    // }
  }
  
  /**
   * Get entire buffer for widget
   * Grug say: For charts that need all data points
   */
  function getBuffer(widgetId: string): BufferedMessage[] {
    const buffer = buffers.value.get(widgetId)
    return buffer ? [...buffer.messages] : []
  }
  
  /**
   * Get latest message value for widget
   * Grug say: For text widgets that show current value
   */
  function getLatest(widgetId: string): any {
    const buffer = buffers.value.get(widgetId)
    if (!buffer || buffer.messages.length === 0) return null
    
    return buffer.messages[buffer.messages.length - 1].value
  }
  
  /**
   * Get buffer size (message count)
   */
  function getBufferSize(widgetId: string): number {
    const buffer = buffers.value.get(widgetId)
    return buffer ? buffer.messages.length : 0
  }
  
  /**
   * Clear buffer for widget
   * Grug say: User can click button to clear history
   */
  function clearBuffer(widgetId: string) {
    const buffer = buffers.value.get(widgetId)
    if (buffer) {
      buffer.messages = []
    }
  }
  
  /**
   * Remove buffer entirely
   * Grug say: Call this when widget deleted to prevent memory leak
   */
  function removeBuffer(widgetId: string) {
    buffers.value.delete(widgetId)
  }
  
  /**
   * Clear all buffers
   * Grug say: When disconnect from NATS, clear everything
   */
  function clearAllBuffers() {
    buffers.value.clear()
  }
  
  /**
   * Update buffer configuration
   * Grug say: When user change widget settings
   */
  function updateBufferConfig(widgetId: string, maxCount?: number, maxAge?: number) {
    const buffer = buffers.value.get(widgetId)
    if (!buffer) return
    
    if (maxCount !== undefined) {
      buffer.maxCount = maxCount
      // Prune if new limit is smaller
      if (buffer.messages.length > maxCount) {
        buffer.messages = buffer.messages.slice(-maxCount)
      }
    }
    
    if (maxAge !== undefined) {
      buffer.maxAge = maxAge
    }
  }
  
  // ============================================================================
  // COMPUTED HELPERS
  // ============================================================================
  
  /**
   * Get computed ref for latest value
   * Grug say: Reactive - updates automatically when new message arrives
   */
  function useLatestValue(widgetId: string) {
    return computed(() => getLatest(widgetId))
  }
  
  /**
   * Get computed ref for buffer
   * Grug say: Reactive - updates automatically when messages added
   */
  function useBuffer(widgetId: string) {
    return computed(() => getBuffer(widgetId))
  }
  
  // ============================================================================
  // DEBUGGING / STATS
  // ============================================================================
  
  /**
   * Get total number of active buffers
   */
  const activeBufferCount = computed(() => buffers.value.size)
  
  /**
   * Get total messages across all buffers
   */
  const totalMessageCount = computed(() => {
    let total = 0
    for (const buffer of buffers.value.values()) {
      total += buffer.messages.length
    }
    return total
  })
  
  /**
   * Get memory usage estimate (rough)
   */
  const memoryEstimate = computed(() => {
    // Rough estimate: ~100 bytes per message
    return totalMessageCount.value * 100
  })
  
  // ============================================================================
  // RETURN PUBLIC API
  // ============================================================================
  
  return {
    // State
    buffers,
    
    // Buffer Management
    initializeBuffer,
    addMessage,
    getBuffer,
    getLatest,
    getBufferSize,
    clearBuffer,
    removeBuffer,
    clearAllBuffers,
    updateBufferConfig,
    
    // Computed Helpers
    useLatestValue,
    useBuffer,
    
    // Stats
    activeBufferCount,
    totalMessageCount,
    memoryEstimate,
  }
})
