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
 * Dashboard Export File Format
 * Grug say: Multiple dashboards in one file
 */
interface DashboardExportFile {
  version: string
  exportDate: number
  appVersion: string
  dashboards: Dashboard[]
}

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
 * NEW: Now with multi-dashboard support!
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
  
  // Maximum dashboards allowed
  const MAX_DASHBOARDS = 25
  
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
  
  /**
   * Check if at dashboard limit
   */
  const isAtLimit = computed(() => {
    return dashboards.value.length >= MAX_DASHBOARDS
  })
  
  /**
   * Check if approaching limit (90% full)
   */
  const isApproachingLimit = computed(() => {
    return dashboards.value.length >= Math.floor(MAX_DASHBOARDS * 0.8)
  })
  
  /**
   * Dashboard count
   */
  const dashboardCount = computed(() => dashboards.value.length)
  
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
   * 
   * UPDATED: Now prompts user before deleting dashboards
   */
  function handleStorageError(error: any, operation: 'save' | 'load'): void {
    const errorType = detectStorageErrorType(error)
    
    console.error(`[Dashboard] Storage ${operation} error:`, error)
    
    switch (errorType) {
      case 'quota_exceeded':
        storageError.value = 
          'Storage quota exceeded. Dashboard may not be saved. ' +
          'Please delete old dashboards or export them to free space.'
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
   * NEW: Now checks dashboard limit
   */
  function createDashboard(name: string): Dashboard | null {
    if (isAtLimit.value) {
      storageError.value = `Cannot create dashboard: Limit of ${MAX_DASHBOARDS} reached. Please delete old dashboards first.`
      return null
    }
    
    const dashboard = createDefaultDashboard(name)
    dashboards.value.push(dashboard)
    activeDashboardId.value = dashboard.id
    saveToStorage()
    return dashboard
  }
  
  /**
   * Delete dashboard
   * NEW: Prevents deleting last dashboard
   */
  function deleteDashboard(id: string): boolean {
    const index = dashboards.value.findIndex(d => d.id === id)
    if (index === -1) return false
    
    // Don't allow deleting the last dashboard
    if (dashboards.value.length === 1) {
      storageError.value = 'Cannot delete the last dashboard'
      return false
    }
    
    dashboards.value.splice(index, 1)
    
    // If deleted active dashboard, switch to first available
    if (activeDashboardId.value === id) {
      activeDashboardId.value = dashboards.value.length > 0 ? dashboards.value[0].id : null
    }
    
    saveToStorage()
    return true
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
   * Rename dashboard
   * NEW: Dedicated rename method
   */
  function renameDashboard(id: string, newName: string): boolean {
    if (!newName.trim()) {
      return false
    }
    
    const dashboard = dashboards.value.find(d => d.id === id)
    if (!dashboard) return false
    
    dashboard.name = newName.trim()
    dashboard.modified = Date.now()
    saveToStorage()
    return true
  }
  
  /**
   * Duplicate dashboard
   * NEW: Clone entire dashboard with new ID
   */
  function duplicateDashboard(id: string): Dashboard | null {
    if (isAtLimit.value) {
      storageError.value = `Cannot duplicate dashboard: Limit of ${MAX_DASHBOARDS} reached.`
      return null
    }
    
    const original = dashboards.value.find(d => d.id === id)
    if (!original) return null
    
    // Deep clone the dashboard
    const clone = JSON.parse(JSON.stringify(original)) as Dashboard
    
    // Generate new IDs
    const now = Date.now()
    clone.id = `dashboard_${now}_${Math.random().toString(36).substr(2, 9)}`
    clone.name = `${original.name} (Copy)`
    clone.created = now
    clone.modified = now
    
    // Generate new widget IDs to avoid conflicts
    clone.widgets = clone.widgets.map(w => ({
      ...w,
      id: `widget_${now}_${Math.random().toString(36).substr(2, 9)}`
    }))
    
    dashboards.value.push(clone)
    saveToStorage()
    
    return clone
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
   * Export single dashboard as JSON
   */
  function exportDashboard(id: string): string | null {
    const dashboard = dashboards.value.find(d => d.id === id)
    if (!dashboard) return null
    
    return JSON.stringify(dashboard, null, 2)
  }
  
  /**
   * Export multiple dashboards as single file
   * NEW: Bulk export functionality
   */
  function exportDashboards(ids: string[]): string {
    const selectedDashboards = ids
      .map(id => dashboards.value.find(d => d.id === id))
      .filter(Boolean) as Dashboard[]
    
    const exportData: DashboardExportFile = {
      version: '1.0',
      exportDate: Date.now(),
      appVersion: '0.1.0',
      dashboards: selectedDashboards
    }
    
    return JSON.stringify(exportData, null, 2)
  }
  
  /**
   * Export all dashboards
   * NEW: Convenience method
   */
  function exportAllDashboards(): string {
    const ids = dashboards.value.map(d => d.id)
    return exportDashboards(ids)
  }
  
  /**
   * Import dashboard from JSON (single dashboard)
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
  
  /**
   * Import multiple dashboards from file
   * NEW: Bulk import with merge strategy
   * 
   * @param json - JSON string to import
   * @param strategy - 'merge' adds to existing, 'replace' clears first
   * @returns Results object with success/error counts
   */
  function importDashboards(
    json: string, 
    strategy: 'merge' | 'replace' = 'merge'
  ): { success: number; skipped: number; errors: string[] } {
    const results = {
      success: 0,
      skipped: 0,
      errors: [] as string[]
    }
    
    try {
      const data = JSON.parse(json) as DashboardExportFile
      
      // Validate export file structure
      if (!data.version || !Array.isArray(data.dashboards)) {
        throw new Error('Invalid export file format')
      }
      
      // Check if import would exceed limit
      const finalCount = strategy === 'replace' 
        ? data.dashboards.length 
        : dashboards.value.length + data.dashboards.length
      
      if (finalCount > MAX_DASHBOARDS) {
        results.errors.push(
          `Import would exceed dashboard limit (${MAX_DASHBOARDS}). ` +
          `Can only import ${MAX_DASHBOARDS - dashboards.value.length} more dashboards.`
        )
        return results
      }
      
      // Replace strategy: clear existing dashboards
      if (strategy === 'replace') {
        dashboards.value = []
        activeDashboardId.value = null
      }
      
      // Import each dashboard
      for (const dashboard of data.dashboards) {
        try {
          // Validate dashboard structure
          if (!dashboard.name || !Array.isArray(dashboard.widgets)) {
            results.errors.push(`Skipped invalid dashboard: ${dashboard.name || 'unnamed'}`)
            results.skipped++
            continue
          }
          
          // Check for name conflicts
          const existingNames = dashboards.value.map(d => d.name)
          let finalName = dashboard.name
          let counter = 2
          
          while (existingNames.includes(finalName)) {
            finalName = `${dashboard.name} (${counter})`
            counter++
          }
          
          // Generate new IDs
          const now = Date.now() + results.success // Ensure unique timestamps
          const newDashboard: Dashboard = {
            ...dashboard,
            id: `dashboard_${now}_${Math.random().toString(36).substr(2, 9)}`,
            name: finalName,
            modified: now,
            // Regenerate widget IDs
            widgets: dashboard.widgets.map(w => ({
              ...w,
              id: `widget_${now}_${Math.random().toString(36).substr(2, 9)}`
            }))
          }
          
          dashboards.value.push(newDashboard)
          results.success++
          
          // Set as active if first dashboard
          if (dashboards.value.length === 1) {
            activeDashboardId.value = newDashboard.id
          }
          
        } catch (err: any) {
          results.errors.push(`Failed to import "${dashboard.name}": ${err.message}`)
          results.skipped++
        }
      }
      
      saveToStorage()
      
    } catch (err: any) {
      results.errors.push(`Failed to parse import file: ${err.message}`)
    }
    
    return results
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
    dashboardCount,
    isAtLimit,
    isApproachingLimit,
    MAX_DASHBOARDS,
    
    // Persistence
    loadFromStorage,
    saveToStorage,
    getStorageSize,
    clearStorageError,
    
    // Dashboard CRUD
    createDashboard,
    deleteDashboard,
    updateDashboard,
    renameDashboard,
    duplicateDashboard,
    setActiveDashboard,
    
    // Widget CRUD
    addWidget,
    updateWidget,
    removeWidget,
    getWidget,
    updateWidgetLayout,
    
    // Import/Export
    exportDashboard,
    exportDashboards,
    exportAllDashboards,
    importDashboard,
    importDashboards,
  }
})
