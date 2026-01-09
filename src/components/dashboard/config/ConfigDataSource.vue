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
    
    <!-- JetStream Toggle -->
    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" v-model="form.useJetStream" />
        <span>Use JetStream (History)</span>
      </label>
    </div>

    <!-- JetStream Options -->
    <div v-if="form.useJetStream" class="form-group jetstream-options">
      <label>Deliver Policy</label>
      <select v-model="form.deliverPolicy" class="form-input">
        <option value="all">All (Entire History)</option>
        <option value="last">Last (Last Message)</option>
        <option value="last_per_subject">Last Per Subject (Current State)</option>
        <option value="new">New (From Now)</option>
        <option value="by_start_time">By Time Window</option>
      </select>
      
      <!-- Time Window Input -->
      <div v-if="form.deliverPolicy === 'by_start_time'" class="mt-2">
        <label class="sub-label">Time Window</label>
        <input 
          v-model="form.jetstreamTimeWindow" 
          type="text" 
          class="form-input"
          placeholder="10m"
        />
        <div class="help-text">
          Examples: <code>10m</code> (minutes), <code>1h</code> (hour), <code>24h</code>.
        </div>
      </div>
      
      <div class="help-text" v-else>
        Controls how much historical data to load.
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

<style scoped>
.jetstream-options {
  padding: 12px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  border: 1px solid var(--border);
  margin-top: -10px;
  margin-bottom: 20px;
  animation: slideDown 0.2s ease-out;
}

.sub-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 4px;
  margin-top: 8px;
}

.mt-2 {
  margin-top: 8px;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
