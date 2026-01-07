<template>
  <div class="action-editor">
    <div class="action-header">
      <span class="action-badge" :class="action.type">
        {{ action.type === 'publish' ? '📤' : '🔄' }}
      </span>
      <span class="action-label">{{ action.label || 'Unnamed Action' }}</span>
      <button 
        class="btn-icon-small danger" 
        @click="$emit('remove')"
        title="Remove action"
      >
        ✕
      </button>
    </div>
    
    <div class="action-body">
      <!-- Action Type -->
      <div class="form-row">
        <label>Type</label>
        <select :value="action.type" @change="handleTypeChange" class="form-input">
          <option value="publish">Publish (Button)</option>
          <option value="switch">Switch (Toggle)</option>
        </select>
      </div>
      
      <!-- Label -->
      <div class="form-row">
        <label>Label</label>
        <input 
          :value="action.label"
          @input="updateField('label', ($event.target as HTMLInputElement).value)"
          type="text" 
          class="form-input"
          placeholder="Action label"
        />
      </div>
      
      <!-- Publish Action Fields -->
      <template v-if="action.type === 'publish'">
        <div class="form-row">
          <label>Subject</label>
          <input 
            :value="action.subject"
            @input="updateField('subject', ($event.target as HTMLInputElement).value)"
            type="text" 
            class="form-input"
            :class="{ 'has-error': errors?.subject }"
            placeholder="building.a.control"
          />
          <div v-if="errors?.subject" class="error-text">{{ errors.subject }}</div>
        </div>
        
        <div class="form-row">
          <label>Payload</label>
          <textarea 
            :value="action.payload"
            @input="updateField('payload', ($event.target as HTMLTextAreaElement).value)"
            class="form-textarea"
            :class="{ 'has-error': errors?.payload }"
            rows="2"
            placeholder='{"action": "trigger"}'
          />
          <div v-if="errors?.payload" class="error-text">{{ errors.payload }}</div>
        </div>
      </template>
      
      <!-- Switch Action Fields -->
      <template v-if="action.type === 'switch'">
        <div class="form-row">
          <label>Mode</label>
          <select 
            :value="switchConfig.mode" 
            @change="updateSwitchField('mode', ($event.target as HTMLSelectElement).value)"
            class="form-input"
          >
            <option value="kv">KV (Stateful)</option>
            <option value="core">CORE (Pub/Sub)</option>
          </select>
        </div>
        
        <!-- KV Mode -->
        <template v-if="switchConfig.mode === 'kv'">
          <div class="form-row">
            <label>KV Bucket</label>
            <input 
              :value="switchConfig.kvBucket"
              @input="updateSwitchField('kvBucket', ($event.target as HTMLInputElement).value)"
              type="text" 
              class="form-input"
              :class="{ 'has-error': errors?.kvBucket }"
              placeholder="device-states"
            />
            <div v-if="errors?.kvBucket" class="error-text">{{ errors.kvBucket }}</div>
          </div>
          
          <div class="form-row">
            <label>KV Key</label>
            <input 
              :value="switchConfig.kvKey"
              @input="updateSwitchField('kvKey', ($event.target as HTMLInputElement).value)"
              type="text" 
              class="form-input"
              :class="{ 'has-error': errors?.kvKey }"
              placeholder="device.switch"
            />
            <div v-if="errors?.kvKey" class="error-text">{{ errors.kvKey }}</div>
          </div>
        </template>
        
        <!-- Core Mode -->
        <template v-if="switchConfig.mode === 'core'">
          <div class="form-row">
            <label>Publish Subject</label>
            <input 
              :value="switchConfig.publishSubject"
              @input="updateSwitchField('publishSubject', ($event.target as HTMLInputElement).value)"
              type="text" 
              class="form-input"
              :class="{ 'has-error': errors?.publishSubject }"
              placeholder="device.control"
            />
            <div v-if="errors?.publishSubject" class="error-text">{{ errors.publishSubject }}</div>
          </div>
          
          <div class="form-row">
            <label>State Subject (optional)</label>
            <input 
              :value="switchConfig.stateSubject"
              @input="updateSwitchField('stateSubject', ($event.target as HTMLInputElement).value)"
              type="text" 
              class="form-input"
              placeholder="device.state"
            />
            <div class="help-text">Subscribe for state updates. Defaults to publish subject.</div>
          </div>
        </template>
        
        <!-- Payload fields (both modes) -->
        <div class="form-row-pair">
          <div class="form-row">
            <label>ON Payload</label>
            <input 
              :value="onPayloadStr"
              @input="updatePayload('on', ($event.target as HTMLInputElement).value)"
              type="text" 
              class="form-input"
              placeholder='{"state":"on"}'
            />
          </div>
          <div class="form-row">
            <label>OFF Payload</label>
            <input 
              :value="offPayloadStr"
              @input="updatePayload('off', ($event.target as HTMLInputElement).value)"
              type="text" 
              class="form-input"
              placeholder='{"state":"off"}'
            />
          </div>
        </div>
        
        <!-- Labels -->
        <div class="form-row-pair">
          <div class="form-row">
            <label>ON Label</label>
            <input 
              :value="switchLabels.on"
              @input="updateSwitchLabel('on', ($event.target as HTMLInputElement).value)"
              type="text" 
              class="form-input"
              placeholder="ON"
            />
          </div>
          <div class="form-row">
            <label>OFF Label</label>
            <input 
              :value="switchLabels.off"
              @input="updateSwitchLabel('off', ($event.target as HTMLInputElement).value)"
              type="text" 
              class="form-input"
              placeholder="OFF"
            />
          </div>
        </div>
        
        <!-- Confirm toggle -->
        <div class="form-row">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              :checked="switchConfig.confirmOnChange"
              @change="updateSwitchField('confirmOnChange', ($event.target as HTMLInputElement).checked)"
            />
            <span>Require confirmation before toggle</span>
          </label>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MapMarkerAction, MapActionSwitchConfig } from '@/types/dashboard'

