<template>
  <div class="dashboard-grid-container">
    <GridLayout
      v-model:layout="layoutItems"
      :col-num="12"
      :row-height="80"
      :is-draggable="isDraggable"
      :is-resizable="isResizable"
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
    
    <!-- Mobile drag disabled indicator -->
    <div v-if="isMobile && widgets.length > 0" class="mobile-hint">
      💡 Switch to desktop to rearrange widgets
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import WidgetContainer from './WidgetContainer.vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { WidgetConfig } from '@/types/dashboard'

/**
 * Dashboard Grid Component
 * 
 * Grug say: Grid hold widgets. Drag and drop on desktop.
 * Stack nice on mobile. No drag on mobile - too hard to use.
 * 
 * FIXED: Dashboard switching now works on mobile!
 * - Detects when widget IDs completely change (dashboard switch)
 * - Syncs layout properly on all breakpoints
 * - Disables drag/resize on mobile for better UX
 */

/**
 * Dashboard Grid Component
 * 
 * Grug say: Grid hold widgets. Drag and drop on desktop.
 * Stack nice on mobile. No drag on mobile - too hard to use.
 * 
 * FIXED: Dashboard switching now works on mobile!
 * - Detects when widget IDs completely change (dashboard switch)
 * - Syncs layout properly on all breakpoints
 * - Disables drag/resize on mobile for better UX
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

const currentBreakpoint = ref('lg')

// Standard Bootstrap-like breakpoints
const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
// Column counts for each breakpoint
const cols = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }

/**
 * Detect if we're on mobile
 * Grug say: Mobile = small screen. No drag there.
 */
const isMobile = computed(() => {
  return ['sm', 'xs', 'xxs'].includes(currentBreakpoint.value)
})

/**
 * Conditionally enable drag/resize based on breakpoint
 * Grug say: Desktop = drag good. Mobile = drag bad (fingers too big).
 */
const isDraggable = computed(() => !isMobile.value)
const isResizable = computed(() => !isMobile.value)

/**
 * Helper to map store widgets to grid layout items
 * 
 * Grug say: Sort by position so mobile stack looks good.
 * Top-left widgets appear first on mobile.
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
 * Extract widget IDs from current layout
 * Grug say: Use this to detect dashboard switches
 */
function getLayoutWidgetIds(): string[] {
  return layoutItems.value.map(item => item.i)
}

/**
 * Extract widget IDs from props
 */
function getPropsWidgetIds(): string[] {
  return props.widgets.map(w => w.id)
}

/**
 * Check if widget sets are completely different
 * Grug say: If IDs don't match, user switched dashboard
 */
function isWidgetSetChanged(layoutIds: string[], propsIds: string[]): boolean {
  // Different lengths = definitely changed
  if (layoutIds.length !== propsIds.length) {
    return true
  }
  
  // Check if any ID in layout is missing from props
  // This means the widget set has fundamentally changed (dashboard switch)
  const propsSet = new Set(propsIds)
  return layoutIds.some(id => !propsSet.has(id))
}

/**
 * Sync from store to local state
 * 
 * FIXED: Now properly detects dashboard switches vs. grid manipulation
 */
watch(() => props.widgets, (newWidgets) => {
  const currentLayoutIds = getLayoutWidgetIds()
  const newPropsIds = getPropsWidgetIds()
  
  // Check if this is a fundamental change (dashboard switch)
  const isDashboardSwitch = isWidgetSetChanged(currentLayoutIds, newPropsIds)
  
  if (isDashboardSwitch) {
    // Dashboard switched - update layout on ALL breakpoints
    console.log('[Grid] Dashboard switch detected, syncing layout')
    layoutItems.value = mapWidgetsToLayout(newWidgets)
  } else if (currentBreakpoint.value === 'lg') {
    // Same dashboard, desktop mode - sync layout from store
    // (This handles external changes like widget addition)
    layoutItems.value = mapWidgetsToLayout(newWidgets)
  }
  // else: Same dashboard, mobile mode, user dragging - don't interfere
  
}, { deep: true })

/**
 * Handle Breakpoint Changes
 * 
 * Grug say: When screen size change, adjust layout
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
 * 
 * Grug say: Only save to store on desktop. Mobile no drag anyway.
 */
function handleLayoutUpdate(newLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) {
  layoutItems.value = newLayout

  // Only save to store when on desktop
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

/**
 * Get widget config by ID
 * Grug say: Find widget blueprint from ID
 */
function getWidgetConfig(id: string): WidgetConfig | undefined {
  return props.widgets.find(w => w.id === id)
}

/**
 * Widget action handlers
 * Grug say: Pass events up to parent
 */
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

/* Mobile hint - NEW */
.mobile-hint {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-info-bg);
  border: 1px solid var(--color-info-border);
  color: var(--color-info);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  z-index: 10;
  pointer-events: none;
  opacity: 0.9;
  animation: fadeInUp 0.3s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    opacity: 0.9;
    transform: translateX(-50%) translateY(0);
  }
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
  
  /* Hide resize handles on mobile since drag/resize disabled */
  :deep(.vue-resizable-handle) {
    display: none;
  }
  
  /* Remove hover effects on mobile */
  :deep(.vue-grid-item:hover .vue-resizable-handle) {
    opacity: 0;
  }
}
</style>
