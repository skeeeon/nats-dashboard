<template>
  <div class="switch-widget" :class="{ 'card-layout': layoutMode === 'card' }">
    <!-- Card Layout: Icon | Title+State | Toggle -->
    <template v-if="layoutMode === 'card'">
      <div class="card-content">
        <div class="card-icon" :class="{ 'is-active': state === 'on' }">
          {{ state === 'on' ? '💡' : '🌑' }}
        </div>
        
        <div class="card-info">
          <div class="card-title">{{ config.title }}</div>
          <div class="card-state">{{ currentStateLabel }}</div>
        </div>
        
        <div class="card-toggle" :class="{ 'is-active': state === 'on' }">
          <div class="card-toggle-thumb"></div>
        </div>
      </div>
      
      <button 
        class="card-overlay-btn"
        :disabled="isPending || !natsStore.isConnected"
        @click="toggle"
      ></button>
    </template>

    <!-- Standard Layout (Old Desktop Style) -->
    <template v-else>
      <div class="centered-content">
        <button 
          class="switch-btn"
          :class="['state-' + state, { pending: isPending }]"
          :disabled="isPending || !natsStore.isConnected"
          @click="toggle"
        >
          <!-- Big Icon for desktop -->
          <div class="icon-wrapper">
            <span class="icon">{{ state === 'on' ? '💡' : '🌑' }}</span>
          </div>
          <!-- Label below -->
          <div class="label">{{ currentStateLabel }}</div>
          
          <div v-if="isPending" class="spinner"></div>
        </button>
      </div>
    </template>
    
    <div v-if="error" class="error-toast">{{ error }}</div>
    <div v-if="!natsStore.isConnected" class="offline-badge">⚠️</div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { useSwitchState } from '@/composables/useSwitchState'
import { useDashboardStore } from '@/stores/dashboard'
import { useNatsStore } from '@/stores/nats'
import { resolveTemplate } from '@/utils/variables'
import type { WidgetConfig } from '@/types/dashboard'

const props = withDefaults(defineProps<{
  config: WidgetConfig
  layoutMode?: 'standard' | 'card'
}>(), {
  layoutMode: 'standard'
})

const dashboardStore = useDashboardStore()
const natsStore = useNatsStore()
const requestConfirm = inject('requestConfirm') as (title: string, message: string, onConfirm: () => void) => void

const cfg = computed(() => props.config.switchConfig!)

const resolvedConfig = computed(() => {
  const vars = dashboardStore.currentVariableValues
  return {
    mode: cfg.value.mode,
    kvBucket: resolveTemplate(cfg.value.kvBucket, vars),
    kvKey: resolveTemplate(cfg.value.kvKey, vars),
    publishSubject: resolveTemplate(cfg.value.publishSubject, vars),
    stateSubject: resolveTemplate(cfg.value.stateSubject, vars),
    onPayload: cfg.value.onPayload,
    offPayload: cfg.value.offPayload,
    defaultState: cfg.value.defaultState
  }
})

const { state, error, isPending, toggle: executeToggle } = useSwitchState(resolvedConfig)

const labels = computed(() => cfg.value.labels || { on: 'ON', off: 'OFF' })
const currentStateLabel = computed(() => {
  if (state.value === 'pending') return '...'
  return state.value === 'on' ? labels.value.on : labels.value.off
})

function toggle() {
  if (cfg.value.confirmOnChange) {
    requestConfirm(
      'Confirm Action',
      cfg.value.confirmMessage || `Switch ${state.value === 'on' ? 'OFF' : 'ON'}?`,
      () => executeToggle()
    )
  } else {
    executeToggle()
  }
}
</script>

<style scoped>
.switch-widget {
  height: 100%;
  width: 100%;
  position: relative;
}

/* --- CARD LAYOUT STYLES --- */
.switch-widget.card-layout {
  padding: 12px;
  display: flex;
  align-items: center;
}

.card-content {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0,0,0,0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: background 0.3s, color 0.3s;
  color: var(--muted);
}

.card-icon.is-active {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.card-state {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}

.card-toggle {
  width: 40px;
  height: 24px;
  background: var(--muted);
  border-radius: 12px;
  position: relative;
  transition: background 0.3s;
  flex-shrink: 0;
  opacity: 0.5;
}

.card-toggle.is-active {
  background: var(--color-primary);
  opacity: 1;
}

.card-toggle-thumb {
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.card-toggle.is-active .card-toggle-thumb {
  transform: translateX(16px);
}

.card-overlay-btn {
  position: absolute;
  inset: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  z-index: 5;
}

.card-overlay-btn:disabled {
  cursor: not-allowed;
}

/* --- STANDARD LAYOUT STYLES (Restored Old CSS) --- */
.centered-content {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.switch-btn {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 8px;
  background: var(--panel);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border);
}

.switch-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--color-accent);
}

.switch-btn.state-on {
  border-color: var(--color-warning);
  background: var(--color-warning-bg);
}

.switch-btn.state-on .icon {
  filter: drop-shadow(0 0 8px var(--color-warning));
}

.switch-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.icon-wrapper {
  font-size: 24px;
  transition: transform 0.2s;
}

.switch-btn:active .icon-wrapper {
  transform: scale(0.9);
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.spinner {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 12px;
  height: 12px;
  border: 2px solid transparent;
  border-top-color: var(--text);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.error-toast {
  position: absolute;
  bottom: 4px;
  left: 4px;
  right: 4px;
  background: var(--color-error-bg);
  color: var(--color-error);
  font-size: 10px;
  padding: 4px;
  border-radius: 4px;
  text-align: center;
  pointer-events: none;
}

.offline-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 12px;
  pointer-events: none;
}
</style>
