import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Dashboard, WidgetConfig } from '@/types/dashboard'
import { createDefaultDashboard } from '@/types/dashboard'

/**
 * Dashboard Store
 * 
 * Grug say: This store hold blueprints for dashboards and widgets.
 * It NOT hold actual data - that is different store (widgetData.ts).
 * 
 * Think of it like this:
 * - This store = Recipe book (instructions)
 * - Widget data store = Kitchen (actual food)
 */
export const useDashboardStore = defineStore('dashboard', () => {
  // ============================================================================
  // STATE
  // ============================================================================
  
  // All dashboards (stored in localStorage)
  const dashboards = ref<Dashboard[]>([])
  
  // Currently active dashboard ID
  const activeDashboardId = ref<string | null>(null)
  
  // ============================================================================
  // COMPUTED
  // ============================================================================
  
  /**
   * Get the currently active dashboard
   */
  const activeDashboard = computed<Dashboard | null>(() => {
    if (!activeDashboardId.value) return null
    return dashboards.value.find(d => d.id === activeDashboardId.value) || null
  })
  
  /**
   * Get widgets from active dashboard
   */
  const activeWidgets = computed<WidgetConfig[]>(() => {
    return activeDashboard.value?.widgets || []
  })
  
  // ============================================================================
  // PERSISTENCE (localStorage)
  // ============================================================================
  
  const STORAGE_KEY = 'nats_dashboards'
  
  /**
   * Load dashboards from localStorage
   */
  function loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        dashboards.value = parsed.dashboards || []
        activeDashboardId.value = parsed.activeDashboardId || null
        
        console.log(`Loaded ${dashboards.value.length} dashboards from storage`)
      } else {
        // First time - create default dashboard
        const defaultDash = createDefaultDashboard('My Dashboard')
        dashboards.value = [defaultDash]
        activeDashboardId.value = defaultDash.id
        saveToStorage()
      }
    } catch (err) {
      console.error('Failed to load dashboards from storage:', err)
      // On error, start fresh
      const defaultDash = createDefaultDashboard('My Dashboard')
      dashboards.value = [defaultDash]
      activeDashboardId.value = defaultDash.id
    }
  }
  
  /**
   * Save dashboards to localStorage
   */
  function saveToStorage() {
    try {
      const data = {
        dashboards: dashboards.value,
        activeDashboardId: activeDashboardId.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      console.log('Saved dashboards to storage')
    } catch (err) {
      console.error('Failed to save dashboards to storage:', err)
    }
  }
  
  // ============================================================================
  // DASHBOARD CRUD
  // ============================================================================
  
  /**
   * Create new dashboard
   */
  function createDashboard(name: string): Dashboard {
    const dashboard = createDefaultDashboard(name)
    dashboards.value.push(dashboard)
    activeDashboardId.value = dashboard.id
    saveToStorage()
    return dashboard
  }
  
  /**
   * Delete dashboard
   */
  function deleteDashboard(id: string) {
    const index = dashboards.value.findIndex(d => d.id === id)
    if (index === -1) return
    
    dashboards.value.splice(index, 1)
    
    // If deleted active dashboard, switch to first available
    if (activeDashboardId.value === id) {
      activeDashboardId.value = dashboards.value.length > 0 ? dashboards.value[0].id : null
    }
    
    saveToStorage()
  }
  
  /**
   * Update dashboard metadata
   */
  function updateDashboard(id: string, updates: Partial<Dashboard>) {
    const dashboard = dashboards.value.find(d => d.id === id)
    if (!dashboard) return
    
    Object.assign(dashboard, updates)
    dashboard.modified = Date.now()
    saveToStorage()
  }
  
  /**
   * Set active dashboard
   */
  function setActiveDashboard(id: string) {
    const exists = dashboards.value.some(d => d.id === id)
    if (exists) {
      activeDashboardId.value = id
      saveToStorage()
    }
  }
  
  // ============================================================================
  // WIDGET CRUD
  // ============================================================================
  
  /**
   * Add widget to active dashboard
   */
  function addWidget(widget: WidgetConfig) {
    if (!activeDashboard.value) {
      console.error('No active dashboard')
      return
    }
    
    activeDashboard.value.widgets.push(widget)
    activeDashboard.value.modified = Date.now()
    saveToStorage()
  }
  
  /**
   * Update widget configuration
   */
  function updateWidget(widgetId: string, updates: Partial<WidgetConfig>) {
    if (!activeDashboard.value) return
    
    const widget = activeDashboard.value.widgets.find(w => w.id === widgetId)
    if (!widget) return
    
    Object.assign(widget, updates)
    activeDashboard.value.modified = Date.now()
    saveToStorage()
  }
  
  /**
   * Remove widget from active dashboard
   */
  function removeWidget(widgetId: string) {
    if (!activeDashboard.value) return
    
    const index = activeDashboard.value.widgets.findIndex(w => w.id === widgetId)
    if (index === -1) return
    
    activeDashboard.value.widgets.splice(index, 1)
    activeDashboard.value.modified = Date.now()
    saveToStorage()
  }
  
  /**
   * Get specific widget by ID
   */
  function getWidget(widgetId: string): WidgetConfig | null {
    if (!activeDashboard.value) return null
    return activeDashboard.value.widgets.find(w => w.id === widgetId) || null
  }
  
  /**
   * Update widget position/size (for grid drag/resize)
   */
  function updateWidgetLayout(widgetId: string, layout: { x: number; y: number; w: number; h: number }) {
    if (!activeDashboard.value) return
    
    const widget = activeDashboard.value.widgets.find(w => w.id === widgetId)
    if (!widget) return
    
    widget.x = layout.x
    widget.y = layout.y
    widget.w = layout.w
    widget.h = layout.h
    
    activeDashboard.value.modified = Date.now()
    saveToStorage()
  }
  
  // ============================================================================
  // IMPORT / EXPORT
  // ============================================================================
  
  /**
   * Export dashboard as JSON
   */
  function exportDashboard(id: string): string | null {
    const dashboard = dashboards.value.find(d => d.id === id)
    if (!dashboard) return null
    
    return JSON.stringify(dashboard, null, 2)
  }
  
  /**
   * Import dashboard from JSON
   */
  function importDashboard(json: string): Dashboard | null {
    try {
      const dashboard = JSON.parse(json) as Dashboard
      
      // Validate basic structure
      if (!dashboard.id || !dashboard.name || !Array.isArray(dashboard.widgets)) {
        throw new Error('Invalid dashboard format')
      }
      
      // Generate new ID to avoid conflicts
      dashboard.id = `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      dashboard.modified = Date.now()
      
      dashboards.value.push(dashboard)
      saveToStorage()
      
      return dashboard
    } catch (err) {
      console.error('Failed to import dashboard:', err)
      return null
    }
  }
  
  // ============================================================================
  // RETURN PUBLIC API
  // ============================================================================
  
  return {
    // State
    dashboards,
    activeDashboardId,
    activeDashboard,
    activeWidgets,
    
    // Persistence
    loadFromStorage,
    saveToStorage,
    
    // Dashboard CRUD
    createDashboard,
    deleteDashboard,
    updateDashboard,
    setActiveDashboard,
    
    // Widget CRUD
    addWidget,
    updateWidget,
    removeWidget,
    getWidget,
    updateWidgetLayout,
    
    // Import/Export
    exportDashboard,
    importDashboard,
  }
})
