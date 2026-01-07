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
          <!-- Full screen is always available -->
          <button 
            class="icon-btn" 
            title="Full Screen (F)"
            @click="$emit('fullscreen')"
          >
            ⛶
          </button>

          <!-- Admin controls: Hidden when dashboard is locked -->
          <template v-if="!dashboardStore.isLocked">
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
          </template>
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
import { useDashboardStore } from '@/stores/dashboard'
import type { WidgetConfig } from '@/types/dashboard'
import TextWidget from '@/components/widgets/TextWidget.vue'
import ChartWidget from '@/components/widgets/ChartWidget.vue'
import ButtonWidget from '@/components/widgets/ButtonWidget.vue'
import KvWidget from '@/components/widgets/KvWidget.vue'
import SwitchWidget from '@/components/widgets/SwitchWidget.vue'
import SliderWidget from '@/components/widgets/SliderWidget.vue'
import StatCardWidget from '@/components/widgets/StatCardWidget.vue'
import GaugeWidget from '@/components/widgets/GaugeWidget.vue'
import MapWidget from '@/components/widgets/MapWidget.vue'

const props = defineProps<{
  config?: WidgetConfig
}>()

const emit = defineEmits<{
  delete: []
  configure: []
  duplicate: []
  fullscreen: []
}>()

const dashboardStore = useDashboardStore()
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
    case 'map': return MapWidget
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
  flex-shrink: 0;
  gap: 8px;
  height: 40px;
}

.widget-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
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
  touch-action: auto;
  pointer-events: auto;
  
  /* Enable container queries for children */
  container-type: size;
  
  /* Ensure widget body stays below header for drag handle */
  z-index: 0;
}

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
