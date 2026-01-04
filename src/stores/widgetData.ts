// src/stores/widgetData.ts
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
 * Memory Limits
 * Grug say: Prevent app from eating all memory
 */
const MEMORY_LIMITS = {
  MAX_TOTAL_MESSAGES: 10000,      // Total messages across all buffers
  MAX_BUFFER_SIZE_MB: 50,         // Estimated max memory usage
  MAX_SINGLE_BUFFER: 1000,        // Max messages per widget buffer
  BYTES_PER_MESSAGE_ESTIMATE: 100 // Rough estimate for memory calculation
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
 * 
 * NEW: Now with memory safeguards to prevent runaway memory usage!
 */
export const useWidgetDataStore = defineStore('widgetData', () => {
  // ============================================================================
  // STATE
  // ============================================================================
  
  // Map of widgetId -> buffer
  // Grug say: Use Map for fast lookup
  const buffers = ref<Map<string, WidgetDataBuffer>>(new Map())
  
  // Memory pressure warnings
  const memoryWarning = ref<string | null>(null)
  
  // ============================================================================
  // BUFFER MANAGEMENT
  // ============================================================================
  
  /**
   * Initialize buffer for widget
   * Grug say: Call this when widget created
   */
  function initializeBuffer(widgetId: string, maxCount: number = 100, maxAge?: number) {
    // Enforce per-buffer limits
    const safeMaxCount = Math.min(maxCount, MEMORY_LIMITS.MAX_SINGLE_BUFFER)
    
    if (maxCount > MEMORY_LIMITS.MAX_SINGLE_BUFFER) {
      console.warn(
        `[WidgetData] Buffer size ${maxCount} exceeds limit ${MEMORY_LIMITS.MAX_SINGLE_BUFFER}, ` +
        `capping at ${safeMaxCount}`
      )
    }
    
    if (!buffers.value.has(widgetId)) {
      buffers.value.set(widgetId, {
        widgetId,
        messages: [],
        maxCount: safeMaxCount,
        maxAge,
      })
    }
  }
  
  /**
   * Check if we're approaching memory limits
   * Grug say: Better to warn early than crash later
   */
  function checkMemoryPressure(): boolean {
    const totalMessages = totalMessageCount.value
    const estimatedMB = memoryEstimate.value / 1024 / 1024
    
    // Check total message count
    if (totalMessages >= MEMORY_LIMITS.MAX_TOTAL_MESSAGES * 0.9) {
      memoryWarning.value = 
        `High memory usage: ${totalMessages} messages (limit: ${MEMORY_LIMITS.MAX_TOTAL_MESSAGES})`
      return true
    }
    
    // Check estimated memory
    if (estimatedMB >= MEMORY_LIMITS.MAX_BUFFER_SIZE_MB * 0.9) {
      memoryWarning.value = 
        `High memory usage: ~${estimatedMB.toFixed(1)}MB (limit: ${MEMORY_LIMITS.MAX_BUFFER_SIZE_MB}MB)`
      return true
    }
    
    // Clear warning if we're back to safe levels
    if (totalMessages < MEMORY_LIMITS.MAX_TOTAL_MESSAGES * 0.7) {
      memoryWarning.value = null
    }
    
    return false
  }
  
  /**
   * Prune oldest buffers if we're over memory limits
   * Grug say: If memory full, throw away old food
   */
  function pruneIfNeeded() {
    const totalMessages = totalMessageCount.value
    
    if (totalMessages <= MEMORY_LIMITS.MAX_TOTAL_MESSAGES) {
      return // We're fine
    }
    
    console.warn(
      `[WidgetData] Memory limit exceeded (${totalMessages} messages), ` +
      `pruning oldest buffers`
    )
    
    // Sort buffers by last message timestamp (oldest first)
    const sortedBuffers = Array.from(buffers.value.values())
      .filter(b => b.messages.length > 0)
      .sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1]?.timestamp || 0
        const bLast = b.messages[b.messages.length - 1]?.timestamp || 0
        return aLast - bLast
      })
    
    // Prune 25% of oldest messages
    const targetCount = Math.floor(MEMORY_LIMITS.MAX_TOTAL_MESSAGES * 0.75)
    let currentTotal = totalMessages
    
    for (const buffer of sortedBuffers) {
      if (currentTotal <= targetCount) break
      
      const toRemove = Math.min(
        Math.floor(buffer.messages.length * 0.5), // Remove 50% from this buffer
        currentTotal - targetCount
      )
      
      if (toRemove > 0) {
        buffer.messages.splice(0, toRemove)
        currentTotal -= toRemove
        console.log(`[WidgetData] Pruned ${toRemove} messages from widget ${buffer.widgetId}`)
      }
    }
  }
  
  /**
   * Add message to widget buffer
   * Grug say: This is hot path - called frequently
   * 
   * NEW: Now checks memory limits before adding
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
    
    // Check memory pressure and prune globally if needed
    if (checkMemoryPressure()) {
      pruneIfNeeded()
    }
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
      memoryWarning.value = null // Clear warning after cleanup
    }
  }
  
  /**
   * Remove buffer entirely
   * Grug say: Call this when widget deleted to prevent memory leak
   */
  function removeBuffer(widgetId: string) {
    buffers.value.delete(widgetId)
    
    // Clear warning if we're back to safe levels
    if (totalMessageCount.value < MEMORY_LIMITS.MAX_TOTAL_MESSAGES * 0.7) {
      memoryWarning.value = null
    }
  }
  
  /**
   * Clear all buffers
   * Grug say: When disconnect from NATS, clear everything
   */
  function clearAllBuffers() {
    buffers.value.clear()
    memoryWarning.value = null
  }
  
  /**
   * Update buffer configuration
   * Grug say: When user change widget settings
   */
  function updateBufferConfig(widgetId: string, maxCount?: number, maxAge?: number) {
    const buffer = buffers.value.get(widgetId)
    if (!buffer) return
    
    if (maxCount !== undefined) {
      // Enforce limits
      const safeMaxCount = Math.min(maxCount, MEMORY_LIMITS.MAX_SINGLE_BUFFER)
      buffer.maxCount = safeMaxCount
      
      // Prune if new limit is smaller
      if (buffer.messages.length > safeMaxCount) {
        buffer.messages = buffer.messages.slice(-safeMaxCount)
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
    return totalMessageCount.value * MEMORY_LIMITS.BYTES_PER_MESSAGE_ESTIMATE
  })
  
  /**
   * Check if we're in memory warning state
   */
  const hasMemoryWarning = computed(() => memoryWarning.value !== null)
  
  /**
   * Get memory usage percentage
   */
  const memoryUsagePercent = computed(() => {
    const percent = (totalMessageCount.value / MEMORY_LIMITS.MAX_TOTAL_MESSAGES) * 100
    return Math.min(percent, 100)
  })
  
  // ============================================================================
  // RETURN PUBLIC API
  // ============================================================================
  
  return {
    // State
    buffers,
    memoryWarning,
    
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
    hasMemoryWarning,
    memoryUsagePercent,
    
    // Limits (for UI display)
    MEMORY_LIMITS,
  }
})
