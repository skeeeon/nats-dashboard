// src/stores/widgetData.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Buffered Message Entry
 */
export interface BufferedMessage {
  timestamp: number
  value: any
  raw?: any
}

/**
 * Widget Data Buffer
 */
interface WidgetDataBuffer {
  widgetId: string
  messages: BufferedMessage[]
  maxCount: number
  maxAge?: number
}

/**
 * Memory Limits
 */
const MEMORY_LIMITS = {
  MAX_TOTAL_MESSAGES: 10000,
  MAX_BUFFER_SIZE_MB: 50,
  MAX_SINGLE_BUFFER: 1000,
  BYTES_PER_MESSAGE_ESTIMATE: 100
}

export const useWidgetDataStore = defineStore('widgetData', () => {
  // ============================================================================
  // STATE
  // ============================================================================
  
  const buffers = ref<Map<string, WidgetDataBuffer>>(new Map())
  const memoryWarning = ref<string | null>(null)
  
  // ============================================================================
  // BUFFER MANAGEMENT
  // ============================================================================
  
  function initializeBuffer(widgetId: string, maxCount: number = 100, maxAge?: number) {
    const safeMaxCount = Math.min(maxCount, MEMORY_LIMITS.MAX_SINGLE_BUFFER)
    
    if (!buffers.value.has(widgetId)) {
      buffers.value.set(widgetId, {
        widgetId,
        messages: [],
        maxCount: safeMaxCount,
        maxAge,
      })
    }
  }
  
  function checkMemoryPressure(): boolean {
    const totalMessages = totalMessageCount.value
    
    if (totalMessages >= MEMORY_LIMITS.MAX_TOTAL_MESSAGES * 0.9) {
      memoryWarning.value = `High memory usage: ${totalMessages} messages`
      return true
    }
    
    if (totalMessages < MEMORY_LIMITS.MAX_TOTAL_MESSAGES * 0.7) {
      memoryWarning.value = null
    }
    
    return false
  }
  
  function pruneIfNeeded() {
    const totalMessages = totalMessageCount.value
    if (totalMessages <= MEMORY_LIMITS.MAX_TOTAL_MESSAGES) return
    
    // Simple prune: remove 25% from every buffer if we are over limit
    for (const buffer of buffers.value.values()) {
      if (buffer.messages.length > 10) {
        const toRemove = Math.ceil(buffer.messages.length * 0.25)
        buffer.messages.splice(0, toRemove)
      }
    }
  }
  
  /**
   * Add single message (Legacy wrapper)
   */
  function addMessage(widgetId: string, value: any, raw?: any) {
    batchAddMessages([{ widgetId, value, raw, timestamp: Date.now() }])
  }

  /**
   * Batch Add Messages (High Performance)
   * This is the function that was missing
   */
  function batchAddMessages(items: Array<{ widgetId: string, value: any, raw?: any, timestamp: number }>) {
    // 1. Group by widget to avoid Map lookups
    const updates = new Map<string, BufferedMessage[]>()
    
    for (const item of items) {
      let list = updates.get(item.widgetId)
      if (!list) {
        list = []
        updates.set(item.widgetId, list)
      }
      list.push({
        timestamp: item.timestamp,
        value: item.value,
        raw: item.raw
      })
    }

    // 2. Apply updates
    for (const [widgetId, newMessages] of updates) {
      let buffer = buffers.value.get(widgetId)
      
      // Auto-initialize if missing
      if (!buffer) {
        initializeBuffer(widgetId)
        buffer = buffers.value.get(widgetId)!
      }

      // Push all new messages
      buffer.messages.push(...newMessages)

      // Prune individual buffer if too big
      if (buffer.messages.length > buffer.maxCount) {
        const overage = buffer.messages.length - buffer.maxCount
        buffer.messages.splice(0, overage)
      }
    }

    // 3. Check global limits once per batch
    if (checkMemoryPressure()) {
      pruneIfNeeded()
    }
  }
  
  // ============================================================================
  // GETTERS & UTILS
  // ============================================================================
  
  function getBuffer(widgetId: string): BufferedMessage[] {
    const buffer = buffers.value.get(widgetId)
    return buffer ? buffer.messages : []
  }
  
  function getLatest(widgetId: string): any {
    const buffer = buffers.value.get(widgetId)
    if (!buffer || buffer.messages.length === 0) return null
    return buffer.messages[buffer.messages.length - 1].value
  }
  
  function getBufferSize(widgetId: string): number {
    const buffer = buffers.value.get(widgetId)
    return buffer ? buffer.messages.length : 0
  }
  
  function clearBuffer(widgetId: string) {
    const buffer = buffers.value.get(widgetId)
    if (buffer) buffer.messages = []
  }
  
  function removeBuffer(widgetId: string) {
    buffers.value.delete(widgetId)
  }
  
  function clearAllBuffers() {
    buffers.value.clear()
    memoryWarning.value = null
  }
  
  function updateBufferConfig(widgetId: string, maxCount?: number, maxAge?: number) {
    const buffer = buffers.value.get(widgetId)
    if (!buffer) return
    
    if (maxCount !== undefined) {
      const safeMaxCount = Math.min(maxCount, MEMORY_LIMITS.MAX_SINGLE_BUFFER)
      buffer.maxCount = safeMaxCount
      if (buffer.messages.length > safeMaxCount) {
        buffer.messages.splice(0, buffer.messages.length - safeMaxCount)
      }
    }
    if (maxAge !== undefined) buffer.maxAge = maxAge
  }
  
  // ============================================================================
  // COMPUTED
  // ============================================================================
  
  function useLatestValue(widgetId: string) {
    return computed(() => getLatest(widgetId))
  }
  
  function useBuffer(widgetId: string) {
    return computed(() => getBuffer(widgetId))
  }
  
  const activeBufferCount = computed(() => buffers.value.size)
  
  const totalMessageCount = computed(() => {
    let total = 0
    for (const buffer of buffers.value.values()) {
      total += buffer.messages.length
    }
    return total
  })
  
  const memoryEstimate = computed(() => {
    return totalMessageCount.value * MEMORY_LIMITS.BYTES_PER_MESSAGE_ESTIMATE
  })
  
  const hasMemoryWarning = computed(() => memoryWarning.value !== null)
  
  const memoryUsagePercent = computed(() => {
    const percent = (totalMessageCount.value / MEMORY_LIMITS.MAX_TOTAL_MESSAGES) * 100
    return Math.min(percent, 100)
  })
  
  // ============================================================================
  // RETURN PUBLIC API
  // ============================================================================
  
  return {
    buffers,
    memoryWarning,
    initializeBuffer,
    addMessage,
    batchAddMessages, // <--- IMPORTANT: This must be here
    getBuffer,
    getLatest,
    getBufferSize,
    clearBuffer,
    removeBuffer,
    clearAllBuffers,
    updateBufferConfig,
    useLatestValue,
    useBuffer,
    activeBufferCount,
    totalMessageCount,
    memoryEstimate,
    hasMemoryWarning,
    memoryUsagePercent,
    MEMORY_LIMITS,
  }
})
