<template>
  <div class="kv-widget" :class="{ 'single-value-mode': isSingleValue }">
    <div v-if="loading" class="kv-loading">
      <LoadingState size="small" inline />
    </div>
    
    <div v-else-if="error" class="kv-error">
      <div class="error-icon">⚠️</div>
      <div class="error-text">{{ error }}</div>
    </div>
    
    <div v-else-if="kvValue !== null" class="kv-content">
      <!-- Header: Only show for complex objects -->
      <div v-if="!isSingleValue" class="kv-header">
        <div class="kv-bucket">{{ config.dataSource.kvBucket }}</div>
        <div class="kv-key">{{ config.dataSource.kvKey }}</div>
      </div>
      
      <div class="kv-value">
        <!-- Single Value Mode -->
        <div 
          v-if="isSingleValue" 
          class="value-display"
          :style="{ color: valueColor }"
        >
          {{ displayContent }}
        </div>
        
        <!-- Complex Mode -->
        <pre v-else class="kv-value-content">{{ displayContent }}</pre>
      </div>
      
      <!-- Metadata Footer -->
      <div class="kv-meta">
        <template v-if="isSingleValue">
          <span class="meta-simple">
             Rev {{ revision }} • {{ lastUpdated }}
          </span>
        </template>
        
        <template v-else>
          <span class="meta-item">
            <span class="meta-label">Revision:</span>
            <span class="meta-value">{{ revision }}</span>
          </span>
          <span v-if="lastUpdated" class="meta-item">
            <span class="meta-label">Updated:</span>
            <span class="meta-value">{{ lastUpdated }}</span>
          </span>
        </template>
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
import { JSONPath } from 'jsonpath-plus'
import LoadingState from '@/components/common/LoadingState.vue'
import { useDesignTokens } from '@/composables/useDesignTokens'
import { useThresholds } from '@/composables/useThresholds'
import type { WidgetConfig } from '@/types/dashboard'

/**
 * KV Widget Component
 * 
 * Grug say: Watch key-value store. Show value. Update when change.
 * 
 * FIXED: Now watches for NATS connection and loads when connected
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()
const { baseColors } = useDesignTokens()
const { evaluateThresholds } = useThresholds()

// State
const kvValue = ref<string | null>(null)
const revision = ref<number>(0)
const lastUpdated = ref<string | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
let watcher: any = null

// Computed
const processedValue = computed(() => {
  if (kvValue.value === null) return null
  let val: any = kvValue.value
  let isJson = false

  try {
    val = JSON.parse(kvValue.value)
    isJson = true
  } catch { }

  if (props.config.jsonPath && isJson) {
    try {
      const extracted = JSONPath({ 
        path: props.config.jsonPath, 
        json: val, 
        wrap: false 
      })
      if (extracted === undefined) return undefined
      return extracted
    } catch (err) {
      console.warn('[KvWidget] JSONPath error:', err)
      return undefined
    }
  }
  return val
})

const isSingleValue = computed(() => {
  const val = processedValue.value
  return val === null || val === undefined || (typeof val !== 'object')
})

const displayContent = computed(() => {
  const val = processedValue.value
  if (val === undefined) return '<path not found>'
  if (val === null) return ''
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
})

// Apply Thresholds
const valueColor = computed(() => {
  if (!isSingleValue.value) return baseColors.value.text
  
  const val = processedValue.value
  const rules = props.config.kvConfig?.thresholds || []
  
  const color = evaluateThresholds(val, rules)
  return color || baseColors.value.text
})

/**
 * Load KV value from NATS
 * Grug say: Get value from bucket, watch for changes
 */
async function loadKvValue() {
  const bucket = props.config.dataSource.kvBucket
  const key = props.config.dataSource.kvKey
  
  if (!bucket || !key || bucket === 'my-bucket') {
    error.value = 'Click ⚙️ to configure bucket and key'
    loading.value = false
    return
  }
  
  if (!natsStore.nc || !natsStore.isConnected) {
    error.value = 'Not connected to NATS'
    loading.value = false
    return
  }
  
  try {
    loading.value = true
    error.value = null
    
    const kvm = new Kvm(natsStore.nc)
    const kv = await kvm.open(bucket)
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
    if (err.message.includes('stream not found')) {
      error.value = `Bucket "${bucket}" not found`
    } else {
      error.value = err.message || 'Failed to load KV value'
    }
    loading.value = false
  }
}

/**
 * Cleanup watcher
 * Grug say: Stop watching when widget destroyed
 */
function cleanup() {
  if (watcher) {
    try { 
      watcher.stop() 
    } catch {}
    watcher = null
  }
}

// Initial load
onMounted(() => {
  if (natsStore.isConnected) {
    loadKvValue()
  }
})

// Cleanup on unmount
onUnmounted(() => {
  cleanup()
})

// Watch for config changes (bucket, key, jsonPath)
watch(
  () => [props.config.dataSource.kvBucket, props.config.dataSource.kvKey, props.config.jsonPath],
  () => { 
    cleanup()
    loadKvValue()
  }
)

// FIXED: Watch for NATS connection status
// Grug say: When NATS connect, load KV value. Simple.
watch(
  () => natsStore.isConnected,
  (isConnected) => {
    if (isConnected) {
      console.log('[KvWidget] NATS connected, loading KV value')
      loadKvValue()
    } else {
      cleanup()
      error.value = 'Not connected to NATS'
      loading.value = false
    }
  }
)
</script>

<style scoped>
.kv-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--widget-bg);
  border-radius: 8px;
  overflow: hidden;
}

.kv-widget.single-value-mode {
  justify-content: center;
  align-items: center;
}

.kv-loading, .kv-error, .kv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  gap: 8px;
}

.kv-error { color: var(--color-error); }
.kv-empty { color: var(--muted); }
.error-icon, .empty-icon { font-size: 32px; }
.error-text { font-size: 13px; line-height: 1.4; }
.empty-hint { font-size: 11px; font-family: var(--mono); color: var(--color-accent); }

.kv-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  gap: 12px;
}

.kv-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.kv-bucket { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
.kv-key { font-size: 14px; font-weight: 600; color: var(--color-accent); font-family: var(--mono); }

.kv-value {
  flex: 1;
  min-height: 0;
  overflow: auto;
  position: relative;
  display: flex;
  flex-direction: column;
}

.single-value-mode .kv-value {
  justify-content: center;
  overflow: hidden;
}

.value-display {
  font-size: 24px;
  font-weight: 600;
  text-align: center;
  word-break: break-word;
  line-height: 1.3;
  font-family: var(--mono);
  /* Color set via style binding now */
  transition: color 0.3s ease;
}

.kv-value-content {
  margin: 0;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  font-family: var(--mono);
  white-space: pre-wrap;
  word-break: break-all;
  min-height: 100%;
}

.kv-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  flex-shrink: 0;
}

.kv-widget:not(.single-value-mode) .kv-meta {
  padding-top: 8px;
  border-top: 1px solid var(--border);
  gap: 12px;
}

.single-value-mode .kv-meta {
  margin-top: 12px;
  justify-content: center;
}

.meta-simple { color: var(--muted); font-family: var(--mono); }
.meta-item { display: flex; gap: 6px; }
.meta-label { color: var(--muted); }
.meta-value { color: var(--text); font-family: var(--mono); }
</style>
