<template>
  <div class="dashboard-tree">
    <!-- Folders -->
    <div v-for="(content, folderName) in folders" :key="folderName" class="tree-folder">
      <div 
        class="folder-header" 
        @click="toggleFolder(folderName)"
        :class="{ 'is-open': openFolders[folderName] }"
      >
        <span class="folder-icon">{{ openFolders[folderName] ? '📂' : '📁' }}</span>
        <span class="folder-name">{{ folderName }}</span>
      </div>
      
      <div v-if="openFolders[folderName]" class="folder-content">
        <!-- Recursive call for subfolders -->
        <DashboardTree 
          v-if="hasSubfolders(content)"
          :structure="content"
          :active-id="activeId"
          @select="$emit('select', $event)"
          @delete="$emit('delete', $event)"
        />
      </div>
    </div>

    <!-- Items (Dashboards) in this level -->
    <div v-for="item in items" :key="item.key" class="tree-item">
      <div 
        class="dashboard-item"
        :class="{ 'is-active': item.key === activeId }"
        @click="$emit('select', item.key)"
      >
        <span class="item-icon">
          <span v-if="isStartup(item.key)" title="Startup Dashboard">🏠</span>
          <span v-else>📊</span>
        </span>
        <span class="item-name">{{ item.name }}</span>
        
        <!-- Actions menu -->
        <div class="item-actions" @click.stop>
          <button 
            class="action-btn"
            :class="{ 'is-open': activeMenuId === item.key }"
            @click="toggleMenu(item.key)"
            title="Actions"
          >
            ⋮
          </button>
          
          <div v-if="activeMenuId === item.key" class="action-menu">
            <button class="menu-item" @click="handleSetStartup(item.key)">
              <span class="menu-icon">🏠</span>
              <span class="menu-text">Set as Startup</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item danger" @click="handleDelete(item.key)">
              <span class="menu-icon">🗑️</span>
              <span class="menu-text">Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'

// Define recursive structure
interface TreeStructure {
  [key: string]: TreeStructure | string // string is the leaf (key)
}

const props = defineProps<{
  structure: TreeStructure
  activeId: string | null
}>()

const emit = defineEmits<{
  select: [key: string]
  delete: [key: string]
}>()

const dashboardStore = useDashboardStore()
const openFolders = ref<Record<string, boolean>>({})
const activeMenuId = ref<string | null>(null)

// Separate items (leaves) from folders
const items = computed(() => {
  const result: { name: string; key: string }[] = []
  for (const [key, value] of Object.entries(props.structure)) {
    if (typeof value === 'string') {
      result.push({ name: key, key: value })
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
})

const folders = computed(() => {
  const result: Record<string, TreeStructure> = {}
  for (const [key, value] of Object.entries(props.structure)) {
    if (typeof value !== 'string') {
      result[key] = value
    }
  }
  return result
})

function toggleFolder(name: string) {
  openFolders.value[name] = !openFolders.value[name]
}

function hasSubfolders(content: any): boolean {
  return typeof content === 'object' && content !== null
}

function isStartup(key: string): boolean {
  return dashboardStore.startupDashboard?.id === key && 
         dashboardStore.startupDashboard?.storage === 'kv'
}

function toggleMenu(key: string) {
  activeMenuId.value = activeMenuId.value === key ? null : key
}

function handleSetStartup(key: string) {
  dashboardStore.setStartupDashboard(key, 'kv')
  activeMenuId.value = null
}

function handleDelete(key: string) {
  activeMenuId.value = null
  emit('delete', key)
}

function handleClickOutside(event: MouseEvent) {
  if (activeMenuId.value) {
    const target = event.target as HTMLElement
    if (!target.closest('.item-actions')) {
      activeMenuId.value = null
    }
  }
}

// --- Auto-Expand Logic ---

/**
 * Recursively check if a folder structure contains the target key
 */
function containsKey(item: TreeStructure | string, targetKey: string): boolean {
  if (typeof item === 'string') {
    return item === targetKey
  }
  // It's a folder/object, check values
  return Object.values(item).some(child => containsKey(child, targetKey))
}

/**
 * Watch activeId and structure to auto-expand folders
 */
watch([() => props.activeId, folders], ([newId, currentFolders]) => {
  if (!newId) return
  
  for (const [folderName, content] of Object.entries(currentFolders)) {
    // If this folder contains the active dashboard, open it
    if (containsKey(content, newId)) {
      openFolders.value[folderName] = true
    }
  }
}, { immediate: true })

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.dashboard-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-folder {
  margin-bottom: 2px;
}

.folder-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--muted);
  font-size: 13px;
  user-select: none;
}

.folder-header:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
}

.folder-content {
  padding-left: 16px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  margin-left: 7px;
}

.folder-icon {
  font-size: 14px;
}

.tree-item {
  margin-bottom: 2px;
}

.dashboard-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text);
  font-size: 13px;
}

.dashboard-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.dashboard-item.is-active {
  background: var(--color-info-bg);
  color: var(--color-info);
  font-weight: 500;
}

.item-icon {
  font-size: 14px;
  opacity: 0.7;
  width: 16px;
  text-align: center;
}

.item-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-actions {
  position: relative;
}

.action-btn {
  opacity: 0;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  transition: all 0.2s;
  border-radius: 4px;
}

.dashboard-item:hover .action-btn,
.action-btn.is-open {
  opacity: 1;
}

.action-btn:hover,
.action-btn.is-open {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

/* Action Menu Dropdown */
.action-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  min-width: 150px;
  z-index: 100;
  animation: slideDown 0.15s ease-out;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text);
  font-size: 13px;
  transition: all 0.15s;
  text-align: left;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.menu-item.danger:hover {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.menu-icon {
  font-size: 14px;
  line-height: 1;
}

.menu-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}
</style>
