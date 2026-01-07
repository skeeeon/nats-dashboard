// src/stores/dashboard.ts
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useNatsStore } from './nats'
import { Kvm, type KV } from '@nats-io/kv'
import { decodeBytes, encodeString } from '@/utils/encoding'
import type { Dashboard, WidgetConfig, StorageType } from '@/types/dashboard'
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
  const natsStore = useNatsStore()

  // ============================================================================
  // STATE
  // ============================================================================
  
  // Local Dashboards (Full objects loaded from localStorage)
  const localDashboards = ref<Dashboard[]>([])
  
  // Remote Keys (List of keys available in KV bucket)
  const remoteKeys = ref<string[]>([])
  
  // Active Dashboard (The one currently displayed)
  const activeDashboard = ref<Dashboard | null>(null)
  
  // Settings
  const kvBucketName = ref('dashboards')
  const enableSharedDashboards = ref(true)
  const startupDashboard = ref<{ id: string, storage: StorageType } | null>(null)
  
  // UI State
  const storageError = ref<string | null>(null)
  const isLocked = ref(false)
  const isDirty = ref(false) // Has unsaved changes?
  const remoteChanged = ref(false) // Has remote changed since load?
  
  const MAX_DASHBOARDS = 25
  const STORAGE_KEY = 'nats_dashboards'
  const SETTINGS_KEY = 'nats_dashboard_settings'

  // KV Watcher reference
  let activeWatcher: any = null

  // ============================================================================
  // COMPUTED
  // ============================================================================
  
  const activeDashboardId = computed(() => activeDashboard.value?.id || null)
  
  const activeWidgets = computed<WidgetConfig[]>(() => {
    return activeDashboard.value?.widgets || []
  })
  
  // Combined count for limits (mostly relevant for local)
  const isAtLimit = computed(() => {
    return localDashboards.value.length >= MAX_DASHBOARDS
  })
  
  const isApproachingLimit = computed(() => {
    return localDashboards.value.length >= Math.floor(MAX_DASHBOARDS * 0.8)
  })
  
  const dashboardCount = computed(() => localDashboards.value.length)

  // ============================================================================
  // HELPERS
  // ============================================================================

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
        storageError.value = 'Storage quota exceeded. Please delete old local dashboards.'
        break
      case 'security_error':
        storageError.value = 'Browser storage is disabled or blocked.'
        break
      default:
        storageError.value = `Failed to ${operation} dashboard: ${error.message}`
        break
    }
  }

  function clearStorageError() {
    storageError.value = null
  }

  // ============================================================================
  // LOCAL STORAGE PERSISTENCE
  // ============================================================================
  
  function loadFromStorage() {
    try {
      storageError.value = null
      
      // Load settings
      const storedSettings = localStorage.getItem(SETTINGS_KEY)
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings)
        kvBucketName.value = parsed.kvBucketName || 'dashboards'
        enableSharedDashboards.value = parsed.enableSharedDashboards ?? true
        startupDashboard.value = parsed.startupDashboard || null
      }

      // Load dashboards
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        localDashboards.value = parsed.dashboards || []
        isLocked.value = parsed.isLocked || false
        
        // Determine which dashboard to load
        let dashboardToLoad: Dashboard | undefined

        // 1. Try Startup Dashboard (if local)
        if (startupDashboard.value?.storage === 'local') {
          dashboardToLoad = localDashboards.value.find(d => d.id === startupDashboard.value?.id)
        }

        // 2. Fallback to last active session
        if (!dashboardToLoad && parsed.activeDashboardId) {
           dashboardToLoad = localDashboards.value.find(d => d.id === parsed.activeDashboardId)
        }

        if (dashboardToLoad) {
          setActiveDashboard(dashboardToLoad)
        }
        
        console.log(`[Dashboard] Loaded ${localDashboards.value.length} local dashboards`)
      } else {
        // First run
        const defaultDash = createDefaultDashboard('My Dashboard')
        localDashboards.value = [defaultDash]
        setActiveDashboard(defaultDash)
        saveToStorage()
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load:', err)
      handleStorageError(err, 'load')
      // Fallback
      const defaultDash = createDefaultDashboard('My Dashboard')
      localDashboards.value = [defaultDash]
      setActiveDashboard(defaultDash)
    }
  }
  
  function saveToStorage() {
    try {
      storageError.value = null
      
      // Save settings
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        kvBucketName: kvBucketName.value,
        enableSharedDashboards: enableSharedDashboards.value,
        startupDashboard: startupDashboard.value
      }))

      // Save dashboards
      const data = {
        dashboards: localDashboards.value,
        activeDashboardId: activeDashboard.value?.storage === 'local' ? activeDashboard.value.id : null,
        isLocked: isLocked.value,
      }
      const json = JSON.stringify(data)
      localStorage.setItem(STORAGE_KEY, json)
    } catch (err) {
      handleStorageError(err, 'save')
    }
  }

  function getStorageSize(): { sizeKB: number; sizePercent: number } {
    try {
      const data = { 
        dashboards: localDashboards.value, 
        activeDashboardId: activeDashboardId.value,
        isLocked: isLocked.value
      }
      const json = JSON.stringify(data)
      const sizeKB = new Blob([json]).size / 1024
      const estimatedQuotaKB = 5 * 1024
      return { sizeKB, sizePercent: (sizeKB / estimatedQuotaKB) * 100 }
    } catch (err) {
      return { sizeKB: 0, sizePercent: 0 }
    }
  }

  function setStartupDashboard(id: string, storage: StorageType) {
    startupDashboard.value = { id, storage }
    saveToStorage()
  }

  function clearStartupDashboard() {
    startupDashboard.value = null
    saveToStorage()
  }

  // ============================================================================
  // REMOTE (KV) STORAGE
  // ============================================================================

  async function getKv(): Promise<KV> {
    if (!natsStore.nc || !natsStore.isConnected) throw new Error('Not connected to NATS')
    const kvm = new Kvm(natsStore.nc)
    return await kvm.open(kvBucketName.value)
  }

  async function refreshRemoteKeys() {
    if (!natsStore.isConnected || !enableSharedDashboards.value) return
    try {
      const kv = await getKv()
      const iter = await kv.keys()
      const keys: string[] = []
      for await (const key of iter) {
        keys.push(key)
      }
      remoteKeys.value = keys
    } catch (err: any) {
      if (err.message?.includes('stream not found') || err.message?.includes('no stream')) {
        remoteKeys.value = []
      } else {
        console.error('[Dashboard] Failed to list remote keys:', err)
        remoteKeys.value = []
      }
    }
  }

  async function loadRemoteDashboard(key: string) {
    if (!enableSharedDashboards.value) return
    try {
      const kv = await getKv()
      const entry = await kv.get(key)
      if (!entry) throw new Error('Dashboard not found')

      const json = decodeBytes(entry.value)
      const dashboard = JSON.parse(json) as Dashboard
      
      dashboard.storage = 'kv'
      dashboard.kvKey = key
      dashboard.kvRevision = entry.revision
      
      setActiveDashboard(dashboard)
      watchRemoteKey(key, entry.revision)
      
    } catch (err: any) {
      console.error('[Dashboard] Failed to load remote:', err)
      storageError.value = `Failed to load: ${err.message}`
    }
  }

  async function saveRemoteDashboard() {
    if (!activeDashboard.value || activeDashboard.value.storage !== 'kv' || !enableSharedDashboards.value) return
    
    try {
      const kv = await getKv()
      const key = activeDashboard.value.kvKey
      if (!key) throw new Error('No KV key defined')

      const toSave = { ...activeDashboard.value }
      delete toSave.storage
      delete toSave.kvKey
      delete toSave.kvRevision
      toSave.modified = Date.now()
      
      const data = encodeString(JSON.stringify(toSave))
      const opts = activeDashboard.value.kvRevision ? { previousSeq: activeDashboard.value.kvRevision } : undefined
      
      const newRevision = await kv.put(key, data, opts)
      
      activeDashboard.value.kvRevision = newRevision
      activeDashboard.value.modified = toSave.modified
      isDirty.value = false
      remoteChanged.value = false
      
      console.log(`[Dashboard] Saved remote dashboard ${key} rev ${newRevision}`)
      refreshRemoteKeys()
      
    } catch (err: any) {
      console.error('[Dashboard] Failed to save remote:', err)
      if (err.message?.includes('wrong last sequence')) {
        storageError.value = 'Conflict: Dashboard has been modified on server. Please reload.'
        remoteChanged.value = true
      } else {
        storageError.value = `Save failed: ${err.message}`
      }
    }
  }

  async function createRemoteDashboard(name: string, folder: string = '') {
    if (!enableSharedDashboards.value) return
    const dashboard = createDefaultDashboard(name)
    dashboard.storage = 'kv'
    
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const id = Math.random().toString(36).substr(2, 6)
    let key = `${slug}-${id}`
    if (folder) {
      key = `${folder}.${key}`
    }
    
    dashboard.kvKey = key
    
    setActiveDashboard(dashboard)
    isDirty.value = true
    await saveRemoteDashboard()
  }

  async function deleteRemoteDashboard(key: string) {
    if (!enableSharedDashboards.value) return
    try {
      const kv = await getKv()
      await kv.delete(key)
      await refreshRemoteKeys()
      
      if (activeDashboard.value?.kvKey === key) {
        activeDashboard.value = null
      }
    } catch (err: any) {
      console.error('[Dashboard] Failed to delete remote:', err)
      storageError.value = err.message
    }
  }

  function watchRemoteKey(key: string, currentRevision: number) {
    if (activeWatcher) {
      try { activeWatcher.stop() } catch {}
      activeWatcher = null
    }
    
    remoteChanged.value = false
    
    if (!natsStore.isConnected || !enableSharedDashboards.value) return
    
    ;(async () => {
      try {
        const kv = await getKv()
        const iter = await kv.watch({ key })
        activeWatcher = iter
        
        for await (const e of iter) {
          if (e.key === key && e.revision > currentRevision) {
            console.log(`[Dashboard] Remote change detected! Rev ${e.revision} > ${currentRevision}`)
            remoteChanged.value = true
          }
        }
      } catch (err) { }
    })()
  }

  // ============================================================================
  // DASHBOARD ACTIONS
  // ============================================================================
  
  function toggleLock() {
    isLocked.value = !isLocked.value
    if (activeDashboard.value?.storage === 'local') {
      saveToStorage()
    }
  }

  function setActiveDashboard(dashboard: Dashboard) {
    if (activeWatcher) {
      try { activeWatcher.stop() } catch {}
      activeWatcher = null
    }
    
    activeDashboard.value = dashboard
    isDirty.value = false
    remoteChanged.value = false
    
    if (dashboard.storage === 'local') {
      saveToStorage()
    }
  }

  // ============================================================================
  // CRUD (Unified)
  // ============================================================================
  
  function createDashboard(name: string): Dashboard | null {
    if (isAtLimit.value) {
      storageError.value = `Limit of ${MAX_DASHBOARDS} dashboards reached.`
      return null
    }
    const dashboard = createDefaultDashboard(name)
    localDashboards.value.push(dashboard)
    setActiveDashboard(dashboard)
    saveToStorage()
    return dashboard
  }
  
  function deleteDashboard(id: string): boolean {
    const index = localDashboards.value.findIndex(d => d.id === id)
    if (index === -1) return false
    
    if (localDashboards.value.length === 1) {
      storageError.value = 'Cannot delete the last local dashboard'
      return false
    }
    
    localDashboards.value.splice(index, 1)
    if (activeDashboardId.value === id) {
      const next = localDashboards.value[0]
      setActiveDashboard(next)
    }
    
    // Clear startup if deleted
    if (startupDashboard.value?.id === id && startupDashboard.value?.storage === 'local') {
      clearStartupDashboard()
    }
    
    saveToStorage()
    return true
  }
  
  function updateDashboard(id: string, updates: Partial<Dashboard>) {
    if (!activeDashboard.value || activeDashboard.value.id !== id) return
    
    Object.assign(activeDashboard.value, updates)
    activeDashboard.value.modified = Date.now()
    
    if (activeDashboard.value.storage === 'local') {
      saveToStorage()
    } else {
      isDirty.value = true
    }
  }
  
  function renameDashboard(id: string, newName: string): boolean {
    if (!newName.trim()) return false
    
    if (activeDashboard.value && activeDashboard.value.id === id) {
      activeDashboard.value.name = newName.trim()
      activeDashboard.value.modified = Date.now()
      
      if (activeDashboard.value.storage === 'local') {
        saveToStorage()
      } else {
        isDirty.value = true
      }
      return true
    }
    
    const local = localDashboards.value.find(d => d.id === id)
    if (local) {
      local.name = newName.trim()
      local.modified = Date.now()
      saveToStorage()
      return true
    }
    
    return false
  }
  
  function duplicateDashboard(id: string): Dashboard | null {
    const source = activeDashboard.value?.id === id 
      ? activeDashboard.value 
      : localDashboards.value.find(d => d.id === id)
      
    if (!source) return null
    
    if (isAtLimit.value) {
      storageError.value = `Limit of ${MAX_DASHBOARDS} dashboards reached.`
      return null
    }
    
    const clone = JSON.parse(JSON.stringify(source)) as Dashboard
    const now = Date.now()
    clone.id = `dashboard_${now}_${Math.random().toString(36).substr(2, 9)}`
    clone.name = `${source.name} (Copy)`
    clone.created = now
    clone.modified = now
    clone.storage = 'local'
    delete clone.kvKey
    delete clone.kvRevision
    
    clone.widgets = clone.widgets.map(w => ({
      ...w,
      id: `widget_${now}_${Math.random().toString(36).substr(2, 9)}`
    }))
    
    localDashboards.value.push(clone)
    saveToStorage()
    return clone
  }
  
  // ============================================================================
  // WIDGET CRUD
  // ============================================================================
  
  function addWidget(widget: WidgetConfig) {
    if (!activeDashboard.value) return
    activeDashboard.value.widgets.push(widget)
    activeDashboard.value.modified = Date.now()
    
    if (activeDashboard.value.storage === 'local') {
      saveToStorage()
    } else {
      isDirty.value = true
    }
  }
  
  function updateWidget(widgetId: string, updates: Partial<WidgetConfig>) {
    if (!activeDashboard.value) return
    const widget = activeDashboard.value.widgets.find(w => w.id === widgetId)
    if (!widget) return
    Object.assign(widget, updates)
    activeDashboard.value.modified = Date.now()
    
    if (activeDashboard.value.storage === 'local') {
      saveToStorage()
    } else {
      isDirty.value = true
    }
  }
  
  function removeWidget(widgetId: string) {
    if (!activeDashboard.value) return
    const index = activeDashboard.value.widgets.findIndex(w => w.id === widgetId)
    if (index === -1) return
    activeDashboard.value.widgets.splice(index, 1)
    activeDashboard.value.modified = Date.now()
    
    if (activeDashboard.value.storage === 'local') {
      saveToStorage()
    } else {
      isDirty.value = true
    }
  }
  
  function getWidget(widgetId: string): WidgetConfig | null {
    if (!activeDashboard.value) return null
    return activeDashboard.value.widgets.find(w => w.id === widgetId) || null
  }
  
  function updateWidgetLayout(widgetId: string, layout: { x: number; y: number; w: number; h: number }) {
    if (!activeDashboard.value) return
    const widget = activeDashboard.value.widgets.find(w => w.id === widgetId)
    if (!widget) return
    
    widget.x = layout.x
    widget.y = layout.y
    widget.w = layout.w
    widget.h = layout.h
    
    activeDashboard.value.modified = Date.now()
    
    if (activeDashboard.value.storage === 'local') {
      saveToStorage()
    } else {
      isDirty.value = true
    }
  }

  function batchUpdateLayout(updates: Array<{ id: string; x: number; y: number; w: number; h: number }>) {
    if (!activeDashboard.value) return

    let hasChanges = false

    updates.forEach(update => {
      const widget = activeDashboard.value!.widgets.find(w => w.id === update.id)
      if (widget) {
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
      if (activeDashboard.value.storage === 'local') {
        saveToStorage()
      } else {
        isDirty.value = true
      }
    }
  }
  
  // ============================================================================
  // IMPORT / EXPORT
  // ============================================================================
  
  function exportDashboard(id: string): string | null {
    const dashboard = activeDashboard.value?.id === id 
      ? activeDashboard.value 
      : localDashboards.value.find(d => d.id === id)
      
    if (!dashboard) return null
    
    const exportObj = { ...dashboard }
    delete exportObj.storage
    delete exportObj.kvKey
    delete exportObj.kvRevision
    
    return JSON.stringify(exportObj, null, 2)
  }
  
  function exportDashboards(ids: string[]): string {
    const selectedDashboards = ids
      .map(id => localDashboards.value.find(d => d.id === id))
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
    const ids = localDashboards.value.map(d => d.id)
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
      dashboard.storage = 'local'
      
      localDashboards.value.push(dashboard)
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
      
      const finalCount = strategy === 'replace' ? data.dashboards.length : localDashboards.value.length + data.dashboards.length
      if (finalCount > MAX_DASHBOARDS) {
        results.errors.push(`Import would exceed limit (${MAX_DASHBOARDS})`)
        return results
      }
      
      if (strategy === 'replace') {
        localDashboards.value = []
        activeDashboard.value = null
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
            storage: 'local',
            widgets: dashboard.widgets.map(w => ({
              ...w,
              id: `widget_${now}_${Math.random().toString(36).substr(2, 9)}`
            }))
          }
          localDashboards.value.push(newDashboard)
          results.success++
          if (localDashboards.value.length === 1) setActiveDashboard(newDashboard)
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
  
  // Watch for connection to refresh remote list and load startup dashboard
  watch(() => natsStore.isConnected, (connected) => {
    if (connected) {
      if (enableSharedDashboards.value) {
        refreshRemoteKeys()
      }
      
      // Load remote startup dashboard if configured
      if (startupDashboard.value?.storage === 'kv' && enableSharedDashboards.value) {
        loadRemoteDashboard(startupDashboard.value.id)
      }
    }
  })
  
  return {
    // State
    localDashboards,
    remoteKeys,
    activeDashboardId,
    activeDashboard,
    activeWidgets,
    storageError,
    dashboardCount,
    isAtLimit,
    isApproachingLimit,
    isLocked,
    isDirty,
    remoteChanged,
    kvBucketName,
    enableSharedDashboards,
    startupDashboard,
    MAX_DASHBOARDS,
    
    // Actions
    loadFromStorage,
    saveToStorage,
    getStorageSize,
    clearStorageError,
    toggleLock,
    setActiveDashboard,
    setStartupDashboard,
    clearStartupDashboard,
    
    // Local CRUD
    createDashboard,
    deleteDashboard,
    
    // Remote CRUD
    refreshRemoteKeys,
    loadRemoteDashboard,
    saveRemoteDashboard,
    createRemoteDashboard,
    deleteRemoteDashboard,
    
    // Unified CRUD
    updateDashboard,
    renameDashboard,
    duplicateDashboard,
    addWidget,
    updateWidget,
    removeWidget,
    getWidget,
    updateWidgetLayout,
    batchUpdateLayout,
    
    // Import/Export
    exportDashboard,
    exportDashboards,
    exportAllDashboards,
    importDashboard,
    importDashboards,
  }
})
