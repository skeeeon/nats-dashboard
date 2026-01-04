<template>
  <div v-if="modelValue" class="confirm-overlay" @click.self="cancel">
    <div class="confirm-dialog" :class="variantClass">
      <div class="confirm-header">
        <div class="confirm-icon">{{ icon }}</div>
        <h3 class="confirm-title">{{ title }}</h3>
      </div>
      
      <div class="confirm-body">
        <p class="confirm-message">{{ message }}</p>
        <p v-if="details" class="confirm-details">{{ details }}</p>
      </div>
      
      <div class="confirm-actions">
        <button 
          class="btn-secondary"
          @click="cancel"
        >
          {{ cancelText }}
        </button>
        <button 
          class="btn-confirm"
          :class="variantClass"
          @click="confirm"
          autofocus
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Confirm Dialog Component
 * 
 * Grug say: Ask user "you sure?" before do dangerous thing.
 * Simple modal with Yes/No buttons.
 * 
 * Usage:
 * <ConfirmDialog
 *   v-model="showConfirm"
 *   title="Delete Dashboard?"
 *   message="This will permanently delete 12 widgets."
 *   variant="danger"
 *   @confirm="handleDelete"
 * />
 */

interface Props {
  modelValue: boolean
  title: string
  message: string
  details?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  variant: 'danger'
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

/**
 * Icon based on variant
 */
const icon = computed(() => {
  switch (props.variant) {
    case 'danger': return '⚠️'
    case 'warning': return '⚡'
    case 'info': return 'ℹ️'
    default: return '⚠️'
  }
})

/**
 * CSS class for variant styling
 */
const variantClass = computed(() => `variant-${props.variant}`)

/**
 * Confirm action
 */
function confirm() {
  emit('confirm')
  emit('update:modelValue', false)
}

/**
 * Cancel action
 */
function cancel() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.confirm-dialog {
  background: var(--panel);
  border: 2px solid;
  border-radius: 8px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.2s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Variant border colors */
.confirm-dialog.variant-danger {
  border-color: var(--color-error);
}

.confirm-dialog.variant-warning {
  border-color: var(--color-warning);
}

.confirm-dialog.variant-info {
  border-color: var(--color-info);
}

.confirm-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.confirm-icon {
  font-size: 32px;
  line-height: 1;
}

.confirm-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
}

.confirm-body {
  padding: 24px;
}

.confirm-message {
  margin: 0 0 12px 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--text);
}

.confirm-details {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted);
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

.btn-secondary,
.btn-confirm {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-confirm {
  color: white;
}

.btn-confirm.variant-danger {
  background: var(--color-error);
}

.btn-confirm.variant-danger:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-confirm.variant-warning {
  background: var(--color-warning);
}

.btn-confirm.variant-warning:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-confirm.variant-info {
  background: var(--color-info);
}

.btn-confirm.variant-info:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Mobile adjustments */
@media (max-width: 600px) {
  .confirm-dialog {
    width: 95%;
    max-width: none;
  }
  
  .confirm-header {
    padding: 16px 20px;
  }
  
  .confirm-body {
    padding: 20px;
  }
  
  .confirm-actions {
    flex-direction: column-reverse;
    padding: 12px 20px;
  }
  
  .btn-secondary,
  .btn-confirm {
    width: 100%;
  }
}
</style>
