// src/stores/dashboard.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Dashboard, WidgetConfig } from '@/types/dashboard'
import { createDefaultDashboard } from '@/types/dashboard'

/**
 * LocalStorage Error Types
 * Grug say: Know what went wrong so we can fix it
 */
type StorageErrorType = 'quota_exceeded' | 'security_error' | 'unknown'

/**
 * Dashboard Store
 * 
 * Grug say: This store hold blueprints for dashboards and widgets.
 * It NOT hold actual data - that is different store (widgetData.ts).
 * 
 * Think of it like this:
 * - This store = Recipe book (instructions)
 * - Widget data store = Kitchen (actual food)
 * 
 * NEW: Now with robust localStorage error handling!
 */
export const useDashboardStore = defineStore('dashboard', () => {
  // ============================================================================
  // STATE
  // ============================================================================
  
  // All dashboards (stored in localStorage)
  const dashboards = ref<Dashboard[]>([])
  
  // Currently active dashboard ID
  const activeDashboardId = ref<string | null>(null)
  
  // Storage error state
  const storageError = ref<string | null>(null)
  
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
  // PERSISTENCE (localStorage) with Error Handling
  // ============================================================================
  
  const STORAGE_KEY = 'nats_dashboards'
  
  /**
   * Detect localStorage error type
   * Grug say: Different errors need different solutions
   */
  function detectStorageErrorType(error: any): StorageErrorType {
    if (!error) return 'unknown'
    
    const errorString = error.toString().toLowerCase()
    const name = error.name?.toLowerCase() || ''
    
    // Quota exceeded - storage is full
    if (
      name.includes('quotaexceedederror') ||
      errorString.includes('quota') ||
      errorString.includes('exceeded')
    ) {
      return 'quota_exceeded'
    }
    
    // Security error - localStorage disabled or blocked
    if (
      name.includes('securityerror') ||
      errorString.includes('security')
    ) {
      return 'security_error'
    }
    
    return 'unknown'
  }
  
  /**
   * Handle localStorage errors gracefully
   * Grug say: When storage breaks, don't crash. Help user fix it.
   */
  function handleStorageError(error: any, operation: 'save' | 'load'): void {
    const errorType = detectStorageErrorType(error)
    
    console.error(`[Dashboard] Storage ${operation} error:`, error)
    
    switch (errorType) {
      case 'quota_exceeded':
        storageError.value = 
          'Storage quota exceeded. Dashboard may not be saved. ' +
          'Try deleting old dashboards or clearing browser data.'
        
        // If saving failed, try to free up space by removing oldest dashboard
        if (operation === 'save' && dashboards.value.length > 1) {
          console.warn('[Dashboard] Attempting to free space by removing oldest dashboard')
          const oldest = dashboards.value.reduce((prev, curr) => 
            prev.modified < curr.modified ? prev : curr
          )
          const index = dashboards.value.indexOf(oldest)
          if (index > -1) {
            dashboards.value.splice(index, 1)
            // Try saving again without the oldest dashboard
            try {
              const data = {
                dashboards: dashboards.value,
                activeDashboardId: activeDashboardId.value,
              }
              localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
              storageError.value = 
                'Storage quota exceeded. Removed oldest dashboard to free space.'
            } catch (retryError) {
              // Still failed - give up
              console.error('[Dashboard] Failed to save even after cleanup:', retryError)
            }
          }
        }
        break
        
      case 'security_error':
        storageError.value = 
          'Browser storage is disabled or blocked. ' +
          'Check your browser privacy settings or disable private browsing mode.'
        break
        
      default:
        storageError.value = 
          `Failed to ${operation} dashboard: ${error.message || 'Unknown error'}`
        break
    }
  }
  
  /**
   * Load dashboards from localStorage
   * Grug say: Try to load. If fails, start fresh.
   */
  function loadFromStorage() {
    try {
      // Clear any previous storage errors
      storageError.value = null
      
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        dashboards.value = parsed.dashboards || []
        activeDashboardId.value = parsed.activeDashboardId || null
        
        console.log(`[Dashboard] Loaded ${dashboards.value.length} dashboards from storage`)
      } else {
        // First time - create default dashboard
        const defaultDash = createDefaultDashboard('My Dashboard')
        dashboards.value = [defaultDash]
        activeDashboardId.value = defaultDash.id
        saveToStorage()
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load dashboards from storage:', err)
      handleStorageError(err, 'load')
      
      // On error, start fresh but don't overwrite potentially valid data
      const defaultDash = createDefaultDashboard('My Dashboard')
      dashboards.value = [defaultDash]
      activeDashboardId.value = defaultDash.id
      
      // Don't try to save if localStorage is broken
      if (detectStorageErrorType(err) !== 'security_error') {
        saveToStorage()
      }
    }
  }
  
  /**
   * Save dashboards to localStorage
   * Grug say: Try to save. If fails, tell user what happened.
   */
  function saveToStorage() {
    try {
      // Clear any previous storage errors on successful save
      storageError.value = null
      
      const data = {
        dashboards: dashboards.value,
        activeDashboardId: activeDashboardId.value,
      }
      
      const json = JSON.stringify(data)
      
      // Check size before attempting to save
      const sizeKB = new Blob([json]).size / 1024
      if (sizeKB > 5000) { // 5MB warning threshold
        console.warn(`[Dashboard] Large save size: ${sizeKB.toFixed(1)}KB`)
      }
      
      localStorage.setItem(STORAGE_KEY, json)
      console.log(`[Dashboard] Saved dashboards to storage (${sizeKB.toFixed(1)}KB)`)
      
    } catch (err) {
      handleStorageError(err, 'save')
      
      // Don't throw - allow app to continue even if save failed
      // User will see the error message in storageError.value
    }
  }
  
  /**
   * Get estimated storage size
   * Grug say: Know how much space we're using
   */
  function getStorageSize(): { sizeKB: number; sizePercent: number } {
    try {
      const data = {
        dashboards: dashboards.value,
        activeDashboardId: activeDashboardId.value,
      }
      const json = JSON.stringify(data)
      const sizeKB = new Blob([json]).size / 1024
      
      // Estimate available quota (usually 5-10MB, we'll use 5MB as baseline)
      const estimatedQuotaKB = 5 * 1024
      const sizePercent = (sizeKB / estimatedQuotaKB) * 100
      
      return { sizeKB, sizePercent }
    } catch (err) {
      console.error('[Dashboard] Failed to calculate storage size:', err)
      return { sizeKB: 0, sizePercent: 0 }
    }
  }
  
  /**
   * Clear storage error
   * Grug say: User saw message, can dismiss it
   */
  function clearStorageError() {
    storageError.value = null
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
      console.error('[Dashboard] No active dashboard')
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
      console.error('[Dashboard] Failed to import dashboard:', err)
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
    storageError,
    
    // Persistence
    loadFromStorage,
    saveToStorage,
    getStorageSize,
    clearStorageError,
    
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
