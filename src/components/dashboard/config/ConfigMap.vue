<template>
  <div class="config-map">
    <!-- Map Center -->
    <div class="form-group">
      <label>Map Center</label>
      <div class="coord-inputs">
        <div class="coord-input-group">
          <label class="coord-label">Latitude</label>
          <input 
            v-model.number="form.mapCenterLat" 
            type="number" 
            class="form-input"
            placeholder="39.8283"
            step="any"
          />
        </div>
        <div class="coord-input-group">
          <label class="coord-label">Longitude</label>
          <input 
            v-model.number="form.mapCenterLon" 
            type="number" 
            class="form-input"
            placeholder="-98.5795"
            step="any"
          />
        </div>
        <div class="coord-input-group">
          <label class="coord-label">Zoom</label>
          <input 
            v-model.number="form.mapZoom" 
            type="number" 
            class="form-input"
            placeholder="4"
            min="1"
            max="19"
          />
        </div>
      </div>
      <div class="help-text">
        Default view when map loads. Zoom: 1 (world) to 19 (street level).
      </div>
    </div>

    <!-- Marker Section -->
    <div class="form-group">
      <label>Marker (Optional)</label>
      <div class="marker-section">
        <div class="marker-toggle">
          <label class="checkbox-label">
            <input type="checkbox" v-model="hasMarker" />
            <span>Add a marker to the map</span>
          </label>
        </div>

        <template v-if="hasMarker">
          <div class="marker-fields">
            <div class="form-group">
              <label class="field-label">Marker Label</label>
              <input 
                v-model="form.mapMarkerLabel" 
                type="text" 
                class="form-input"
                placeholder="Building A"
              />
            </div>

            <div class="coord-inputs">
              <div class="coord-input-group">
                <label class="coord-label">Latitude</label>
                <input 
                  v-model.number="form.mapMarkerLat" 
                  type="number" 
                  class="form-input"
                  :placeholder="String(form.mapCenterLat || 39.8283)"
                  step="any"
                />
              </div>
              <div class="coord-input-group">
                <label class="coord-label">Longitude</label>
                <input 
                  v-model.number="form.mapMarkerLon" 
                  type="number" 
                  class="form-input"
                  :placeholder="String(form.mapCenterLon || -98.5795)"
                  step="any"
                />
              </div>
            </div>

            <button 
              type="button"
              class="btn-use-center"
              @click="useMapCenter"
            >
              📍 Use Map Center
            </button>
          </div>

          <!-- Action Section -->
          <div class="action-section">
            <div class="action-toggle">
              <label class="checkbox-label">
                <input type="checkbox" v-model="hasAction" />
                <span>Add click action</span>
              </label>
            </div>

            <template v-if="hasAction">
              <div class="action-fields">
                <div class="form-group">
                  <label class="field-label">Action Label</label>
                  <input 
                    v-model="form.mapActionLabel" 
                    type="text" 
                    class="form-input"
                    placeholder="Toggle Light"
                  />
                </div>

                <div class="form-group">
                  <label class="field-label">Publish Subject</label>
                  <input 
                    v-model="form.mapActionSubject" 
                    type="text" 
                    class="form-input"
                    :class="{ 'has-error': errors.mapActionSubject }"
                    placeholder="building.a.control"
                  />
                  <div v-if="errors.mapActionSubject" class="error-text">
                    {{ errors.mapActionSubject }}
                  </div>
                </div>

                <div class="form-group">
                  <label class="field-label">Payload</label>
                  <textarea 
                    v-model="form.mapActionPayload" 
                    class="form-textarea"
                    :class="{ 'has-error': errors.mapActionPayload }"
                    rows="3"
                    placeholder='{"action": "toggle"}'
                  />
                  <div v-if="errors.mapActionPayload" class="error-text">
                    {{ errors.mapActionPayload }}
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>

    <!-- Preview hint -->
    <div class="preview-hint">
      <span class="hint-icon">💡</span>
      <span class="hint-text">
        Tip: Find coordinates using 
        <a href="https://www.google.com/maps" target="_blank" rel="noopener">Google Maps</a>
        (right-click → "What's here?")
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { WidgetFormState } from '@/types/config'

/**
 * Map Widget Configuration Form
 * 
 * Grug say: V1 is simple. One marker, one action.
 * Data structure supports V2 with arrays, but UI is flat.
 */

const props = defineProps<{
  form: WidgetFormState
  errors: Record<string, string>
}>()

// V1 toggles - controls whether marker/action fields are shown
const hasMarker = ref(false)
const hasAction = ref(false)

/**
 * Set marker coords to match map center
 */
function useMapCenter() {
  props.form.mapMarkerLat = props.form.mapCenterLat
  props.form.mapMarkerLon = props.form.mapCenterLon
}

/**
 * Initialize toggles based on existing form data
 */
onMounted(() => {
  // Check if we have marker data
  hasMarker.value = !!(
    props.form.mapMarkerLabel || 
    props.form.mapMarkerLat || 
    props.form.mapMarkerLon
  )
  
  // Check if we have action data
  hasAction.value = !!(
    props.form.mapActionLabel || 
    props.form.mapActionSubject
  )
})

/**
 * Clear marker fields when toggled off
 */
watch(hasMarker, (has) => {
  if (!has) {
    props.form.mapMarkerLabel = ''
    props.form.mapMarkerLat = 0
    props.form.mapMarkerLon = 0
    hasAction.value = false
  }
})

/**
 * Clear action fields when toggled off
 */
watch(hasAction, (has) => {
  if (!has) {
    props.form.mapActionLabel = ''
    props.form.mapActionSubject = ''
    props.form.mapActionPayload = '{}'
  }
})
</script>

<style scoped>
.config-map {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.coord-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr 80px;
  gap: 12px;
}

.coord-input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coord-label {
  font-size: 11px;
  color: var(--muted);
  font-weight: 500;
}

.field-label {
  font-size: 12px;
  color: var(--text);
  font-weight: 500;
  margin-bottom: 4px;
  display: block;
}

.marker-section {
  background: rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
}

.marker-toggle,
.action-toggle {
  margin-bottom: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
}

.marker-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.btn-use-center {
  align-self: flex-start;
  padding: 6px 12px;
  background: var(--color-info-bg);
  border: 1px solid var(--color-info-border);
  border-radius: 4px;
  color: var(--color-info);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-use-center:hover {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.action-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.action-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
}

.preview-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: var(--color-info-bg);
  border: 1px solid var(--color-info-border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-info);
}

.hint-icon {
  font-size: 16px;
  line-height: 1;
}

.hint-text a {
  color: var(--color-accent);
  text-decoration: underline;
}

.hint-text a:hover {
  text-decoration: none;
}

/* Responsive adjustments */
@media (max-width: 500px) {
  .coord-inputs {
    grid-template-columns: 1fr 1fr;
  }
  
  .coord-inputs .coord-input-group:last-child {
    grid-column: span 2;
  }
}
</style>
