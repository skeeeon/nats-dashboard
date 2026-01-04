<template>
  <div class="sidebar-container" :class="{ 'is-collapsed': !isOpen, 'is-mobile': isMobile }">
    <!-- Backdrop for mobile -->
    <div 
      v-if="isMobile && isOpen"
      class="sidebar-backdrop"
      @click="closeSidebar"
    />
    
    <!-- Sidebar content -->
    <aside class="sidebar" :class="{ 'is-open': isOpen }">
      <!-- Header -->
      <div class="sidebar-header">
        <h2 class="sidebar-title">Dashboards</h2>
        <button 
          v-if="isMobile"
          class="close-btn"
          @click="closeSidebar"
          title="Close sidebar"
        >
          ✕
        </button>
      </div>
      
      <!-- Dashboard list -->
      <div class="sidebar-body">
        <div v-if="dashboards.length === 0" class="empty-state">
          <div class="empty-icon">📊</div>
          <div class="empty-text">No dashboards</div>
        </div>
        
        <div v-else class="dashboard-list">
          <DashboardListItem
            v-for="dashboard in dashboards"
            :key="dashboard.id"
            :dashboard="dashboard"
            :is-active="dashboard.id === activeDashboardId"
            @select="selectDashboard(dashboard.id)"
            @rename="startRename(dashboard.id)"
            @duplicate="duplicateDashboard(dashboard.id)"
            @export="exportDashboard(dashboard.id)"
            @delete="confirmDelete(dashboard.id)"
          />
        </div>
      </div>
      
      <!-- Footer with actions -->
      <div class="sidebar-footer">
        <!-- Storage indicator -->
        <div class="storage-indicator" :class="storageClass">
          <div class="storage-bar-bg">
            <div 
              class="storage-bar-fill"
              :style="{ width: storagePercent + '%' }"
            />
          </div>
          <div class="storage-text">
            {{ storageKB }} MB / 5 MB
          </div>
        </div>
        
        <!-- Dashboard count & limit -->
        <div v-if="isApproachingLimit" class="limit-warning">
          ⚠️ {{ dashboardCount }} / {{ MAX_DASHBOARDS }} dashboards
        </div>
        
        <!-- Action buttons -->
        <div class="action-buttons">
          <button 
            class="btn-action btn-new"
            :disabled="isAtLimit"
            @click="createNewDashboard"
            :title="isAtLimit ? `Dashboard limit reached (${MAX_DASHBOARDS})` : 'Create new dashboard'"
          >
            <span class="btn-icon">+</span>
            <span class="btn-text">New Dashboard</span>
          </button>
          
          <button 
            class="btn-action"
            @click="showImport = true"
            title="Import dashboards from file"
          >
            <span class="btn-icon">📥</span>
            <span class="btn-text">Import</span>
          </button>
          
          <button 
            class="btn-action"
            :disabled="dashboards.length === 0"
            @click="exportAllDashboards"
            title="Export all dashboards"
          >
            <span class="btn-icon">💾</span>
            <span class="btn-text">Export All</span>
          </button>
        </div>
      </div>
    </aside>
    
    <!-- Rename Modal -->
    <div v-if="showRename" class="modal-overlay" @click.self="showRename = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Rename Dashboard</h3>
          <button class="close-btn" @click="showRename = false">✕</button>
        </div>
        <div class="modal-body">
          <input 
            ref="renameInput"
            v-model="renameName"
            type="text"
            class="form-input"
            placeholder="Dashboard name"
            @keyup.enter="saveRename"
            @keyup.escape="showRename = false"
          />
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showRename = false">Cancel</button>
          <button class="btn-primary" @click="saveRename">Rename</button>
        </div>
      </div>
    </div>
    
    <!-- Import Modal -->
    <div v-if="showImport" class="modal-overlay" @click.self="showImport = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Import Dashboards</h3>
          <button class="close-btn" @click="showImport = false">✕</button>
        </div>
        <div class="modal-body">
          <input 
            type="file"
            accept=".json"
            @change="handleImportFile"
            class="file-input"
          />
          <div class="help-text">
            Select a JSON file exported from NATS Dashboard
          </div>
          
          <!-- Import results -->
          <div v-if="importResults" class="import-results">
            <div v-if="importResults.success > 0" class="result-success">
              ✓ Imported {{ importResults.success }} dashboard{{ importResults.success !== 1 ? 's' : '' }}
            </div>
            <div v-if="importResults.skipped > 0" class="result-warning">
              ⚠️ Skipped {{ importResults.skipped }} dashboard{{ importResults.skipped !== 1 ? 's' : '' }}
            </div>
            <div v-if="importResults.errors.length > 0" class="result-errors">
              <div class="error-title">Errors:</div>
              <div v-for="(error, i) in importResults.errors" :key="i" class="error-item">
                {{ error }}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-primary" @click="showImport = false">Close</button>
        </div>
      </div>
    </div>
    
    <!-- Confirm Delete Dialog -->
    <ConfirmDialog
      v-model="showConfirmDelete"
      :title="deleteConfirmTitle"
      :message="deleteConfirmMessage"
      details="This action cannot be undone."
      confirm-text="Delete"
      variant="danger"
      @confirm="handleDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import DashboardListItem from './DashboardListItem.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

