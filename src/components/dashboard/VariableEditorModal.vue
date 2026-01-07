<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="modal">
      <div class="modal-header">
        <h3>Dashboard Variables</h3>
        <button class="close-btn" @click="close">✕</button>
      </div>
      
      <div class="modal-body">
        <div v-if="variables.length === 0" class="empty-state">
          No variables defined. Add one to create dynamic dashboards.
        </div>
        
        <div class="variables-list">
          <div v-for="(v, index) in variables" :key="v.id" class="variable-row">
            <div class="variable-summary" @click="toggleEdit(index)">
              <span class="var-name">{{ v.name }}</span>
              <span class="var-type">{{ v.type }}</span>
              <span class="var-default">{{ v.defaultValue }}</span>
              <button class="btn-icon danger" @click.stop="removeVariable(index)">✕</button>
            </div>
            
            <div v-if="editingIndex === index" class="variable-form">
              <div class="form-group">
                <label>Name (used in templates as <code>{{ formatUsage(v.name) }}</code>)</label>
                <input v-model="v.name" type="text" class="form-input" placeholder="device_id" />
              </div>
              
              <div class="form-group">
                <label>Label</label>
                <input v-model="v.label" type="text" class="form-input" placeholder="Device" />
              </div>
              
              <div class="form-group">
                <label>Type</label>
                <select v-model="v.type" class="form-input">
                  <option value="text">Text Input</option>
                  <option value="select">Dropdown</option>
                </select>
              </div>
              
              <div v-if="v.type === 'select'" class="form-group">
                <label>Options (comma separated)</label>
                <input 
                  :value="v.options?.join(', ')" 
                  @change="updateOptions(index, ($event.target as HTMLInputElement).value)"
                  @keyup.enter="($event.target as HTMLInputElement).blur()"
                  type="text" 
                  class="form-input" 
                  placeholder="prod, dev, stage" 
                />
                <div class="help-text">Type options separated by commas. Press Enter or click away to save.</div>
              </div>
              
              <div class="form-group">
                <label>Default Value</label>
                <input v-model="v.defaultValue" type="text" class="form-input" />
              </div>
              
              <button class="btn-secondary small" @click="saveVariable(index, v)">Done</button>
            </div>
          </div>
        </div>
        
        <button class="btn-add" @click="addVariable">
          + Add Variable
        </button>
      </div>
      
      <div class="modal-footer">
        <button class="btn-primary" @click="close">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { DashboardVariable } from '@/types/dashboard'

// Fixed: Removed unused 'const props =' assignment
defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const dashboardStore = useDashboardStore()
const editingIndex = ref<number | null>(null)

const variables = computed(() => dashboardStore.activeDashboard?.variables || [])

function addVariable() {
  const newVar: DashboardVariable = {
    id: Date.now().toString(),
    name: 'new_var',
    label: 'New Variable',
    type: 'text',
    defaultValue: '',
    options: []
  }
  dashboardStore.addVariable(newVar)
  editingIndex.value = variables.value.length - 1
}

function removeVariable(index: number) {
  if (confirm('Delete this variable?')) {
    dashboardStore.removeVariable(index)
    if (editingIndex.value === index) editingIndex.value = null
  }
}

function toggleEdit(index: number) {
  if (editingIndex.value === index) editingIndex.value = null
  else editingIndex.value = index
}

function updateOptions(index: number, value: string) {
  // Split by comma, trim whitespace, remove empty entries
  const opts = value.split(',').map(s => s.trim()).filter(s => s)
  const v = { ...variables.value[index], options: opts }
  dashboardStore.updateVariable(index, v)
}

function saveVariable(index: number, v: DashboardVariable) {
  dashboardStore.updateVariable(index, v)
  editingIndex.value = null
}

function close() {
  emit('update:modelValue', false)
  editingIndex.value = null
}

function formatUsage(name: string) {
  return `{{${name}}}`
}
</script>

<style scoped>
.modal-overlay {
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
}

.modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 { margin: 0; font-size: 18px; }

.close-btn {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 24px;
  cursor: pointer;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.empty-state {
  text-align: center;
  color: var(--muted);
  padding: 20px;
  font-style: italic;
}

.variables-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.variable-row {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.variable-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.1);
  cursor: pointer;
}

.variable-summary:hover {
  background: rgba(0, 0, 0, 0.2);
}

.var-name { font-weight: 600; color: var(--color-accent); flex: 1; }
.var-type { font-size: 11px; color: var(--muted); text-transform: uppercase; }
.var-default { font-size: 12px; color: var(--text); font-family: var(--mono); }

.variable-form {
  padding: 12px;
  background: var(--input-bg);
  border-top: 1px solid var(--border);
}

.btn-icon {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
}

.btn-icon.danger:hover { color: var(--color-error); }

.btn-add {
  width: 100%;
  padding: 8px;
  background: transparent;
  border: 1px dashed var(--border);
  color: var(--color-primary);
  border-radius: 6px;
  cursor: pointer;
}

.btn-add:hover {
  background: var(--color-primary-hover);
  color: white;
  border-style: solid;
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.btn-primary, .btn-secondary {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
}

.btn-primary { background: var(--color-primary); color: white; }
.btn-secondary { background: rgba(255, 255, 255, 0.1); color: var(--text); }
.small { font-size: 12px; padding: 4px 8px; }
</style>
