<template>
  <div class="dashboard-grid-container" ref="containerRef">
    <!-- MOBILE LAYOUT (Native CSS Grid) - < 768px -->
    <div 
      v-if="isMobile" 
      class="mobile-layout"
      :class="{ 'is-editing': !dashboardStore.isLocked }"
    >
      <!-- ... existing mobile code ... -->
      <div 
        v-for="widget in sortedWidgets" 
        :key="widget.id"
        class="mobile-widget-wrapper"
        :class="{ 
          'span-full': shouldSpanFullMobile(widget.id),
          'is-tall': isTallWidget(widget)
        }"
      >
        <WidgetContainer
          :config="widget"
          :is-mobile="true"
          @delete="handleWidgetDelete(widget.id)"
          @configure="handleWidgetConfigure(widget.id)"
          @duplicate="handleWidgetDuplicate(widget.id)"
          @fullscreen="handleWidgetFullscreen(widget.id)"
        />
      </div>
      
      <div v-if="widgets.length === 0" class="empty-state mobile">
        <div class="empty-icon">📊</div>
        <div class="empty-message">No widgets</div>
        <div class="empty-hint">Switch to desktop to add widgets</div>
      </div>
    </div>

    <!-- TABLET/DESKTOP LAYOUT -->
    <GridLayout
      v-else
      v-model:layout="layoutItems"
      :col-num="activeColNum"
      :row-height="80"
      :is-draggable="isDraggable"
      :is-resizable="isResizable"
      :vertical-compact="true"
      :margin="[16, 16]"
      :use-css-transforms="true"
      :responsive="true"
      :breakpoints="breakpoints"
      :cols="cols"
      drag-allow-from=".vue-draggable-handle"
      drag-ignore-from=".vue-grid-item-no-drag"      
      @layout-updated="handleLayoutUpdate"
    >
      <GridItem
        v-for="item in layoutItems"
        :key="item.i"
        v-bind="item"
        :min-w="1"
        :min-h="1"
      >
        <WidgetContainer
          :config="getWidgetConfig(item.i)"
          :is-mobile="false"
          @delete="handleWidgetDelete(item.i)"
          @configure="handleWidgetConfigure(item.i)"
          @duplicate="handleWidgetDuplicate(item.i)"
          @fullscreen="handleWidgetFullscreen(item.i)"
        />
      </GridItem>
    </GridLayout>
    
    <div v-if="!isMobile && widgets.length === 0" class="empty-state">
      <div class="empty-icon">📊</div>
      <div class="empty-message">No widgets yet</div>
      <div class="empty-hint">
        <template v-if="!dashboardStore.isLocked">Click "Add Widget" to get started</template>
        <template v-else>Dashboard is locked</template>
      </div>
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import WidgetContainer from './WidgetContainer.vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { WidgetConfig } from '@/types/dashboard'

const props = defineProps<{
  widgets: WidgetConfig[]
  columnCount?: number // New prop
}>()

const emit = defineEmits<{
  deleteWidget: [widgetId: string]
  configureWidget: [widgetId: string]
  duplicateWidget: [widgetId: string]
  fullscreenWidget: [widgetId: string]
}>()

const dashboardStore = useDashboardStore()
const containerRef = ref<HTMLElement | null>(null)
const isMobile = ref(false)

// Standard breakpoints for library
const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }

/**
 * Computed Column Configuration
 * If user set a specific number, force that number across all non-mobile breakpoints.
 * If user set "Auto" (0 or undefined), use standard responsive steps.
 */
const cols = computed(() => {
  const count = props.columnCount || 12 // Default to 12 if not set
  
  if (count > 0) {
    // Fixed mode: Squish the grid, don't reflow
    return { lg: count, md: count, sm: count, xs: 2, xxs: 2 }
  } else {
    // Auto mode: Reflow based on screen size (Standard Bootstrap-ish grid)
    return { lg: 12, md: 10, sm: 6, xs: 2, xxs: 2 }
  }
})

// Current max columns (for the grid library prop)
const activeColNum = computed(() => {
  const count = props.columnCount || 12
  return count > 0 ? count : 12
})

function checkMobile() {
  const width = containerRef.value ? containerRef.value.clientWidth : window.innerWidth
  isMobile.value = width < 768
}

// ... existing logic for mobileWidgetLayout, sorting, and watchers (kept same) ...

const sortedWidgets = computed(() => {
  return [...props.widgets].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  })
})

function isIntrinsicallyFullWidth(widget: WidgetConfig): boolean {
  if (['map', 'chart', 'console', 'publisher'].includes(widget.type)) return true
  if (widget.type === 'kv' && (widget.w > 2 || widget.h > 2)) return true
  if (['slider', 'gauge', 'stat'].includes(widget.type)) return true
  return false
}

