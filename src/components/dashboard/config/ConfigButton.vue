<template>
  <div class="config-button">
    <div class="form-group">
      <label>Button Label</label>
      <input 
        v-model="form.buttonLabel" 
        type="text" 
        class="form-input"
        :class="{ 'has-error': errors.buttonLabel }"
        placeholder="Send Message"
      />
      <div v-if="errors.buttonLabel" class="error-text">
        {{ errors.buttonLabel }}
      </div>
    </div>

    <div class="form-group">
      <label>Button Color</label>
      <select 
        v-model="form.buttonColor" 
        class="form-input" 
        :style="{ color: form.buttonColor || 'inherit' }"
      >
        <option value="">Default (Primary)</option>
        <option value="var(--color-secondary)" style="color: var(--color-secondary)">Secondary (Blue)</option>
        <option value="var(--color-success)" style="color: var(--color-success)">Success (Green)</option>
        <option value="var(--color-warning)" style="color: var(--color-warning)">Warning (Orange)</option>
        <option value="var(--color-error)" style="color: var(--color-error)">Danger (Red)</option>
        <option value="var(--panel)" style="color: var(--text); background: var(--panel)">Neutral (Gray)</option>
      </select>
    </div>
    
    <div class="form-group">
      <label>Publish Subject</label>
      <input 
        v-model="form.subject" 
        type="text" 
        class="form-input"
        :class="{ 'has-error': errors.subject }"
        placeholder="button.clicked"
      />
      <div v-if="errors.subject" class="error-text">
        {{ errors.subject }}
      </div>
    </div>
    
    <div class="form-group">
      <label>Message Payload</label>
      <textarea 
        v-model="form.buttonPayload" 
        class="form-textarea"
        :class="{ 'has-error': errors.buttonPayload }"
        rows="6"
        placeholder='{"action": "clicked"}'
      />
      <div v-if="errors.buttonPayload" class="error-text">
        {{ errors.buttonPayload }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WidgetFormState } from '@/types/config'

defineProps<{
  form: WidgetFormState
  errors: Record<string, string>
}>()
</script>
