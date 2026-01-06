// src/stores/dashboard.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Dashboard, WidgetConfig } from '@/types/dashboard'
import { createDefaultDashboard } from '@/types/dashboard'

/**
 * LocalStorage Error Types
 */
type StorageErrorType = 'quota_exceeded' | 'security_error' | 'unknown'

/**
 * Dashboard Export File Format
 */
interface DashboardExportFile {
  version: string
  exportDate: number
  appVersion: string
  dashboards: Dashboard[]
}

/**
 * Dashboard Store
 */
export const useDashboardStore = defineStore('dashboard', () => {
  // ============================================================================
  // STATE
  // ============================================================================
  
  const dashboards = ref<Dashboard[]>([])
  const activeDashboardId = ref<string | null>(null)
  const storageError = ref<string | null>(null)
  const MAX_DASHBOARDS = 25
  
  // ============================================================================
  // COMPUTED
  // ============================================================================
  
  const activeDashboard = computed<Dashboard | null>(() => {
    if (!activeDashboardId.value) return null
    return dashboards.value.find(d => d.id === activeDashboardId.value) || null
  })
  
  const activeWidgets = computed<WidgetConfig[]>(() => {
    return activeDashboard.value?.widgets || []
  })
  
  const isAtLimit = computed(() => {
    return dashboards.value.length >= MAX_DASHBOARDS
  })
  
  const isApproachingLimit = computed(() => {
    return dashboards.value.length >= Math.floor(MAX_DASHBOARDS * 0.8)
  })
  
  const dashboardCount = computed(() => dashboards.value.length)
  
  // ============================================================================
  // PERSISTENCE (localStorage)
  // ============================================================================
  
  const STORAGE_KEY = 'nats_dashboards'
  
  function detectStorageErrorType(error: any): StorageErrorType {
    if (!error) return 'unknown'
    const errorString = error.toString().toLowerCase()
    const name = error.name?.toLowerCase() || ''
    
    if (name.includes('quotaexceedederror') || errorString.includes('quota')) {
      return 'quota_exceeded'
    }
    if (name.includes('securityerror') || errorString.includes('security')) {
      return 'security_error'
    }
    return 'unknown'
  }
  
  function handleStorageError(error: any, operation: 'save' | 'load'): void {
    const errorType = detectStorageErrorType(error)
    console.error(`[Dashboard] Storage ${operation} error:`, error)
    
    switch (errorType) {
      case 'quota_exceeded':
        storageError.value = 'Storage quota exceeded. Please delete old dashboards.'
        break
      case 'security_error':
        storageError.value = 'Browser storage is disabled or blocked.'
        break
      default:
        storageError.value = `Failed to ${operation} dashboard: ${error.message}`
        break
    }
  }
  
  function loadFromStorage() {
    try {
      storageError.value = null
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        dashboards.value = parsed.dashboards || []
        activeDashboardId.value = parsed.activeDashboardId || null
        console.log(`[Dashboard] Loaded ${dashboards.value.length} dashboards from storage`)
      } else {
        const defaultDash = createDefaultDashboard('My Dashboard')
        dashboards.value = [defaultDash]
        activeDashboardId.value = defaultDash.id
        saveToStorage()
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load:', err)
      handleStorageError(err, 'load')
      const defaultDash = createDefaultDashboard('My Dashboard')
      dashboards.value = [defaultDash]
      activeDashboardId.value = defaultDash.id
    }
  }
  
  function saveToStorage() {
    try {
      storageError.value = null
      const data = {
        dashboards: dashboards.value,
        activeDashboardId: activeDashboardId.value,
      }
      const json = JSON.stringify(data)
      const sizeKB = new Blob([json]).size / 1024
      
      localStorage.setItem(STORAGE_KEY, json)
      console.log(`[Dashboard] Saved dashboards to storage (${sizeKB.toFixed(1)}KB)`)
    } catch (err) {
      handleStorageError(err, 'save')
    }
  }
  
  function getStorageSize(): { sizeKB: number; sizePercent: number } {
    try {
      const data = { dashboards: dashboards.value, activeDashboardId: activeDashboardId.value }
      const json = JSON.stringify(data)
      const sizeKB = new Blob([json]).size / 1024
      const estimatedQuotaKB = 5 * 1024
      return { sizeKB, sizePercent: (sizeKB / estimatedQuotaKB) * 100 }
    } catch (err) {
      return { sizeKB: 0, sizePercent: 0 }
    }
  }
  
  function clearStorageError() {
    storageError.value = null
  }
  
  // ============================================================================
  // DASHBOARD CRUD
  // ============================================================================
  
  function createDashboard(name: string): Dashboard | null {
    if (isAtLimit.value) {
      storageError.value = `Limit of ${MAX_DASHBOARDS} dashboards reached.`
      return null
    }
    const dashboard = createDefaultDashboard(name)
    dashboards.value.push(dashboard)
    activeDashboardId.value = dashboard.id
    saveToStorage()
    return dashboard
  }
  
  function deleteDashboard(id: string): boolean {
    const index = dashboards.value.findIndex(d => d.id === id)
    if (index === -1) return false
    if (dashboards.value.length === 1) {
      storageError.value = 'Cannot delete the last dashboard'
      return false
    }
    dashboards.value.splice(index, 1)
    if (activeDashboardId.value === id) {
      activeDashboardId.value = dashboards.value.length > 0 ? dashboards.value[0].id : null
    }
    saveToStorage()
    return true
  }
  
  function updateDashboard(id: string, updates: Partial<Dashboard>) {
    const dashboard = dashboards.value.find(d => d.id === id)
    if (!dashboard) return
    Object.assign(dashboard, updates)
    dashboard.modified = Date.now()
    saveToStorage()
  }
  
  function renameDashboard(id: string, newName: string): boolean {
    if (!newName.trim()) return false
    const dashboard = dashboards.value.find(d => d.id === id)
    if (!dashboard) return false
    dashboard.name = newName.trim()
    dashboard.modified = Date.now()
    saveToStorage()
    return true
  }
  
  function duplicateDashboard(id: string): Dashboard | null {
    if (isAtLimit.value) {
      storageError.value = `Limit of ${MAX_DASHBOARDS} dashboards reached.`
      return null
    }
    const original = dashboards.value.find(d => d.id === id)
    if (!original) return null
    
    const clone = JSON.parse(JSON.stringify(original)) as Dashboard
    const now = Date.now()
    clone.id = `dashboard_${now}_${Math.random().toString(36).substr(2, 9)}`
    clone.name = `${original.name} (Copy)`
    clone.created = now
    clone.modified = now
    clone.widgets = clone.widgets.map(w => ({
      ...w,
      id: `widget_${now}_${Math.random().toString(36).substr(2, 9)}`
    }))
    
    dashboards.value.push(clone)
    saveToStorage()
    return clone
  }
  
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
  
  function addWidget(widget: WidgetConfig) {
    if (!activeDashboard.value) return
    activeDashboard.value.widgets.push(widget)
    activeDashboard.value.modified = Date.now()
    saveToStorage()
  }
  
  function updateWidget(widgetId: string, updates: Partial<WidgetConfig>) {
    if (!activeDashboard.value) return
    const widget = activeDashboard.value.widgets.find(w => w.id === widgetId)
    if (!widget) return
    Object.assign(widget, updates)
    activeDashboard.value.modified = Date.now()
    saveToStorage()
  }
  
  function removeWidget(widgetId: string) {
    if (!activeDashboard.value) return
    const index = activeDashboard.value.widgets.findIndex(w => w.id === widgetId)
    if (index === -1) return
    activeDashboard.value.widgets.splice(index, 1)
    activeDashboard.value.modified = Date.now()
    saveToStorage()
  }
  
  function getWidget(widgetId: string): WidgetConfig | null {
    if (!activeDashboard.value) return null
    return activeDashboard.value.widgets.find(w => w.id === widgetId) || null
  }
  
  /**
   * Update widget position/size (Single)
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

  /**
   * Batch Update Layout (Optimized)
   * Updates multiple widgets in memory and saves to storage ONCE.
   */
  function batchUpdateLayout(updates: Array<{ id: string; x: number; y: number; w: number; h: number }>) {
    if (!activeDashboard.value) return

    let hasChanges = false

    updates.forEach(update => {
      const widget = activeDashboard.value!.widgets.find(w => w.id === update.id)
      if (widget) {
        // Only mark changed if values actually differ to avoid unnecessary saves
        if (widget.x !== update.x || widget.y !== update.y || widget.w !== update.w || widget.h !== update.h) {
          widget.x = update.x
          widget.y = update.y
          widget.w = update.w
          widget.h = update.h
          hasChanges = true
        }
      }
    })

    if (hasChanges) {
      activeDashboard.value.modified = Date.now()
      saveToStorage()
    }
  }
  
  // ============================================================================
  // IMPORT / EXPORT
  // ============================================================================
  
  function exportDashboard(id: string): string | null {
    const dashboard = dashboards.value.find(d => d.id === id)
    if (!dashboard) return null
    return JSON.stringify(dashboard, null, 2)
  }
  
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
  
  function exportAllDashboards(): string {
    const ids = dashboards.value.map(d => d.id)
    return exportDashboards(ids)
  }
  
  function importDashboard(json: string): Dashboard | null {
    try {
      const dashboard = JSON.parse(json) as Dashboard
      if (!dashboard.id || !dashboard.name || !Array.isArray(dashboard.widgets)) {
        throw new Error('Invalid dashboard format')
      }
      dashboard.id = `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      dashboard.modified = Date.now()
      dashboards.value.push(dashboard)
      saveToStorage()
      return dashboard
    } catch (err) {
      console.error('[Dashboard] Failed to import:', err)
      return null
    }
  }
  
  function importDashboards(json: string, strategy: 'merge' | 'replace' = 'merge') {
    const results = { success: 0, skipped: 0, errors: [] as string[] }
    try {
      const data = JSON.parse(json) as DashboardExportFile
      if (!data.version || !Array.isArray(data.dashboards)) throw new Error('Invalid export file')
      
      const finalCount = strategy === 'replace' ? data.dashboards.length : dashboards.value.length + data.dashboards.length
      if (finalCount > MAX_DASHBOARDS) {
        results.errors.push(`Import would exceed limit (${MAX_DASHBOARDS})`)
        return results
      }
      
      if (strategy === 'replace') {
        dashboards.value = []
        activeDashboardId.value = null
      }
      
      for (const dashboard of data.dashboards) {
        try {
          if (!dashboard.name || !Array.isArray(dashboard.widgets)) {
            results.skipped++
            continue
          }
          const now = Date.now() + results.success
          const newDashboard: Dashboard = {
            ...dashboard,
            id: `dashboard_${now}_${Math.random().toString(36).substr(2, 9)}`,
            modified: now,
            widgets: dashboard.widgets.map(w => ({
              ...w,
              id: `widget_${now}_${Math.random().toString(36).substr(2, 9)}`
            }))
          }
          dashboards.value.push(newDashboard)
          results.success++
          if (dashboards.value.length === 1) activeDashboardId.value = newDashboard.id
        } catch (err: any) {
          results.errors.push(`Failed to import "${dashboard.name}": ${err.message}`)
          results.skipped++
        }
      }
      saveToStorage()
    } catch (err: any) {
      results.errors.push(`Failed to parse file: ${err.message}`)
    }
    return results
  }
  
  return {
    dashboards,
    activeDashboardId,
    activeDashboard,
    activeWidgets,
    storageError,
    dashboardCount,
    isAtLimit,
    isApproachingLimit,
    MAX_DASHBOARDS,
    loadFromStorage,
    saveToStorage,
    getStorageSize,
    clearStorageError,
    createDashboard,
    deleteDashboard,
    updateDashboard,
    renameDashboard,
    duplicateDashboard,
    setActiveDashboard,
    addWidget,
    updateWidget,
    removeWidget,
    getWidget,
    updateWidgetLayout,
    batchUpdateLayout, // <--- Exported
    exportDashboard,
    exportDashboards,
    exportAllDashboards,
    importDashboard,
    importDashboards,
  }
})
