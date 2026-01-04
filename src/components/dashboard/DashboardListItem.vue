<template>
  <div 
    class="dashboard-item"
    :class="{ 'is-active': isActive }"
    @click="$emit('select')"
  >
    <div class="item-content">
      <!-- Icon -->
      <div class="item-icon">📊</div>
      
      <!-- Info -->
      <div class="item-info">
        <div class="item-name">{{ dashboard.name }}</div>
        <div class="item-meta">
          {{ dashboard.widgets.length }} widget{{ dashboard.widgets.length !== 1 ? 's' : '' }}
        </div>
      </div>
      
      <!-- Actions menu -->
      <div class="item-actions" @click.stop>
        <button 
          class="action-btn"
          :class="{ 'is-open': showMenu }"
          @click="toggleMenu"
          title="Dashboard actions"
        >
          ⋮
        </button>
        
        <!-- Dropdown menu -->
        <div v-if="showMenu" class="action-menu">
          <button class="menu-item" @click="handleRename">
            <span class="menu-icon">✏️</span>
            <span class="menu-text">Rename</span>
          </button>
          <button class="menu-item" @click="handleDuplicate">
            <span class="menu-icon">📋</span>
            <span class="menu-text">Duplicate</span>
          </button>
          <button class="menu-item" @click="handleExport">
            <span class="menu-icon">💾</span>
            <span class="menu-text">Export</span>
          </button>
          <div class="menu-divider"></div>
          <button class="menu-item danger" @click="handleDelete">
            <span class="menu-icon">🗑️</span>
            <span class="menu-text">Delete</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Dashboard } from '@/types/dashboard'

/**
 * Dashboard List Item Component
 * 
 * Grug say: One dashboard in sidebar list.
 * Show name, widget count, actions menu.
 */

interface Props {
  dashboard: Dashboard
  isActive: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  select: []
  rename: []
  duplicate: []
  export: []
  delete: []
}>()

const showMenu = ref(false)

/**
 * Toggle actions menu
 */
function toggleMenu() {
  showMenu.value = !showMenu.value
}

/**
 * Close menu when clicking outside
 */
function handleClickOutside(event: MouseEvent) {
  if (showMenu.value) {
    const target = event.target as HTMLElement
    if (!target.closest('.item-actions')) {
      showMenu.value = false
    }
  }
}

/**
 * Handle actions
 */
function handleRename() {
  showMenu.value = false
  emit('rename')
}

function handleDuplicate() {
  showMenu.value = false
  emit('duplicate')
}

function handleExport() {
  showMenu.value = false
  emit('export')
}

function handleDelete() {
  showMenu.value = false
  emit('delete')
}

// Register click outside listener
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.dashboard-item {
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  background: transparent;
}

.dashboard-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.dashboard-item.is-active {
  background: var(--color-info-bg);
  border-color: var(--color-accent);
}

.item-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.item-icon {
  font-size: 24px;
  line-height: 1;
  flex-shrink: 0;
}

.item-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.item-meta {
  font-size: 12px;
  color: var(--muted);
}

.item-actions {
  position: relative;
  flex-shrink: 0;
}

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.action-btn.is-open {
  background: rgba(255, 255, 255, 0.15);
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
  min-width: 160px;
  z-index: 100;
  animation: slideDown 0.15s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text);
  font-size: 13px;
  transition: all 0.15s;
  text-align: left;
}

.menu-item:first-child {
  border-radius: 6px 6px 0 0;
}

.menu-item:last-child {
  border-radius: 0 0 6px 6px;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.menu-item.danger:hover {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.menu-icon {
  font-size: 16px;
  line-height: 1;
}

.menu-text {
  flex: 1;
}

.menu-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}
</style>
