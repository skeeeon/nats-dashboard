<template>
  <div class="button-widget">
    <button 
      class="widget-button"
      :style="buttonStyle"
      :disabled="!natsStore.isConnected"
      @click="handleClick"
    >
      <span class="button-icon">{{ buttonIcon }}</span>
      <span class="button-label">{{ buttonLabel }}</span>
    </button>
    
    <div v-if="lastPublished" class="last-published">
      Last published: {{ lastPublished }}
    </div>
    
    <div v-if="!natsStore.isConnected" class="disconnected-warning">
      ⚠️ Not connected to NATS
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useNatsStore } from '@/stores/nats'
import type { WidgetConfig } from '@/types/dashboard'

/**
 * Button Widget
 * 
 * Grug say: Button push, message go. Simple.
 * Click button → publish message to NATS.
 * Good for triggering actions, sending commands, testing.
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const natsStore = useNatsStore()
const lastPublished = ref<string | null>(null)

// Get button configuration with defaults
const buttonLabel = computed(() => 
  props.config.buttonConfig?.label || 'Publish'
)

const buttonIcon = computed(() => {
  // Optional: can configure icon per button
  return '📤'
})

const buttonColor = computed(() => 
  props.config.buttonConfig?.color || '#3fb950'
)

const buttonStyle = computed(() => ({
  backgroundColor: buttonColor.value,
  borderColor: buttonColor.value,
}))

const publishSubject = computed(() => 
  props.config.buttonConfig?.publishSubject || 'button.clicked'
)

const publishPayload = computed(() => 
  props.config.buttonConfig?.payload || '{}'
)

/**
 * Handle button click - publish message to NATS
 */
function handleClick() {
  if (!natsStore.nc) return
  
  try {
    const encoder = new TextEncoder()
    const payload = encoder.encode(publishPayload.value)
    
    natsStore.nc.publish(publishSubject.value, payload)
    
    // Update last published timestamp
    lastPublished.value = new Date().toLocaleTimeString()
    
    // Clear after 3 seconds
    setTimeout(() => {
      lastPublished.value = null
    }, 3000)
    
    console.log(`[Button] Published to ${publishSubject.value}:`, publishPayload.value)
  } catch (err) {
    console.error('[Button] Publish error:', err)
  }
}
</script>

<style scoped>
.button-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  gap: 12px;
}

.widget-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 32px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  color: white;
  min-width: 150px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.widget-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.widget-button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.widget-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-icon {
  font-size: 20px;
}

.button-label {
  font-size: 14px;
  letter-spacing: 0.5px;
}

.last-published {
  font-size: 11px;
  color: var(--muted, #888);
  animation: fadeIn 0.3s ease-out;
}

.disconnected-warning {
  font-size: 11px;
  color: var(--danger, #f85149);
  display: flex;
  align-items: center;
  gap: 4px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
