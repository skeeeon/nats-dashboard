<template>
  <div class="button-widget">
    <button 
      class="widget-button"
      :style="buttonStyle"
      :class="{ 'success-state': showSuccess, 'error-state': showError }"
      :disabled="!natsStore.isConnected || showSuccess"
      @click="handleClick"
    >
      <div class="button-content">
        <!-- Icon -->
        <span class="button-icon" v-if="currentIcon">
          {{ currentIcon }}
        </span>
        
        <!-- Label -->
        <span class="button-label">
          {{ currentLabel }}
        </span>
      </div>
      
      <!-- Loading / Progress bar effect (optional, simple animation) -->
      <div v-if="showSuccess" class="success-ripple"></div>
    </button>
    
    <!-- Disconnected Overlay -->
    <div v-if="!natsStore.isConnected" class="disconnected-overlay" title="Not connected to NATS">
      <span class="disconnect-icon">⚠️</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useNatsStore } from '@/stores/nats'
import { useDesignTokens } from '@/composables/useDesignTokens'
import type { WidgetConfig } from '@/types/dashboard'
import { encodeString } from '@/utils/encoding'

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()
const { semanticColors } = useDesignTokens()

// State for visual feedback
const showSuccess = ref(false)
const showError = ref(false)

// Defaults
const defaultLabel = computed(() => props.config.buttonConfig?.label || 'Publish')
const buttonColor = computed(() => props.config.buttonConfig?.color || semanticColors.value.primary)

// Dynamic content based on state
const currentLabel = computed(() => {
  if (!natsStore.isConnected) return 'Disconnected'
  if (showSuccess.value) return 'Sent!'
  if (showError.value) return 'Error'
  return defaultLabel.value
})

const currentIcon = computed(() => {
  if (!natsStore.isConnected) return ''
  if (showSuccess.value) return '✓'
  if (showError.value) return '✕'
  return '📤' // Default icon
})

// Dynamic styling
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
    // CSS variable for hover effect in style tag
    '--hover-bg': adjustColorOpacity(buttonColor.value, 0.8)
  }
})

const publishSubject = computed(() => props.config.buttonConfig?.publishSubject || 'button.clicked')
const publishPayload = computed(() => props.config.buttonConfig?.payload || '{}')

function handleClick() {
  if (!natsStore.nc) return
  
  try {
    const payload = encodeString(publishPayload.value)
    
    natsStore.nc.publish(publishSubject.value, payload)
    
    // Trigger success feedback
    showSuccess.value = true
    setTimeout(() => {
      showSuccess.value = false
    }, 1500)
    
    console.log(`[Button] Published to ${publishSubject.value}`)
  } catch (err) {
    console.error('[Button] Publish error:', err)
    // Trigger error feedback
    showError.value = true
    setTimeout(() => {
      showError.value = false
    }, 1500)
  }
}

// Helper to darken/lighten color for hover (simple approximation)
function adjustColorOpacity(hex: string, opacity: number) {
  // If it's already an rgba/var, just return it (fallback)
  if (!hex.startsWith('#')) return hex
  
  // Convert hex to rgb
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
  padding: 8px; /* Small gutter so button doesn't touch edges */
  background: var(--widget-bg);
  position: relative;
  display: flex;
}

.widget-button {
  flex: 1; /* Fill container */
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
  background-color: var(--hover-bg) !important; /* Fallback provided by inline style */
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.widget-button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.widget-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

/* Button Content */
.button-content {
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 2;
}

.button-icon {
  font-size: 1.2em;
  line-height: 1;
}

.button-label {
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Disconnected Overlay */
.disconnected-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
  pointer-events: none;
  z-index: 10;
}

.disconnect-icon {
  font-size: 16px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
}

/* Success Animation */
@keyframes ripple {
  0% { transform: scale(0); opacity: 0.5; }
  100% { transform: scale(4); opacity: 0; }
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
</style>
