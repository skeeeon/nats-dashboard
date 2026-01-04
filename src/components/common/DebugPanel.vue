<template>
  <div class="debug-panel" :class="{ collapsed: isCollapsed }">
    <!-- Header with toggle -->
    <div class="debug-header" @click="isCollapsed = !isCollapsed">
      <div class="debug-title">
        <span class="debug-icon">🔍</span>
        Debug Panel
      </div>
      <div class="debug-toggle">
        {{ isCollapsed ? '▼' : '▲' }}
      </div>
    </div>
    
    <!-- Content (hidden when collapsed) -->
    <div v-if="!isCollapsed" class="debug-content">
      <!-- Connection Stats -->
      <div class="debug-section">
        <div class="section-title">Connection</div>
        <div class="stat-row">
          <span class="stat-label">Status:</span>
          <span class="stat-value" :class="statusClass">
            {{ natsStore.status }}
          </span>
        </div>
        <div v-if="natsStore.rtt" class="stat-row">
          <span class="stat-label">RTT:</span>
          <span class="stat-value">{{ natsStore.rtt }}ms</span>
        </div>
      </div>
      
      <!-- Subscription Stats -->
      <div class="debug-section">
        <div class="section-title">Subscriptions</div>
        <div class="stat-row">
          <span class="stat-label">Active:</span>
          <span class="stat-value">{{ subStats.subscriptionCount }}</span>
        </div>
        <div class="subscription-list">
          <div 
            v-for="sub in subStats.subscriptions" 
            :key="sub.subject"
            class="subscription-item"
          >
            <div class="sub-subject">{{ sub.subject }}</div>
            <div class="sub-listeners">{{ sub.listenerCount }} widgets</div>
          </div>
        </div>
      </div>
      
      <!-- Buffer Stats -->
      <div class="debug-section">
        <div class="section-title">Data Buffers</div>
        <div class="stat-row">
          <span class="stat-label">Active Buffers:</span>
          <span class="stat-value">{{ dataStore.activeBufferCount }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total Messages:</span>
          <span class="stat-value">{{ dataStore.totalMessageCount }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Memory Est:</span>
          <span 
            class="stat-value"
            :class="{ 'memory-warning': memoryMBNumber > 10 }"
          >
            {{ memoryMB }}MB
          </span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Usage:</span>
          <span class="stat-value" :class="memoryPercentClass">
            {{ memoryPercent.toFixed(1) }}%
          </span>
        </div>
      </div>
      
      <!-- Widget Stats -->
      <div class="debug-section">
        <div class="section-title">Widgets</div>
        <div class="stat-row">
          <span class="stat-label">Total:</span>
          <span class="stat-value">{{ dashboardStore.activeWidgets.length }}</span>
        </div>
        <div class="widget-type-breakdown">
          <div v-for="(count, type) in widgetTypeCount" :key="type" class="type-count">
            {{ type }}: {{ count }}
          </div>
        </div>
      </div>
      
      <!-- Message Throughput -->
      <div class="debug-section">
        <div class="section-title">Throughput</div>
        <div class="stat-row">
          <span class="stat-label">Msgs/sec:</span>
          <span class="stat-value">{{ messagesPerSecond }}</span>
        </div>
        <div class="throughput-chart">
          <div 
            v-for="(count, i) in throughputHistory"
            :key="i"
            class="throughput-bar"
            :style="{ height: (count / maxThroughput * 100) + '%' }"
          />
        </div>
      </div>
      
      <!-- Actions -->
      <div class="debug-actions">
        <button class="debug-btn" @click="clearAllBuffers">
          Clear All Buffers
        </button>
        <button class="debug-btn" @click="refreshStats">
          Refresh
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { useWidgetDataStore } from '@/stores/widgetData'
import { getSubscriptionManager } from '@/composables/useSubscriptionManager'

/**
 * Debug Panel Component
 * 
 * Grug say: Show what happening inside. Find slow parts. Fix problems.
 * Good for development and troubleshooting.
 * 
 * NEW: Uses design tokens for all colors!
 * (Colors are applied via CSS variables in the style section)
 */

const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()
const dataStore = useWidgetDataStore()
const subManager = getSubscriptionManager()

// Start collapsed by default - less intrusive
const isCollapsed = ref(true)
const lastMessageCount = ref(0)
const messagesPerSecond = ref(0)
const throughputHistory = ref<number[]>(new Array(20).fill(0))

// Update interval
let updateInterval: number | null = null

/**
 * Status class based on connection state
 */
const statusClass = computed(() => {
  return `status-${natsStore.status}`
})

/**
 * Memory percentage
 */
const memoryPercent = computed(() => dataStore.memoryUsagePercent)

/**
 * Memory percentage class for color
 */
const memoryPercentClass = computed(() => {
  if (memoryPercent.value >= 90) return 'memory-critical'
  if (memoryPercent.value >= 70) return 'memory-warning'
  return ''
})

/**
 * Get subscription stats from manager
 */
const subStats = computed(() => {
  const stats = subManager.getStats()
  return {
    subscriptionCount: stats.subscriptionCount,
    subscriptions: stats.subscriptions.map((sub: any) => ({
      subject: sub.subject,
      listenerCount: sub.listenerCount,
      isActive: sub.isActive,
    }))
  }
})

/**
 * Calculate memory usage in MB (as string for display)
 */
const memoryMB = computed(() => {
  return (dataStore.memoryEstimate / 1024 / 1024).toFixed(2)
})

/**
 * Calculate memory usage in MB (as number for comparison)
 */
const memoryMBNumber = computed(() => {
  return dataStore.memoryEstimate / 1024 / 1024
})

/**
 * Count widgets by type
 */
const widgetTypeCount = computed(() => {
  const counts: Record<string, number> = {}
  dashboardStore.activeWidgets.forEach(w => {
    counts[w.type] = (counts[w.type] || 0) + 1
  })
  return counts
})

/**
 * Max throughput for chart scaling
 */
const maxThroughput = computed(() => {
  return Math.max(...throughputHistory.value, 10)
})

/**
 * Update throughput stats
 */
function updateThroughput() {
  const currentCount = dataStore.totalMessageCount
  const newMessages = currentCount - lastMessageCount.value
  
  messagesPerSecond.value = newMessages
  lastMessageCount.value = currentCount
  
  // Update history (rolling window)
  throughputHistory.value.push(newMessages)
  if (throughputHistory.value.length > 20) {
    throughputHistory.value.shift()
  }
}

/**
 * Clear all data buffers
 */
function clearAllBuffers() {
  if (confirm('Clear all widget data buffers? This will remove all message history.')) {
    dataStore.clearAllBuffers()
    console.log('[Debug] Cleared all buffers')
  }
}

/**
 * Refresh stats manually
 */
function refreshStats() {
  updateThroughput()
}

/**
 * Start update loop
 */
onMounted(() => {
  // Update every second
  updateInterval = setInterval(updateThroughput, 1000) as unknown as number
  lastMessageCount.value = dataStore.totalMessageCount
})

/**
 * Cleanup
 */
onUnmounted(() => {
  if (updateInterval) {
    clearInterval(updateInterval)
  }
})
</script>

<style scoped>
.debug-panel {
  position: fixed;
  bottom: 0;
  right: 16px;
  width: 320px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  transition: all 0.3s ease;
}

.debug-panel.collapsed {
  width: 200px;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--widget-header-bg);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
}

.debug-header:hover {
  background: rgba(0, 0, 0, 0.4);
}

.debug-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.debug-icon {
  font-size: 16px;
}

.debug-toggle {
  color: var(--muted);
  font-size: 12px;
}

.debug-content {
  max-height: 60vh;
  overflow-y: auto;
  padding: 12px;
}

.debug-section {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.debug-section:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  margin-bottom: 8px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 13px;
}

.stat-label {
  color: var(--muted);
}

.stat-value {
  color: var(--text);
  font-weight: 500;
  font-family: var(--mono);
}

/* Status colors using design tokens! */
.stat-value.status-connected {
  color: var(--connection-connected);
}

.stat-value.status-connecting,
.stat-value.status-reconnecting {
  color: var(--connection-connecting);
}

.stat-value.status-disconnected {
  color: var(--connection-disconnected);
}

/* Memory warning colors using design tokens! */
.stat-value.memory-warning {
  color: var(--color-warning);
}

.stat-value.memory-critical {
  color: var(--color-error);
}

/* Subscription List */
.subscription-list {
  margin-top: 8px;
}

.subscription-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 11px;
}

.sub-subject {
  color: var(--color-accent);
  font-family: var(--mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
}

.sub-listeners {
  color: var(--muted);
  flex-shrink: 0;
}

/* Widget Type Breakdown */
.widget-type-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.type-count {
  font-size: 11px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  color: var(--text);
}

/* Throughput Chart - uses design tokens! */
.throughput-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 40px;
  margin-top: 8px;
  gap: 2px;
}

.throughput-bar {
  flex: 1;
  background: var(--color-accent);
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  transition: height 0.3s ease;
}

/* Actions */
.debug-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.debug-btn {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.debug-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--color-accent);
}
</style>
