<template>
  <div class="widget-container">
    <!-- Safety check: render nothing if config is undefined -->
    <div v-if="!config" class="widget-error">
      <div class="error-icon">⚠️</div>
      <div class="error-message">Widget configuration missing</div>
    </div>
    
    <template v-else>
      <!-- Header with title and actions -->
      <div class="widget-header vue-draggable-handle">
        <div class="widget-title" :title="config.title">{{ config.title }}</div>
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onErrorCaptured } from 'vue'
import type { WidgetConfig } from '@/types/dashboard'
import TextWidget from '@/components/widgets/TextWidget.vue'
import ChartWidget from '@/components/widgets/ChartWidget.vue'
import ButtonWidget from '@/components/widgets/ButtonWidget.vue'
import KvWidget from '@/components/widgets/KvWidget.vue'
import SwitchWidget from '@/components/widgets/SwitchWidget.vue'
import SliderWidget from '@/components/widgets/SliderWidget.vue'
import StatCardWidget from '@/components/widgets/StatCardWidget.vue'
import GaugeWidget from '@/components/widgets/GaugeWidget.vue'

/**
 * Widget Container Component
 * 
 * Grug say: Box around widget. Has title and buttons.
 * 
 * FIXED: Now handles all 8 widget types including the new ones!
 * - switch: Toggle control widget
 * - slider: Range control widget
 * - stat: KPI card with trend
 * - gauge: Circular meter widget
 */

const props = defineProps<{
  config?: WidgetConfig // Made optional to handle undefined during transitions
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
  if (!props.config) return null
  
  switch (props.config.type) {
    case 'text': return TextWidget
    case 'chart': return ChartWidget
    case 'button': return ButtonWidget
    case 'kv': return KvWidget
    case 'switch': return SwitchWidget
    case 'slider': return SliderWidget
    case 'stat': return StatCardWidget
    case 'gauge': return GaugeWidget
    default:
      error.value = `Unknown type: ${props.config.type}`
      return null
  }
})

function handleDelete() {
  if (!props.config) return
  
  if (confirm(`Delete widget "${props.config.title}"?`)) {
    emit('delete')
  }
}

onErrorCaptured((err) => {
  console.error(`Widget error (${props.config?.id}):`, err)
  error.value = err.message || 'Widget error'
  return false
})
</script>

<style scoped>
.widget-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--widget-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: box-shadow 0.2s ease;
}

.widget-container:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: var(--widget-header-bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0; /* Prevent header from squashing */
  gap: 8px;
  height: 40px;
}

.widget-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  /* Flex magic for truncation */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0; /* Critical for flex item truncation */
}

.widget-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
  
  /* Touch target improvement */
  min-width: 28px;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.icon-btn.danger:hover {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.widget-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  /* Allow touch actions and interactions within widget body */
  touch-action: auto;
  /* Ensure interactive elements work properly */
  pointer-events: auto;
}

/* Error state styling */
.widget-error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  color: var(--color-error);
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