/**
 * Dashboard Sidebar Component
 * 
 * Grug say: List of dashboards on left side.
 * Can create, rename, delete, import, export.
 * Remembers if open or closed.
 */

const dashboardStore = useDashboardStore()

// Sidebar state
const STORAGE_KEY = 'sidebar_open'
const isOpen = ref(true)
const isMobile = ref(false)

// Rename state
const showRename = ref(false)
const renameId = ref<string | null>(null)
const renameName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

// Import state
const showImport = ref(false)
const importResults = ref<{ success: number; skipped: number; errors: string[] } | null>(null)

// Delete confirmation state
const showConfirmDelete = ref(false)
const deleteId = ref<string | null>(null)

// Computed
const dashboards = computed(() => dashboardStore.dashboards)
const activeDashboardId = computed(() => dashboardStore.activeDashboardId)
const isAtLimit = computed(() => dashboardStore.isAtLimit)
const isApproachingLimit = computed(() => dashboardStore.isApproachingLimit)
const dashboardCount = computed(() => dashboardStore.dashboardCount)
const MAX_DASHBOARDS = dashboardStore.MAX_DASHBOARDS

/**
 * Storage usage
 */
const storageInfo = computed(() => dashboardStore.getStorageSize())
const storageKB = computed(() => (storageInfo.value.sizeKB / 1024).toFixed(2))
const storagePercent = computed(() => Math.min(storageInfo.value.sizePercent, 100))
const storageClass = computed(() => {
  const percent = storagePercent.value
  if (percent >= 90) return 'storage-critical'
  if (percent >= 70) return 'storage-warning'
  return 'storage-ok'
})

/**
 * Dashboard being deleted
 */
const deleteDashboardName = computed(() => {
  if (!deleteId.value) return ''
  const dashboard = dashboards.value.find(d => d.id === deleteId.value)
  return dashboard?.name || ''
})

const deleteDashboardWidgetCount = computed(() => {
  if (!deleteId.value) return 0
  const dashboard = dashboards.value.find(d => d.id === deleteId.value)
  return dashboard?.widgets.length || 0
})

/**
 * Delete confirmation dialog text
 * Grug say: Build strings in script, not in template. Easier to read.
 */
const deleteConfirmTitle = computed(() => {
  return `Delete "${deleteDashboardName.value}"?`
})

const deleteConfirmMessage = computed(() => {
  const count = deleteDashboardWidgetCount.value
  const plural = count !== 1 ? 's' : ''
  return `This will permanently delete ${count} widget${plural}.`
})

/**
 * Check if mobile
 */
function checkMobile() {
  isMobile.value = window.innerWidth < 768
  
  // On mobile, close sidebar by default
  if (isMobile.value && isOpen.value) {
    isOpen.value = false
  }
}

/**
 * Toggle sidebar open/closed
 * Exposed to parent component for hamburger menu
 */
function toggleSidebar() {
  isOpen.value = !isOpen.value
  localStorage.setItem(STORAGE_KEY, String(isOpen.value))
}

/**
 * Close sidebar (for mobile backdrop)
 */
function closeSidebar() {
  isOpen.value = false
  localStorage.setItem(STORAGE_KEY, String(isOpen.value))
}

/**
 * Expose methods to parent
 * Grug say: Parent need to call toggleSidebar, so we expose it
 */
defineExpose({
  toggleSidebar
})

/**
 * Select dashboard
 */
function selectDashboard(id: string) {
  dashboardStore.setActiveDashboard(id)
  
  // Close sidebar on mobile after selection
  if (isMobile.value) {
    closeSidebar()
  }
}

/**
 * Create new dashboard
 */
function createNewDashboard() {
  const name = prompt('Dashboard name:', 'New Dashboard')
  if (!name) return
  
  const dashboard = dashboardStore.createDashboard(name)
  if (dashboard) {
    console.log('[Sidebar] Created dashboard:', dashboard.name)
  }
}

/**
 * Start rename flow
 */
