<template>
  <div class="config-data-source">
    <div class="form-group">
      <label>NATS Subject</label>
      <input 
        v-model="form.subject" 
        type="text" 
        class="form-input"
        :class="{ 'has-error': errors.subject }"
        placeholder="sensors.temperature"
      />
      <div v-if="errors.subject" class="error-text">
        {{ errors.subject }}
      </div>
      <div v-else class="help-text">
        NATS subject pattern to subscribe to
      </div>
    </div>
    
    <div class="form-group">
      <label>JSONPath (optional)</label>
      <input 
        v-model="form.jsonPath" 
        type="text" 
        class="form-input"
        :class="{ 'has-error': errors.jsonPath }"
        placeholder="$.value or $.sensors[0].temp"
      />
      <div v-if="errors.jsonPath" class="error-text">
        {{ errors.jsonPath }}
      </div>
      <div v-else class="help-text">
        Extract specific data from messages. Leave empty to show full message.
      </div>
    </div>
    
    <div class="form-group">
      <label>Buffer Size</label>
      <input 
        v-model.number="form.bufferSize" 
        type="number" 
        class="form-input"
        :class="{ 'has-error': errors.bufferSize }"
        min="10"
        max="1000"
      />
      <div v-if="errors.bufferSize" class="error-text">
        {{ errors.bufferSize }}
      </div>
      <div v-else class="help-text">
        Number of messages to keep in history (10-1000)
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