/**
 * Marker Action Editor Component
 * 
 * Grug say: Edit single action. Can be publish or switch type.
 * Switch type has nested config for KV or Core mode.
 * 
 * Fixed: No longer mutates props directly. Uses emit to update parent.
 */

const props = defineProps<{
  action: MapMarkerAction
  errors?: Record<string, string>
}>()

const emit = defineEmits<{
  remove: []
  'update:action': [action: MapMarkerAction]
}>()

/**
 * Get switch config with defaults (read-only)
 */
const switchConfig = computed<MapActionSwitchConfig>(() => {
  return props.action.switchConfig || {
    mode: 'kv',
    kvBucket: '',
    kvKey: '',
    onPayload: { state: 'on' },
    offPayload: { state: 'off' },
    labels: { on: 'ON', off: 'OFF' }
  }
})

/**
 * Labels helper with defaults (read-only)
 */
const switchLabels = computed(() => {
  return switchConfig.value.labels || { on: 'ON', off: 'OFF' }
})

/**
 * ON payload as string for input binding
 */
const onPayloadStr = computed(() => {
  return JSON.stringify(switchConfig.value.onPayload || { state: 'on' })
})

/**
 * OFF payload as string for input binding
 */
const offPayloadStr = computed(() => {
  return JSON.stringify(switchConfig.value.offPayload || { state: 'off' })
})

/**
 * Emit updated action to parent
 */
function emitUpdate(updates: Partial<MapMarkerAction>) {
  emit('update:action', { ...props.action, ...updates })
}

/**
 * Update a top-level field on the action
 */
function updateField(field: keyof MapMarkerAction, value: any) {
  emitUpdate({ [field]: value })
}

/**
 * Update a field in switchConfig
 */
function updateSwitchField(field: keyof MapActionSwitchConfig, value: any) {
  const newSwitchConfig = { ...switchConfig.value, [field]: value }
  emitUpdate({ switchConfig: newSwitchConfig })
}

/**
 * Update switch label
 */
function updateSwitchLabel(which: 'on' | 'off', value: string) {
  const newLabels = { ...switchLabels.value, [which]: value }
  const newSwitchConfig = { ...switchConfig.value, labels: newLabels }
  emitUpdate({ switchConfig: newSwitchConfig })
}

/**
 * Update payload (parse JSON if possible)
 */
function updatePayload(which: 'on' | 'off', value: string) {
  let parsed: any
  try {
    parsed = JSON.parse(value)
  } catch {
    parsed = value
  }
  
  const field = which === 'on' ? 'onPayload' : 'offPayload'
  const newSwitchConfig = { ...switchConfig.value, [field]: parsed }
  emitUpdate({ switchConfig: newSwitchConfig })
}

/**
 * Handle type change - reset type-specific fields
 */
function handleTypeChange(event: Event) {
  const newType = (event.target as HTMLSelectElement).value as 'publish' | 'switch'
  
  if (newType === 'publish') {
    // Switching to publish - clear switch config, set defaults for publish
    emitUpdate({
      type: 'publish',
      switchConfig: undefined,
      subject: props.action.subject || '',
      payload: props.action.payload || '{}'
    })
  } else {
    // Switching to switch - clear publish fields, set defaults for switch
    emitUpdate({
      type: 'switch',
      subject: undefined,
      payload: undefined,
      switchConfig: {
        mode: 'kv',
        kvBucket: '',
        kvKey: '',
        onPayload: { state: 'on' },
        offPayload: { state: 'off' },
        labels: { on: 'ON', off: 'OFF' }
      }
    })
  }
}
</script>

<style scoped>
.action-editor {
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.action-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--border);
}

.action-badge {
  font-size: 16px;
  line-height: 1;
}

.action-badge.switch {
  color: var(--color-warning);
}

.action-badge.publish {
  color: var(--color-info);
}

.action-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-icon-small {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-icon-small.danger:hover {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.action-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-row label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
}

.form-row-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 8px 10px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 13px;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
}

.form-input.has-error,
.form-textarea.has-error {
  border-color: var(--color-error);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.error-text {
  font-size: 11px;
  color: var(--color-error);
}

.help-text {
  font-size: 11px;
  color: var(--muted);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
}

@media (max-width: 500px) {
  .form-row-pair {
    grid-template-columns: 1fr;
  }
}
</style>