function isTallWidget(widget: WidgetConfig): boolean {
  if (['map', 'chart', 'console', 'publisher'].includes(widget.type)) return true
  if (['gauge', 'stat'].includes(widget.type)) return true
  if (widget.type === 'kv' && widget.h > 2) return true
  return false
}

const mobileWidgetLayout = computed(() => {
  const layoutMap = new Map<string, boolean>()
  let currentColumn = 0

  sortedWidgets.value.forEach((widget, index) => {
    if (isIntrinsicallyFullWidth(widget)) {
      layoutMap.set(widget.id, true)
      currentColumn = 0
    } else {
      if (currentColumn === 0) {
        const nextWidget = sortedWidgets.value[index + 1]
        const nextIsFull = !nextWidget || isIntrinsicallyFullWidth(nextWidget)

        if (nextIsFull) {
          layoutMap.set(widget.id, true)
          currentColumn = 0
        } else {
          layoutMap.set(widget.id, false)
          currentColumn = 1
        }
      } else {
        layoutMap.set(widget.id, false)
        currentColumn = 0 
      }
    }
  })

  return layoutMap
})

function shouldSpanFullMobile(widgetId: string): boolean {
  if (!dashboardStore.isLocked) return true
  return mobileWidgetLayout.value.get(widgetId) ?? true
}

const isDraggable = computed(() => !dashboardStore.isLocked)
const isResizable = computed(() => !dashboardStore.isLocked)

function mapWidgetsToLayout(widgets: WidgetConfig[]) {
  return widgets.map(w => ({
    i: w.id, x: w.x, y: w.y, w: w.w, h: w.h,
  }))
}

const layoutItems = ref(mapWidgetsToLayout(props.widgets))

function getLayoutWidgetIds(): string[] { return layoutItems.value.map(item => item.i) }
function getPropsWidgetIds(): string[] { return props.widgets.map(w => w.id) }

function isWidgetSetChanged(layoutIds: string[], propsIds: string[]): boolean {
  if (layoutIds.length !== propsIds.length) return true
  const propsSet = new Set(propsIds)
  return layoutIds.some(id => !propsSet.has(id))
}

watch(() => props.widgets, (newWidgets) => {
  if (isMobile.value) return
  const currentLayoutIds = getLayoutWidgetIds()
  const newPropsIds = getPropsWidgetIds()
  
  if (isWidgetSetChanged(currentLayoutIds, newPropsIds)) {
    layoutItems.value = mapWidgetsToLayout(newWidgets)
  }
}, { deep: true })

function handleLayoutUpdate(newLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) {
  if (dashboardStore.isLocked || isMobile.value) return
  layoutItems.value = newLayout
  const updates = newLayout.map(item => ({
    id: item.i, x: item.x, y: item.y, w: item.w, h: item.h
  }))
  dashboardStore.batchUpdateLayout(updates)
}

function getWidgetConfig(id: string): WidgetConfig | undefined {
  return props.widgets.find(w => w.id === id)
}

function handleWidgetDelete(id: string) { emit('deleteWidget', id) }
function handleWidgetConfigure(id: string) { emit('configureWidget', id) }
function handleWidgetDuplicate(id: string) { emit('duplicateWidget', id) }
function handleWidgetFullscreen(id: string) { emit('fullscreenWidget', id) }

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
/* Keeping existing styles */
.dashboard-grid-container {
  height: 100%;
  width: 100%;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  background: var(--bg);
}

.mobile-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding-bottom: 40px;
  transition: all 0.3s ease;
}

.mobile-layout.is-editing {
  grid-template-columns: 1fr; 
}

.mobile-widget-wrapper {
  height: auto;
  min-height: 80px; 
  display: flex;
  flex-direction: column;
}

.mobile-layout.is-editing .mobile-widget-wrapper {
  min-height: 140px;
}

.mobile-widget-wrapper.span-full {
  grid-column: span 2;
}

.mobile-widget-wrapper.is-tall {
  min-height: 250px;
}

.mobile-layout.is-editing .mobile-widget-wrapper.span-full {
  grid-column: span 1;
}

:deep(.vue-grid-item) {
  transition: all 0.2s ease;
  background: transparent;
  touch-action: none;
}

:deep(.vue-grid-item .widget-body) {
  touch-action: auto;
}

:deep(.vue-grid-item.vue-grid-placeholder) {
  background: var(--color-info-bg) !important;
  border: 2px dashed var(--color-accent);
  border-radius: 8px;
  opacity: 0.3;
}

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

.empty-state.mobile {
  position: relative;
  top: auto;
  left: auto;
  transform: none;
  grid-column: span 2;
  padding: 40px 0;
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

@media (max-width: 480px) {
  .dashboard-grid-container {
    padding: 8px;
  }
  .mobile-layout {
    gap: 8px;
  }
}
</style>
