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
            <span class="meta-label">Rev:</span>
            <span class="meta-value">{{ revision }}</span>
          </span>
          <span v-if="lastUpdated" class="meta-item">
            <span class="meta-label">Upd:</span>
            <span class="meta-value">{{ lastUpdated }}</span>
          </span>
        </template>
      </div>
    </div>
    
    <div v-else class="kv-empty">
      <div class="empty-icon">🗄️</div>
      <div>Key not found</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { Kvm } from '@nats-io/kv'
import { JSONPath } from 'jsonpath-plus'
import LoadingState from '@/components/common/LoadingState.vue'
import { useThresholds } from '@/composables/useThresholds'
import type { WidgetConfig } from '@/types/dashboard'
import { decodeBytes } from '@/utils/encoding'

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()
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

const valueColor = computed(() => {
  if (!isSingleValue.value) return 'var(--text)'
  const val = processedValue.value
  const rules = props.config.kvConfig?.thresholds || []
  const color = evaluateThresholds(val, rules)
  return color || 'var(--text)'
})

async function loadKvValue() {
  const bucket = props.config.dataSource.kvBucket
  const key = props.config.dataSource.kvKey
  
  if (!bucket || !key || bucket === 'my-bucket') {
    error.value = 'Click ⚙️ to configure'
    loading.value = false
    return
  }
  
  if (!natsStore.nc || !natsStore.isConnected) {
    error.value = 'Not connected'
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
      kvValue.value = decodeBytes(entry.value)
      revision.value = entry.revision
      lastUpdated.value = new Date().toLocaleTimeString()
    } else {
      kvValue.value = null
    }
    
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
      } catch (err) {}
    })()
    
    loading.value = false
  } catch (err: any) {
    if (err.message.includes('stream not found')) {
      error.value = `Bucket "${bucket}" not found`
    } else {
      error.value = err.message
    }
    loading.value = false
  }
}

function cleanup() {
  if (watcher) { try { watcher.stop() } catch {} watcher = null }
}

onMounted(() => {
  if (natsStore.isConnected) loadKvValue()
})

onUnmounted(cleanup)

watch(() => [props.config.dataSource.kvBucket, props.config.dataSource.kvKey, props.config.jsonPath], () => { 
  cleanup()
  loadKvValue()
})

watch(() => natsStore.isConnected, (isConnected) => {
  if (isConnected) loadKvValue()
  else {
    cleanup()
    error.value = 'Not connected'
    loading.value = false
  }
})
</script>

<style scoped>
.kv-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;
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

.kv-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  gap: 8px;
}

.kv-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.kv-bucket { font-size: 10px; color: var(--muted); text-transform: uppercase; }
.kv-key { font-size: 12px; font-weight: 600; color: var(--color-accent); font-family: var(--mono); }

.kv-value {
  flex: 1;
  min-height: 0;
  overflow: auto;
  position: relative;
}

.single-value-mode .kv-value {
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.value-display {
  font-size: clamp(16px, 15cqw, 60px);
  font-weight: 600;
  text-align: center;
  word-break: break-word;
  line-height: 1.2;
  font-family: var(--mono);
  transition: color 0.3s ease;
}

.kv-value-content {
  margin: 0;
  padding: 8px;
  background: var(--input-bg); /* Better contrast */
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text);
  font-family: var(--mono);
  white-space: pre-wrap;
  word-break: break-all;
  min-height: 100%;
}

/* Custom Scrollbar for JSON */
.kv-value::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.kv-value::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.kv-meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  flex-shrink: 0;
}

.kv-widget:not(.single-value-mode) .kv-meta {
  padding-top: 4px;
  border-top: 1px solid var(--border);
}

.single-value-mode .kv-meta {
  margin-top: 8px;
  justify-content: center;
}

.meta-simple { color: var(--muted); font-family: var(--mono); }
.meta-item { display: flex; gap: 4px; }
.meta-label { color: var(--muted); }
.meta-value { color: var(--text); font-family: var(--mono); }

/* Hide meta on very small widgets */
@container (height < 80px) {
  .kv-meta { display: none; }
}
</style>
