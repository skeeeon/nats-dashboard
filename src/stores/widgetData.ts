// src/stores/widgetData.ts
import { defineStore } from 'pinia'
import { ref, computed, triggerRef } from 'vue' // Added triggerRef

/**
 * Buffered Message Entry
 */
export interface BufferedMessage {
  timestamp: number
  value: any
  raw?: any
  subject?: string
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
  BYTES_PER_MESSAGE_ESTIMATE: 2048
}

export const useWidgetDataStore = defineStore('widgetData', () => {
  // ============================================================================
  // STATE
  // ============================================================================
  
  const buffers = ref<Map<string, WidgetDataBuffer>>(new Map())
  const memoryWarning = ref<string | null>(null)
  
  // Track total lifetime messages for throughput calc
  const cumulativeCount = ref(0) 
  
  // ============================================================================
  // COMPUTED
  // ============================================================================

  const activeBufferCount = computed(() => buffers.value.size)
  
  const totalBufferedCount = computed(() => {
    let total = 0
    for (const buffer of buffers.value.values()) {
      total += buffer.messages.length
    }
    return total
  })
  
  const memoryEstimate = computed(() => {
    return totalBufferedCount.value * MEMORY_LIMITS.BYTES_PER_MESSAGE_ESTIMATE
  })
  
  const hasMemoryWarning = computed(() => memoryWarning.value !== null)
  
  const memoryUsagePercent = computed(() => {
    const percent = (totalBufferedCount.value / MEMORY_LIMITS.MAX_TOTAL_MESSAGES) * 100
    return Math.min(percent, 100)
  })

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
      // Map structure changed, reactivity triggers automatically here
    }
  }
  
  function checkMemoryPressure(): boolean {
    const totalMessages = totalBufferedCount.value
    
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
    const totalMessages = totalBufferedCount.value
    if (totalMessages <= MEMORY_LIMITS.MAX_TOTAL_MESSAGES) return
    
    for (const buffer of buffers.value.values()) {
      if (buffer.messages.length > 10) {
        const toRemove = Math.ceil(buffer.messages.length * 0.25)
        buffer.messages.splice(0, toRemove)
      }
    }
  }
  
  function addMessage(widgetId: string, value: any, raw?: any, subject?: string) {
    batchAddMessages([{ widgetId, value, raw, subject, timestamp: Date.now() }])
  }

  function batchAddMessages(items: Array<{ widgetId: string, value: any, raw?: any, subject?: string, timestamp: number }>) {
    // Safely increment cumulative count
    const currentVal = Number(cumulativeCount.value) || 0
    cumulativeCount.value = currentVal + items.length

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
        raw: item.raw,
        subject: item.subject
      })
    }

    for (const [widgetId, newMessages] of updates) {
      let buffer = buffers.value.get(widgetId)
      
      if (!buffer) {
        initializeBuffer(widgetId)
        buffer = buffers.value.get(widgetId)!
      }

      buffer.messages.push(...newMessages)

      if (buffer.messages.length > buffer.maxCount) {
        const overage = buffer.messages.length - buffer.maxCount
        buffer.messages.splice(0, overage)
      }
    }

    if (checkMemoryPressure()) {
      pruneIfNeeded()
    }

    // IMPORTANT: Force Vue to re-evaluate computed properties derived from buffers
    // because we mutated the nested arrays without changing the Map keys.
    triggerRef(buffers)
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
    if (buffer) {
      buffer.messages = []
      triggerRef(buffers)
    }
  }
  
  function removeBuffer(widgetId: string) {
    if (buffers.value.delete(widgetId)) {
      triggerRef(buffers)
    }
  }
  
  function clearAllBuffers() {
    buffers.value.clear()
    memoryWarning.value = null
    // cumulativeCount.value = 0 // Optional: keep lifetime count or reset? Grug say keep.
  }
  
  function updateBufferConfig(widgetId: string, maxCount?: number, maxAge?: number) {
    const buffer = buffers.value.get(widgetId)
    if (!buffer) return
    
    if (maxCount !== undefined) {
      const safeMaxCount = Math.min(maxCount, MEMORY_LIMITS.MAX_SINGLE_BUFFER)
      buffer.maxCount = safeMaxCount
      if (buffer.messages.length > safeMaxCount) {
        buffer.messages.splice(0, buffer.messages.length - safeMaxCount)
        triggerRef(buffers)
      }
    }
    if (maxAge !== undefined) buffer.maxAge = maxAge
  }
  
  function useLatestValue(widgetId: string) {
    return computed(() => getLatest(widgetId))
  }
  
  function useBuffer(widgetId: string) {
    return computed(() => getBuffer(widgetId))
  }
  
  return {
    buffers,
    memoryWarning,
    cumulativeCount,
    initializeBuffer,
    addMessage,
    batchAddMessages,
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
    totalMessageCount: totalBufferedCount,
    totalBufferedCount,
    memoryEstimate,
    hasMemoryWarning,
    memoryUsagePercent,
    MEMORY_LIMITS,
  }
})