function startRename(id: string) {
  const dashboard = dashboards.value.find(d => d.id === id)
  if (!dashboard) return
  
  renameId.value = id
  renameName.value = dashboard.name
  showRename.value = true
  
  // Focus input after modal opens
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

/**
 * Save rename
 */
function saveRename() {
  if (!renameId.value || !renameName.value.trim()) {
    return
  }
  
  const success = dashboardStore.renameDashboard(renameId.value, renameName.value)
  if (success) {
    console.log('[Sidebar] Renamed dashboard to:', renameName.value)
  }
  
  showRename.value = false
  renameId.value = null
  renameName.value = ''
}

/**
 * Duplicate dashboard
 */
function duplicateDashboard(id: string) {
  const clone = dashboardStore.duplicateDashboard(id)
  if (clone) {
    console.log('[Sidebar] Duplicated dashboard:', clone.name)
  }
}

/**
 * Export single dashboard
 */
function exportDashboard(id: string) {
  const json = dashboardStore.exportDashboard(id)
  if (!json) return
  
  const dashboard = dashboards.value.find(d => d.id === id)
  if (!dashboard) return
  
  downloadJSON(json, `${dashboard.name}.json`)
}

/**
 * Export all dashboards
 */
function exportAllDashboards() {
  const json = dashboardStore.exportAllDashboards()
  const timestamp = new Date().toISOString().split('T')[0]
  downloadJSON(json, `nats-dashboards-${timestamp}.json`)
}

/**
 * Download JSON file
 */
function downloadJSON(json: string, filename: string) {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Handle import file selection
 */
async function handleImportFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  try {
    const text = await file.text()
    const results = dashboardStore.importDashboards(text, 'merge')
    importResults.value = results
    
    console.log('[Sidebar] Import results:', results)
    
    // Clear file input
    target.value = ''
    
  } catch (err) {
    console.error('[Sidebar] Import error:', err)
    importResults.value = {
      success: 0,
      skipped: 0,
      errors: ['Failed to read file']
    }
  }
}

/**
 * Confirm delete
 */
function confirmDelete(id: string) {
  deleteId.value = id
  showConfirmDelete.value = true
}

/**
 * Handle delete
 */
function handleDelete() {
  if (!deleteId.value) return
  
  const success = dashboardStore.deleteDashboard(deleteId.value)
  if (success) {
    console.log('[Sidebar] Deleted dashboard')
  }
  
  deleteId.value = null
}

/**
 * Load sidebar state from localStorage
 */
onMounted(() => {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored !== null) {
    isOpen.value = stored === 'true'
  }
  
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

/**
 * Watch for mobile changes - close sidebar on mobile
 */
watch(isMobile, (mobile) => {
  if (mobile && isOpen.value) {
    isOpen.value = false
  }
})
</script>

<style scoped>
.sidebar-container {
  position: relative;
  height: 100%;
  transition: width 0.3s ease;
}

/* Desktop: sidebar takes up space, pushes content */
.sidebar-container {
  width: 280px;
  flex-shrink: 0;
}

.sidebar-container.is-collapsed {
  width: 0;
}

/* Sidebar */
.sidebar {
  position: relative;
  width: 280px;
  height: 100%;
  background: var(--panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease;
  overflow: hidden;
}

.sidebar-container.is-collapsed .sidebar {
  transform: translateX(-100%);
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.sidebar-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text);
}

.close-btn {
  display: none;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 24px;
  cursor: pointer;
  padding: 4px;
}

.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--muted);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
}

.dashboard-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Footer */
.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.storage-indicator {
  margin-bottom: 12px;
}

.storage-bar-bg {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}

.storage-bar-fill {
  height: 100%;
  background: var(--color-success);
  transition: all 0.3s;
}

.storage-indicator.storage-warning .storage-bar-fill {
  background: var(--color-warning);
}

.storage-indicator.storage-critical .storage-bar-fill {
  background: var(--color-error);
}

.storage-text {
  font-size: 11px;
  color: var(--muted);
  text-align: center;
}

.limit-warning {
  font-size: 12px;
  color: var(--color-warning);
  text-align: center;
  margin-bottom: 12px;
  padding: 6px;
  background: var(--color-warning-bg);
  border-radius: 4px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-action {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--color-accent);
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-action.btn-new {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.btn-action.btn-new:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn-icon {
  font-size: 16px;
  line-height: 1;
}

.btn-text {
  flex: 1;
}

/* Mobile Styles */
.sidebar-container.is-mobile {
  width: 0;
  position: relative;
  z-index: 100;
}

.sidebar-container.is-mobile .sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 100%;
  max-width: 320px;
  transform: translateX(-100%);
  box-shadow: 4px 0 12px rgba(0, 0, 0, 0.5);
  z-index: 101;
}

.sidebar-container.is-mobile .sidebar.is-open {
  transform: translateX(0);
}

.sidebar-container.is-mobile .close-btn {
  display: block;
}

.sidebar-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 100;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 90%;
  max-width: 480px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.file-input {
  width: 100%;
  padding: 8px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
}

.help-text {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}

.import-results {
  margin-top: 16px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}

.result-success {
  color: var(--color-success);
  font-size: 13px;
  margin-bottom: 8px;
}

.result-warning {
  color: var(--color-warning);
  font-size: 13px;
  margin-bottom: 8px;
}

.result-errors {
  color: var(--color-error);
  font-size: 12px;
}

.error-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.error-item {
  margin-bottom: 4px;
  padding-left: 12px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn-primary,
.btn-secondary {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
