<template>
  <div class="dashboard-grid-container">
    <GridLayout
      v-model:layout="layoutItems"
      :col-num="12"
      :row-height="80"
      :is-draggable="true"
      :is-resizable="true"
      :vertical-compact="true"
      :margin="[16, 16]"
      :use-css-transforms="true"
      @layout-updated="handleLayoutUpdate"
    >
      <GridItem
        v-for="item in layoutItems"
        :key="item.i"
        v-bind="item"
        :min-w="2"
        :min-h="1"
      >
        <WidgetContainer
          :config="getWidgetConfig(item.i)"
          @delete="handleWidgetDelete(item.i)"
          @configure="handleWidgetConfigure(item.i)"
          @duplicate="handleWidgetDuplicate(item.i)"
          @fullscreen="handleWidgetFullscreen(item.i)"
        />
      </GridItem>
    </GridLayout>
    
    <!-- Empty state when no widgets -->
    <div v-if="widgets.length === 0" class="empty-state">
      <div class="empty-icon">📊</div>
      <div class="empty-message">No widgets yet</div>
      <div class="empty-hint">Click "Add Widget" to get started</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import WidgetContainer from './WidgetContainer.vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { WidgetConfig } from '@/types/dashboard'

/**
 * Dashboard Grid - Using grid-layout-plus
 * 
 * Grug say: Use correct API this time! v-bind="item" is key.
 * Now we get drag-drop AND resize. Much better!
 */

const props = defineProps<{
  widgets: WidgetConfig[]
}>()

const emit = defineEmits<{
  deleteWidget: [widgetId: string]
  configureWidget: [widgetId: string]
  duplicateWidget: [widgetId: string]
  fullscreenWidget: [widgetId: string]
}>()

const dashboardStore = useDashboardStore()

/**
 * Convert widgets to grid-layout-plus format
 * Key difference: Use 'i' (string) not 'id'
 */
const layoutItems = computed({
  get: () => {
    return props.widgets.map(w => ({
      i: w.id,      // grid-layout-plus uses 'i' for ID
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
    }))
  },
  set: () => {
    // Required by v-model but handled via @layout-updated
  }
})

/**
 * Get widget config by ID
 * Needed because GridItem only knows about layout, not widget config
 */
function getWidgetConfig(id: string): WidgetConfig | undefined {
  return props.widgets.find(w => w.id === id)
}

/**
 * Handle layout changes (drag/resize)
 * Grid-layout-plus emits updated layout with new positions
 */
function handleLayoutUpdate(newLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) {
  // Update each widget's position in store
  newLayout.forEach(item => {
    dashboardStore.updateWidgetLayout(item.i, {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    })
  })
}

/**
 * Handle widget deletion
 */
function handleWidgetDelete(widgetId: string) {
  emit('deleteWidget', widgetId)
}

/**
 * Handle widget configuration
 */
function handleWidgetConfigure(widgetId: string) {
  emit('configureWidget', widgetId)
}

/**
 * Handle widget duplication
 * Grug say: New feature! Copy widget.
 */
function handleWidgetDuplicate(widgetId: string) {
  emit('duplicateWidget', widgetId)
}

/**
 * Handle widget full screen
 * Grug say: Make widget big!
 */
function handleWidgetFullscreen(widgetId: string) {
  emit('fullscreenWidget', widgetId)
}
</script>

<style scoped>
.dashboard-grid-container {
  height: 100%;
  width: 100%;
  position: relative;
  overflow: auto;
  padding: 16px;
  background: var(--bg, #0a0a0a);
}

/* Empty state styling */
.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--muted, #888);
  pointer-events: none;
  z-index: 0;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-message {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text, #e0e0e0);
}

.empty-hint {
  font-size: 14px;
}

/* Grid item styling */
:deep(.vue-grid-item) {
  transition: all 0.2s ease;
  background: transparent;
}

/* Dragging state */
:deep(.vue-grid-item.vue-grid-placeholder) {
  background: rgba(88, 166, 255, 0.2);
  border: 2px dashed var(--accent, #58a6ff);
  border-radius: 8px;
  transition: all 0.2s;
}

/* Resize handle styling */
:deep(.vue-resizable-handle) {
  opacity: 0;
  transition: opacity 0.2s;
  background: var(--accent, #58a6ff);
  border-radius: 0 0 8px 0;
}

:deep(.vue-grid-item:hover .vue-resizable-handle) {
  opacity: 0.6;
}

:deep(.vue-resizable-handle:hover) {
  opacity: 1 !important;
}

/* Dragging state - make it clear what's being dragged */
:deep(.vue-grid-item.vue-dragging) {
  opacity: 0.8;
  z-index: 1000;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .dashboard-grid-container {
    padding: 8px;
  }
}
</style>
