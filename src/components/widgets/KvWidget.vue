<template>
  <div class="kv-widget">
    <div v-if="loading" class="kv-loading">
      <div class="loading-spinner">⟳</div>
      <div>Loading...</div>
    </div>
    
    <div v-else-if="error" class="kv-error">
      <div class="error-icon">⚠️</div>
      <div class="error-text">{{ error }}</div>
    </div>
    
    <div v-else-if="kvValue !== null" class="kv-content">
      <div class="kv-header">
        <div class="kv-bucket">{{ config.dataSource.kvBucket }}</div>
        <div class="kv-key">{{ config.dataSource.kvKey }}</div>
      </div>
      
      <div class="kv-value">
        <pre v-if="displayFormat === 'json'" class="kv-value-json">{{ formattedValue }}</pre>
        <div v-else class="kv-value-raw">{{ kvValue }}</div>
      </div>
      
      <div class="kv-meta">
        <span>Revision: {{ revision }}</span>
        <span v-if="lastUpdated">Updated: {{ lastUpdated }}</span>
      </div>
    </div>
    
    <div v-else class="kv-empty">
      <div class="empty-icon">🗄️</div>
      <div>Key not found</div>
      <div class="empty-hint">
        {{ config.dataSource.kvBucket }} / {{ config.dataSource.kvKey }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { Kvm } from '@nats-io/kv'
import type { WidgetConfig } from '@/types/dashboard'

/**
 * KV Widget
 * 
 * Grug say: Show value from KV bucket. Watch for changes.
 * Like text widget but for KV store instead of messages.
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()

// State
const kvValue = ref<string | null>(null)
const revision = ref<number>(0)
const lastUpdated = ref<string | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Watcher
let watcher: any = null

// Display format
const displayFormat = computed(() => 
  props.config.kvConfig?.displayFormat || 'json'
)

// Format value for display
const formattedValue = computed(() => {
  if (!kvValue.value) return ''
  
  try {
    const parsed = JSON.parse(kvValue.value)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return kvValue.value
  }
})

/**
 * Load KV value and start watching
 */
async function loadKvValue() {
  const bucket = props.config.dataSource.kvBucket
  const key = props.config.dataSource.kvKey
  
  if (!bucket || !key) {
    error.value = 'Click ⚙️ to configure bucket and key'
    loading.value = false
    return
  }
  
  // Don't try to connect if using placeholder values
  if (bucket === 'my-bucket' || key === 'my-key') {
    error.value = 'Click ⚙️ to configure bucket and key'
    loading.value = false
    return
  }
  
  if (!natsStore.nc) {
    error.value = 'Not connected to NATS'
    loading.value = false
    return
  }
  
  try {
    loading.value = true
    error.value = null
    
    // Open KV bucket
    const kvm = new Kvm(natsStore.nc)
    const kv = await kvm.open(bucket)
    
    // Get current value
    const entry = await kv.get(key)
    if (entry) {
      const decoder = new TextDecoder()
      kvValue.value = decoder.decode(entry.value)
      revision.value = entry.revision
      lastUpdated.value = new Date().toLocaleTimeString()
    } else {
      kvValue.value = null
    }
    
    // Watch for changes
    const iter = await kv.watch({ key })
    watcher = iter
    
    ;(async () => {
      try {
        for await (const e of iter) {
          if (e.key === key) {
            if (e.operation === 'PUT') {
              const decoder = new TextDecoder()
              kvValue.value = decoder.decode(e.value!)
              revision.value = e.revision
              lastUpdated.value = new Date().toLocaleTimeString()
            } else if (e.operation === 'DEL' || e.operation === 'PURGE') {
              kvValue.value = null
              revision.value = e.revision
              lastUpdated.value = new Date().toLocaleTimeString()
            }
          }
        }
      } catch (err: any) {
        console.error('[KV Widget] Watch error:', err)
      }
    })()
    
    loading.value = false
  } catch (err: any) {
    console.error('[KV Widget] Load error:', err)
    
    // Provide helpful error messages
    if (err.message.includes('stream not found')) {
      error.value = `Bucket "${bucket}" not found. Create it with: nats kv add ${bucket}`
    } else {
      error.value = err.message || 'Failed to load KV value'
    }
    
    loading.value = false
  }
}

/**
 * Cleanup watcher
 */
function cleanup() {
  if (watcher) {
    try {
      watcher.stop()
    } catch (err) {
      console.error('[KV Widget] Cleanup error:', err)
    }
    watcher = null
  }
}

// Lifecycle
onMounted(() => {
  loadKvValue()
})

onUnmounted(() => {
  cleanup()
})

// Watch for configuration changes
watch(
  () => [props.config.dataSource.kvBucket, props.config.dataSource.kvKey],
  () => {
    // Config changed - reload widget
    cleanup()
    loadKvValue()
  }
)
</script>

<style scoped>
.kv-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  overflow: hidden;
}

/* Loading state */
.kv-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted, #888);
  gap: 8px;
}

.loading-spinner {
  font-size: 32px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Error state */
.kv-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--danger, #f85149);
  gap: 8px;
}

.error-icon {
  font-size: 32px;
}

.error-text {
  font-size: 13px;
  text-align: center;
}

/* Content */
.kv-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.kv-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border, #333);
}

.kv-bucket {
  font-size: 11px;
  color: var(--muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kv-key {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent, #58a6ff);
  font-family: var(--mono, monospace);
}

.kv-value {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.kv-value-json {
  margin: 0;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text, #e0e0e0);
  font-family: var(--mono, monospace);
  overflow: auto;
}

.kv-value-raw {
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text, #e0e0e0);
  font-family: var(--mono, monospace);
  word-break: break-all;
}

.kv-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted, #888);
  padding-top: 8px;
  border-top: 1px solid var(--border, #333);
}

/* Empty state */
.kv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted, #888);
  gap: 8px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-hint {
  font-size: 11px;
  font-family: var(--mono, monospace);
  color: var(--accent, #58a6ff);
}
</style>
