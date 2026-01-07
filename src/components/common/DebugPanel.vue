<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="modal debug-modal">
      <div class="modal-header">
        <h3>Debug Panel</h3>
        <button class="close-btn" @click="close">✕</button>
      </div>
      
      <div class="modal-body">
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
          <div class="stat-row">
            <span class="stat-label">Server:</span>
            <span class="stat-value">{{ currentServer }}</span>
          </div>
        </div>
        
        <!-- Throughput & Queue -->
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
          
          <!-- NEW: Processing Queue Stats -->
          <div class="queue-stats">
            <div class="stat-row">
              <span class="stat-label">Processing Queue:</span>
              <span class="stat-value" :class="queueHealthClass">
                {{ subStats.queueSize }} / {{ subStats.maxQueueSize }}
              </span>
            </div>
            <div class="queue-bar-bg">
              <div 
                class="queue-bar-fill"
                :class="queueHealthClass"
                :style="{ width: queuePercent + '%' }"
              ></div>
            </div>
            <div class="help-text" v-if="queuePercent > 50">
              High queue indicates main thread is blocked.
            </div>
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
      </div>
      
      <div class="modal-actions">
        <button class="btn-secondary" @click="refreshStats">
          Refresh Stats
        </button>
        <button class="btn-danger" @click="clearAllBuffers">
          Clear All Buffers
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { useWidgetDataStore } from '@/stores/widgetData'
import { getSubscriptionManager } from '@/composables/useSubscriptionManager'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()
const dataStore = useWidgetDataStore()
const subManager = getSubscriptionManager()

const lastMessageCount = ref(0)
const messagesPerSecond = ref(0)
const throughputHistory = ref<number[]>(new Array(20).fill(0))
const currentSubStats = ref(subManager.getStats())

// Update interval
let updateInterval: number | null = null

function close() {
  emit('update:modelValue', false)
}

const statusClass = computed(() => `status-${natsStore.status}`)
const memoryPercent = computed(() => dataStore.memoryUsagePercent)
const currentServer = computed(() => natsStore.nc?.getServer() || 'Unknown')

const memoryPercentClass = computed(() => {
  if (memoryPercent.value >= 90) return 'memory-critical'
  if (memoryPercent.value >= 70) return 'memory-warning'
  return ''
})

const subStats = computed(() => currentSubStats.value)

// Queue Health Logic
const queuePercent = computed(() => {
  const size = subStats.value.queueSize
  const max = subStats.value.maxQueueSize || 1000
  return Math.min((size / max) * 100, 100)
})

const queueHealthClass = computed(() => {
  if (queuePercent.value > 80) return 'memory-critical' // Red
  if (queuePercent.value > 40) return 'memory-warning'  // Orange
  return 'status-connected' // Green
})

const memoryMB = computed(() => (dataStore.memoryEstimate / 1024 / 1024).toFixed(2))
const memoryMBNumber = computed(() => dataStore.memoryEstimate / 1024 / 1024)

const widgetTypeCount = computed(() => {
  const counts: Record<string, number> = {}
  dashboardStore.activeWidgets.forEach(w => {
    counts[w.type] = (counts[w.type] || 0) + 1
  })
  return counts
})

const maxThroughput = computed(() => Math.max(...throughputHistory.value, 10))

function updateStats() {
  // Throughput
  const currentCount = dataStore.totalMessageCount
  const newMessages = currentCount - lastMessageCount.value
  
  messagesPerSecond.value = newMessages
  lastMessageCount.value = currentCount
  
  throughputHistory.value.push(newMessages)
  if (throughputHistory.value.length > 20) {
    throughputHistory.value.shift()
  }

  // Live Queue & Sub Stats
  currentSubStats.value = subManager.getStats()
}

function clearAllBuffers() {
  if (confirm('Clear all widget data buffers? This will remove all message history.')) {
    dataStore.clearAllBuffers()
  }
}

function refreshStats() {
  updateStats()
}

// Only run stats loop when modal is open
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    lastMessageCount.value = dataStore.totalMessageCount
    // Update every 1s
    updateInterval = setInterval(updateStats, 1000) as unknown as number
    // Also run immediately
    updateStats()
  } else {
    if (updateInterval) {
      clearInterval(updateInterval)
      updateInterval = null
    }
  }
})

onUnmounted(() => {
  if (updateInterval) {
    clearInterval(updateInterval)
  }
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.2s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 { margin: 0; font-size: 18px; }

.close-btn {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 24px;
  cursor: pointer;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.debug-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.debug-section:last-child {
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
  margin-bottom: 12px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
}

.stat-label { color: var(--muted); }
.stat-value { color: var(--text); font-weight: 500; font-family: var(--mono); }

/* Status colors */
.stat-value.status-connected { color: var(--connection-connected); }
.stat-value.status-connecting { color: var(--connection-connecting); }
.stat-value.status-disconnected { color: var(--connection-disconnected); }
.stat-value.memory-warning { color: var(--color-warning); }
.stat-value.memory-critical { color: var(--color-error); }

/* Subscription List */
.subscription-list {
  margin-top: 8px;
  max-height: 150px;
  overflow-y: auto;
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

.sub-listeners { color: var(--muted); flex-shrink: 0; }

/* Widget Breakdown */
.widget-type-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.type-count {
  font-size: 11px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  color: var(--text);
}

/* Throughput Chart */
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

/* Queue Stats */
.queue-stats {
  margin-top: 12px;
  background: rgba(0, 0, 0, 0.1);
  padding: 8px;
  border-radius: 4px;
}

.queue-bar-bg {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
}

.queue-bar-fill {
  height: 100%;
  background: var(--connection-connected);
  transition: width 0.3s ease;
}

.queue-bar-fill.memory-warning { background: var(--color-warning); }
.queue-bar-fill.memory-critical { background: var(--color-error); }

.help-text {
  margin-top: 4px;
  font-size: 10px;
  color: var(--color-warning);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn-secondary, .btn-danger {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-danger {
  background: var(--color-error-bg);
  color: var(--color-error);
  border: 1px solid var(--color-error-border);
}

.btn-danger:hover {
  background: var(--color-error);
  color: white;
}
</style>
