<template>
  <div class="dashboard-grid-container">
    
    <!-- MOBILE LAYOUT (Native CSS Grid) -->
    <div v-if="isMobile" class="mobile-layout">
      <div 
        v-for="widget in sortedWidgets" 
        :key="widget.id"
        class="mobile-widget-wrapper"
        :class="{ 'span-full': isFullWidthOnMobile(widget.type) }"
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

    <!-- DESKTOP LAYOUT (Library Grid) -->
    <GridLayout
      v-else
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
      drag-allow-from=".vue-draggable-handle"
      drag-ignore-from=".vue-grid-item-no-drag"      
      @breakpoint-changed="handleBreakpointChange"
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
import type { WidgetConfig, WidgetType } from '@/types/dashboard'

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
const isMobile = ref(false)

const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
const cols = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }

function checkMobile() {
  // Simple check matching CSS media query
  isMobile.value = window.innerWidth < 768
}

const sortedWidgets = computed(() => {
  return [...props.widgets].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  })
})

function isFullWidthOnMobile(type: WidgetType): boolean {
  return ['map', 'chart', 'slider', 'stat', 'gauge'].includes(type)
}

const isDraggable = computed(() => !dashboardStore.isLocked)
const isResizable = computed(() => !dashboardStore.isLocked)

function mapWidgetsToLayout(widgets: WidgetConfig[]) {
  const sorted = [...widgets].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  })
  return sorted.map(w => ({
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
  if (isWidgetSetChanged(currentLayoutIds, newPropsIds) || currentBreakpoint.value === 'lg') {
    layoutItems.value = mapWidgetsToLayout(newWidgets)
  }
}, { deep: true })

function handleBreakpointChange(breakpoint: string, newLayout: any[]) {
  currentBreakpoint.value = breakpoint
  if (breakpoint === 'lg') layoutItems.value = mapWidgetsToLayout(props.widgets)
  else layoutItems.value = newLayout
}

function handleLayoutUpdate(newLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) {
  if (dashboardStore.isLocked || isMobile.value) return
  layoutItems.value = newLayout
  if (currentBreakpoint.value === 'lg') {
    const updates = newLayout.map(item => ({
      id: item.i, x: item.x, y: item.y, w: item.w, h: item.h
    }))
    dashboardStore.batchUpdateLayout(updates)
  }
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
}

.mobile-widget-wrapper {
  min-height: 80px; 
}

.mobile-widget-wrapper.span-full {
  grid-column: span 2;
  min-height: 250px;
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
