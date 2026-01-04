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
      :responsive="true"
      :breakpoints="breakpoints"
      :cols="cols"
      @breakpoint-changed="handleBreakpointChange"
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
import { ref, watch } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import WidgetContainer from './WidgetContainer.vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { WidgetConfig } from '@/types/dashboard'

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

const currentBreakpoint = ref('lg')

// Standard Bootstrap-like breakpoints
const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
// Column counts for each breakpoint
const cols = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }

/**
 * Helper to map store widgets to grid layout items
 * 
 * FIX IMPLEMENTED:
 * We sort the widgets by their Y (row) and then X (col) position.
 * This ensures the DOM order matches the Visual order.
 * When the grid switches to mobile (stacking), it stacks based on DOM order,
 * so this ensures Top-Left widgets appear first on mobile.
 */
function mapWidgetsToLayout(widgets: WidgetConfig[]) {
  // 1. Create a shallow copy to sort
  const sortedWidgets = [...widgets].sort((a, b) => {
    // Primary sort: Vertical Position (Y)
    if (a.y !== b.y) {
      return a.y - b.y
    }
    // Secondary sort: Horizontal Position (X)
    return a.x - b.x
  })

  // 2. Map to layout items
  return sortedWidgets.map(w => ({
    i: w.id,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
  }))
}

// Local state for the layout (mutable)
const layoutItems = ref(mapWidgetsToLayout(props.widgets))

/**
 * Sync from store to local state
 */
watch(() => props.widgets, (newWidgets) => {
  if (currentBreakpoint.value === 'lg') {
    layoutItems.value = mapWidgetsToLayout(newWidgets)
  }
}, { deep: true })

/**
 * Handle Breakpoint Changes
 */
function handleBreakpointChange(breakpoint: string, newLayout: any[]) {
  console.log(`[Grid] Breakpoint changed: ${currentBreakpoint.value} -> ${breakpoint}`)
  currentBreakpoint.value = breakpoint

  if (breakpoint === 'lg') {
    // Restore Master Layout from store (Desktop)
    layoutItems.value = mapWidgetsToLayout(props.widgets)
  } else {
    // Accept Mobile Layout (temporary visual reflow)
    layoutItems.value = newLayout
  }
}

/**
 * Handle layout changes (drag/resize)
 */
function handleLayoutUpdate(newLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) {
  layoutItems.value = newLayout

  if (currentBreakpoint.value === 'lg') {
    // Save to Store
    newLayout.forEach(item => {
      dashboardStore.updateWidgetLayout(item.i, {
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      })
    })
  }
}

function getWidgetConfig(id: string): WidgetConfig | undefined {
  return props.widgets.find(w => w.id === id)
}

function handleWidgetDelete(widgetId: string) {
  emit('deleteWidget', widgetId)
}

function handleWidgetConfigure(widgetId: string) {
  emit('configureWidget', widgetId)
}

function handleWidgetDuplicate(widgetId: string) {
  emit('duplicateWidget', widgetId)
}

function handleWidgetFullscreen(widgetId: string) {
  emit('fullscreenWidget', widgetId)
}
</script>

<style scoped>
.dashboard-grid-container {
  height: 100%;
  width: 100%;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  background: var(--bg);
}

/* Empty state styling */
.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--muted);
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
  color: var(--text);
}

.empty-hint {
  font-size: 14px;
}

/* Grid item styling */
:deep(.vue-grid-item) {
  transition: all 0.2s ease;
  background: transparent;
  touch-action: none;
}

/* Allow scrolling inside widget content */
:deep(.vue-grid-item .widget-body) {
  touch-action: auto;
}

/* Dragging placeholder */
:deep(.vue-grid-item.vue-grid-placeholder) {
  background: var(--color-info-bg);
  border: 2px dashed var(--color-accent);
  border-radius: 8px;
  transition: all 0.2s;
}

/* Resize handle styling */
:deep(.vue-resizable-handle) {
  opacity: 0;
  transition: opacity 0.2s;
  background: var(--color-accent);
  border-radius: 0 0 8px 0;
}

:deep(.vue-grid-item:hover .vue-resizable-handle) {
  opacity: 0.6;
}

:deep(.vue-resizable-handle:hover) {
  opacity: 1 !important;
}

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
