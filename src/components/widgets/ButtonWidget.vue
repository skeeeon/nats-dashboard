<template>
  <div class="button-widget" :class="{ 'card-layout': layoutMode === 'card' }">
    <!-- Card Layout -->
    <template v-if="layoutMode === 'card'">
      <div class="card-content">
        <div class="card-icon" :style="{ color: buttonColor }">
          {{ showSuccess ? '✓' : '⚡' }}
        </div>
        
        <div class="card-info">
          <div class="card-title">{{ config.title }}</div>
          <div class="card-label">{{ currentLabel }}</div>
        </div>
        
        <div class="card-action">
          <span class="action-text">PRESS</span>
        </div>
      </div>
      
      <button 
        class="card-overlay-btn"
        :disabled="!natsStore.isConnected"
        @click="handleClick"
      >
        <div v-if="showSuccess" class="ripple-effect"></div>
      </button>
    </template>

    <!-- Standard Layout -->
    <template v-else>
      <button 
        class="widget-button"
        :style="buttonStyle"
        :class="{ 'success-state': showSuccess, 'error-state': showError }"
        :disabled="!natsStore.isConnected || showSuccess"
        @click="handleClick"
      >
        <div class="button-content">
          <span class="button-icon" v-if="currentIcon">{{ currentIcon }}</span>
          <span class="button-label">{{ currentLabel }}</span>
        </div>
        <div v-if="showSuccess" class="success-ripple"></div>
      </button>
    </template>
    
    <div v-if="!natsStore.isConnected" class="disconnected-overlay">⚠️</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { useDesignTokens } from '@/composables/useDesignTokens'
import type { WidgetConfig } from '@/types/dashboard'
import { encodeString } from '@/utils/encoding'
import { resolveTemplate } from '@/utils/variables'

const props = withDefaults(defineProps<{
  config: WidgetConfig
  layoutMode?: 'standard' | 'card'
}>(), {
  layoutMode: 'standard'
})

const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()
const { semanticColors } = useDesignTokens()

const showSuccess = ref(false)
const showError = ref(false)

const defaultLabel = computed(() => props.config.buttonConfig?.label || 'Publish')
const buttonColor = computed(() => props.config.buttonConfig?.color || semanticColors.value.primary)

const currentLabel = computed(() => {
  if (!natsStore.isConnected) return 'Offline'
  if (showSuccess.value) return 'Sent!'
  if (showError.value) return 'Error'
  return defaultLabel.value
})

const currentIcon = computed(() => {
  if (!natsStore.isConnected) return ''
  if (showSuccess.value) return '✓'
  if (showError.value) return '✕'
  return null
})

const buttonStyle = computed(() => {
  if (showSuccess.value) {
    return {
      backgroundColor: semanticColors.value.success,
      borderColor: semanticColors.value.success,
      color: 'white'
    }
  }
  if (showError.value) {
    return {
      backgroundColor: semanticColors.value.error,
      borderColor: semanticColors.value.error,
      color: 'white'
    }
  }
  
  return {
    backgroundColor: buttonColor.value,
    borderColor: buttonColor.value,
    '--hover-bg': adjustColorOpacity(buttonColor.value, 0.8)
  }
})

const publishSubject = computed(() => {
  const raw = props.config.buttonConfig?.publishSubject || 'button.clicked'
  return resolveTemplate(raw, dashboardStore.currentVariableValues)
})

const publishPayload = computed(() => {
  const raw = props.config.buttonConfig?.payload || '{}'
  return resolveTemplate(raw, dashboardStore.currentVariableValues)
})

function handleClick() {
  if (!natsStore.nc) return
  
  try {
    const payload = encodeString(publishPayload.value)
    natsStore.nc.publish(publishSubject.value, payload)
    
    showSuccess.value = true
    setTimeout(() => {
      showSuccess.value = false
    }, 1500)
  } catch (err) {
    showError.value = true
    setTimeout(() => {
      showError.value = false
    }, 1500)
  }
}

function adjustColorOpacity(hex: string, opacity: number) {
  if (!hex.startsWith('#')) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}
</script>

<style scoped>
.button-widget {
  height: 100%;
  width: 100%;
  position: relative;
}

/* --- CARD LAYOUT --- */
.button-widget.card-layout {
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
  flex-shrink: 0;
}

.card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-label {
  font-size: 12px;
  color: var(--muted);
}

.card-action {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  background: rgba(0,0,0,0.05);
  padding: 4px 8px;
  border-radius: 4px;
}

.card-overlay-btn {
  position: absolute;
  inset: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  z-index: 5;
  overflow: hidden;
}

.ripple-effect {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100px;
  height: 100px;
  background: var(--color-success-bg);
  border-radius: 50%;
  transform: translate(-50%, -50%) scale(0);
  animation: ripple-card 0.5s ease-out forwards;
}

@keyframes ripple-card {
  to { transform: translate(-50%, -50%) scale(4); opacity: 0; }
}

/* --- STANDARD LAYOUT --- */
.button-widget:not(.card-layout) {
  padding: 8px;
  display: flex;
}

.widget-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  color: white;
  font-weight: 600;
  font-size: 14px;
  position: relative;
  overflow: hidden;
  user-select: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.widget-button:hover:not(:disabled):not(.success-state) {
  background-color: var(--hover-bg) !important;
  transform: translateY(-1px);
}

.widget-button:active:not(:disabled) {
  transform: translateY(0);
}

.widget-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.button-content {
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 2;
}

.button-icon { font-size: 1.2em; line-height: 1; }

.disconnected-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
  pointer-events: none;
  z-index: 10;
  font-size: 12px;
}

.success-ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: ripple 0.6s ease-out;
}

@keyframes ripple {
  0% { transform: scale(0); opacity: 0.5; }
  100% { transform: scale(4); opacity: 0; }
}
</style>
