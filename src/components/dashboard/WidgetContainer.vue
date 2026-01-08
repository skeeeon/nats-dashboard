<template>
  <div class="widget-container" :class="{ 'is-locked': dashboardStore.isLocked, 'is-mobile': isMobile }">
    <div v-if="!config" class="widget-error">
      <div class="error-icon">⚠️</div>
      <div class="error-message">Configuration missing</div>
    </div>
    
    <template v-else>
      <!-- HEADER LOGIC -->
      <!-- Desktop Unlocked: Show Full Header -->
      <!-- Desktop Locked: Hide Header (Clean look) OR Show if complex widget -->
      <!-- Mobile Unlocked: Show Header (For buttons), Hide Title (Avoid duplication) -->
      <!-- Mobile Locked: Hide Header (Card mode handles title) -->
      <div 
        v-if="shouldShowHeader" 
        class="widget-header vue-draggable-handle"
      >
        <!-- Title: Hide on Mobile Unlocked (Card shows it) -->
        <div v-if="!isMobile" class="widget-title" :title="config.title">{{ config.title }}</div>
        <div v-else class="widget-title"><!-- Spacer --></div>

        <div class="widget-actions">
          <button class="icon-btn" title="Full Screen" @click="$emit('fullscreen')">⛶</button>
          
          <template v-if="!dashboardStore.isLocked">
            <button class="icon-btn" title="Duplicate" @click="$emit('duplicate')">📋</button>
            <button class="icon-btn" title="Configure" @click="$emit('configure')">⚙️</button>
            <button class="icon-btn danger" title="Delete" @click="handleDelete">✕</button>
          </template>
        </div>
      </div>
      
      <div class="widget-body">
        <div v-if="error" class="widget-error">
          <div class="error-icon">⚠️</div>
          <div class="error-message">{{ error }}</div>
        </div>
        
        <!-- Pass layout-mode explicitly based on device -->
        <component 
          v-else
          :is="widgetComponent" 
          :config="config"
          :layout-mode="isMobile ? 'card' : 'standard'"
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
  isMobile?: boolean
}>()

const emit = defineEmits<{
  delete: []
  configure: []
  duplicate: []
  fullscreen: []
}>()

const dashboardStore = useDashboardStore()
const error = ref<string | null>(null)

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
    default: return null
  }
})

/**
 * Determine if header should be visible
 */
const shouldShowHeader = computed(() => {
  // If unlocked, we generally need the header for controls
  if (!dashboardStore.isLocked) return true
  
  // If locked...
  
  // On Mobile: Hide header (Card mode self-contained)
  if (props.isMobile) return false
  
  // On Desktop: 
  // Complex widgets (Chart, Map) usually keep header for Title
  // Simple widgets (Button, Switch) might look cleaner without, but standard behavior implies header
  // Let's hide header for simple controls on desktop locked for cleaner look
  // unless user specifically wants titles.
  // For now, let's behave like the "Previous Styling": Header visible if config.title is relevant? 
  // Actually, previous styling usually HID the gray bar in locked mode for cleaner UI.
  // We will hide header on locked desktop unless it's a complex widget.
  
  const complexWidgets = ['chart', 'map', 'slider', 'stat', 'gauge']
  return complexWidgets.includes(props.config?.type || '')
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
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.widget-container:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.widget-container.is-locked {
  border-color: transparent;
  background: var(--widget-bg);
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
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
  min-width: 20px; /* Ensure spacer has size */
}

.widget-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 14px;
  min-width: 28px;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
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
  position: relative;
  container-type: size;
}

.widget-error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  color: var(--color-error);
  text-align: center;
}

.error-icon { font-size: 24px; margin-bottom: 4px; }
.error-message { font-size: 12px; line-height: 1.4; }
</style>
