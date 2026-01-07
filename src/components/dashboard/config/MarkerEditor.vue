<template>
  <div class="marker-editor" :class="{ 'is-expanded': isExpanded }">
    <!-- Marker Header (collapsible) -->
    <div class="marker-header" @click="isExpanded = !isExpanded">
      <span class="marker-icon">📍</span>
      <span class="marker-label">{{ marker.label || 'Unnamed Marker' }}</span>
      <span class="marker-coords">
        {{ marker.lat.toFixed(4) }}, {{ marker.lon.toFixed(4) }}
      </span>
      <span class="action-count">
        {{ marker.actions.length }} action{{ marker.actions.length !== 1 ? 's' : '' }}
      </span>
      <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
      <button 
        class="btn-icon-small danger" 
        @click.stop="$emit('remove')"
        title="Remove marker"
      >
        ✕
      </button>
    </div>
    
    <!-- Marker Body -->
    <div v-if="isExpanded" class="marker-body">
      <!-- Basic Info -->
      <div class="marker-section">
        <div class="section-title">Location</div>
        
        <div class="form-row">
          <label>Label</label>
          <input 
            v-model="marker.label" 
            type="text" 
            class="form-input"
            placeholder="Building A"
          />
        </div>
        
        <div class="coord-row">
          <div class="form-row">
            <label>Latitude</label>
            <input 
              v-model.number="marker.lat" 
              type="number" 
              class="form-input"
              step="any"
              placeholder="39.8283"
            />
          </div>
          <div class="form-row">
            <label>Longitude</label>
            <input 
              v-model.number="marker.lon" 
              type="number" 
              class="form-input"
              step="any"
              placeholder="-98.5795"
            />
          </div>
        </div>
        
        <button 
          type="button"
          class="btn-use-center"
          @click="$emit('use-center')"
        >
          📍 Use Map Center
        </button>
      </div>
      
      <!-- Actions -->
      <div class="marker-section">
        <div class="section-title">
          Actions
          <span class="section-hint">({{ marker.actions.length }})</span>
        </div>
        
        <div v-if="marker.actions.length === 0" class="empty-actions">
          No actions configured. Add an action to enable interactivity.
        </div>
        
        <div class="actions-list">
          <MarkerActionEditor
            v-for="(action, index) in marker.actions"
            :key="action.id"
            :action="action"
            :errors="actionErrors[index]"
            @remove="removeAction(index)"
          />
        </div>
        
        <div class="add-action-row">
          <button class="btn-add" @click="addAction('publish')">
            + Add Publish Action
          </button>
          <button class="btn-add switch" @click="addAction('switch')">
            + Add Switch Action
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import MarkerActionEditor from './MarkerActionEditor.vue'
import { createDefaultAction } from '@/types/dashboard'
import type { MapMarker, MapActionType } from '@/types/dashboard'

/**
 * Marker Editor Component
 * 
 * Grug say: Edit single marker with its location and actions.
 * Collapsible to keep UI manageable with many markers.
 */

const props = defineProps<{
  marker: MapMarker
  actionErrors?: Record<number, Record<string, string>>
}>()

defineEmits<{
  remove: []
  'use-center': []
}>()

const isExpanded = ref(true)

/**
 * Add new action to marker
 */
function addAction(type: MapActionType) {
  const action = createDefaultAction(type)
  props.marker.actions.push(action)
}

/**
 * Remove action from marker
 */
function removeAction(index: number) {
  props.marker.actions.splice(index, 1)
}
</script>

<style scoped>
.marker-editor {
  background: rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.marker-editor.is-expanded {
  border-color: var(--color-accent);
}

.marker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.2);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.marker-header:hover {
  background: rgba(0, 0, 0, 0.3);
}

.marker-icon {
  font-size: 18px;
  line-height: 1;
}

.marker-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marker-coords {
  font-size: 11px;
  font-family: var(--mono);
  color: var(--muted);
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
}

.action-count {
  font-size: 11px;
  color: var(--color-accent);
  background: var(--color-info-bg);
  padding: 2px 8px;
  border-radius: 10px;
}

.expand-icon {
  font-size: 10px;
  color: var(--muted);
  transition: transform 0.2s;
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

.marker-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  border-top: 1px solid var(--border);
}

.marker-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-hint {
  font-weight: 400;
  text-transform: none;
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

.coord-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 13px;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
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

.empty-actions {
  color: var(--muted);
  font-size: 13px;
  font-style: italic;
  text-align: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 6px;
}

.actions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.add-action-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-add {
  flex: 1;
  min-width: 140px;
  padding: 8px 12px;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 4px;
  color: var(--color-info);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add:hover {
  background: var(--color-info-bg);
  border-color: var(--color-info);
}

.btn-add.switch {
  color: var(--color-warning);
}

.btn-add.switch:hover {
  background: var(--color-warning-bg);
  border-color: var(--color-warning);
}

@media (max-width: 500px) {
  .coord-row {
    grid-template-columns: 1fr;
  }
  
  .marker-coords {
    display: none;
  }
  
  .add-action-row {
    flex-direction: column;
  }
  
  .btn-add {
    width: 100%;
  }
}
</style>
