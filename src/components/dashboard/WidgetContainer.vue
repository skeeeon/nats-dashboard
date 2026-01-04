<template>
  <div class="widget-container">
    <!-- Header with title and actions -->
    <div class="widget-header">
      <div class="widget-title">{{ config.title }}</div>
      <div class="widget-actions">
        <button 
          class="icon-btn" 
          title="Full Screen (F)"
          @click="$emit('fullscreen')"
        >
          ⛶
        </button>
        <button 
          class="icon-btn" 
          title="Duplicate Widget"
          @click="$emit('duplicate')"
        >
          📋
        </button>
        <button 
          class="icon-btn" 
          title="Configure Widget"
          @click="$emit('configure')"
        >
          ⚙️
        </button>
        <button 
          class="icon-btn danger" 
          title="Delete Widget"
          @click="handleDelete"
        >
          ✕
        </button>
      </div>
    </div>
    
    <!-- Widget body with error boundary -->
    <div class="widget-body">
      <div v-if="error" class="widget-error">
        <div class="error-icon">⚠️</div>
        <div class="error-message">{{ error }}</div>
      </div>
      <component 
        v-else
        :is="widgetComponent" 
        :config="config"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onErrorCaptured } from 'vue'
import type { WidgetConfig } from '@/types/dashboard'
import TextWidget from '@/components/widgets/TextWidget.vue'
import ChartWidget from '@/components/widgets/ChartWidget.vue'
import ButtonWidget from '@/components/widgets/ButtonWidget.vue'
import KvWidget from '@/components/widgets/KvWidget.vue'

/**
 * Widget Container
 * 
 * Grug say: Container is box that holds widget.
 * Box same for all widgets. Provides:
 * - Title bar
 * - Duplicate button (NEW!)
 * - Configure button
 * - Delete button
 * - Error handling
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const emit = defineEmits<{
  delete: []
  configure: []
  duplicate: []
  fullscreen: []
}>()

// Error state for error boundary
const error = ref<string | null>(null)

// Map widget type to component
const widgetComponent = computed(() => {
  switch (props.config.type) {
    case 'text':
      return TextWidget
    case 'chart':
      return ChartWidget
    case 'button':
      return ButtonWidget
    case 'kv':
      return KvWidget
    default:
      error.value = `Unknown widget type: ${props.config.type}`
      return null
  }
})

// Handle delete with confirmation
function handleDelete() {
  if (confirm(`Delete widget "${props.config.title}"?`)) {
    emit('delete')
  }
}

// Error boundary - catch errors from child components
onErrorCaptured((err) => {
  console.error(`Widget error (${props.config.id}):`, err)
  error.value = err.message || 'Widget error'
  return false // Stop error propagation
})
</script>

<style scoped>
.widget-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--panel, #161616);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid var(--border, #333);
  flex-shrink: 0;
}

.widget-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #e0e0e0);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--muted, #888);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text, #e0e0e0);
}

.icon-btn.danger:hover {
  background: rgba(248, 81, 73, 0.2);
  color: var(--danger, #f85149);
}

.widget-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

/* Error state styling */
.widget-error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  color: var(--danger, #f85149);
  text-align: center;
}

.error-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.error-message {
  font-size: 13px;
  line-height: 1.4;
}
</style>
