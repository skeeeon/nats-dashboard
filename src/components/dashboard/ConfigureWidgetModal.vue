<template>
  <div v-if="modelValue && widgetId" class="modal-overlay" @click.self="close">
    <div class="modal">
      <div class="modal-header">
        <h3>Configure Widget</h3>
        <button class="close-btn" @click="close">✕</button>
      </div>
      <div class="modal-body">
        <!-- Common Title -->
        <ConfigCommon :form="form" :errors="errors" />
        
        <!-- Data Source (Shared by visualization widgets) -->
        <ConfigDataSource 
          v-if="['text', 'chart', 'stat', 'gauge'].includes(widgetType || '')"
          :form="form" 
          :errors="errors" 
        />

        <!-- Widget Specific Configs -->
        <ConfigText 
          v-if="widgetType === 'text'" 
          :form="form" 
          :errors="errors" 
        />
        
        <ConfigChart 
          v-if="widgetType === 'chart'" 
          :form="form" 
          :errors="errors" 
        />
        
        <ConfigStat 
          v-if="widgetType === 'stat'" 
          :form="form" 
          :errors="errors" 
        />
        
        <ConfigGauge 
          v-if="widgetType === 'gauge'" 
          :form="form" 
          :errors="errors" 
        />
        
        <ConfigButton 
          v-if="widgetType === 'button'" 
          :form="form" 
          :errors="errors" 
        />
        
        <ConfigKv 
          v-if="widgetType === 'kv'" 
          :form="form" 
          :errors="errors" 
        />
        
        <ConfigSwitch 
          v-if="widgetType === 'switch'" 
          :form="form" 
          :errors="errors" 
        />
        
        <ConfigSlider 
          v-if="widgetType === 'slider'" 
          :form="form" 
          :errors="errors" 
        />
        
        <div class="modal-actions">
          <button class="btn-secondary" @click="close">
            Cancel
          </button>
          <button class="btn-primary" @click="save">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { useValidation } from '@/composables/useValidation'
import { useWidgetOperations } from '@/composables/useWidgetOperations'
import type { WidgetType, ThresholdRule } from '@/types/dashboard'
import type { WidgetFormState } from '@/types/config'

// Import sub-components
import ConfigCommon from './config/ConfigCommon.vue'
import ConfigDataSource from './config/ConfigDataSource.vue'
import ConfigText from './config/ConfigText.vue'
import ConfigChart from './config/ConfigChart.vue'
import ConfigStat from './config/ConfigStat.vue'
import ConfigGauge from './config/ConfigGauge.vue'
import ConfigButton from './config/ConfigButton.vue'
import ConfigKv from './config/ConfigKv.vue'
import ConfigSwitch from './config/ConfigSwitch.vue'
import ConfigSlider from './config/ConfigSlider.vue'

interface Props {
  modelValue: boolean
  widgetId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const dashboardStore = useDashboardStore()
const validator = useValidation()
const { updateWidgetConfiguration } = useWidgetOperations()

const form = ref<WidgetFormState>({
  title: '',
  subject: '',
  jsonPath: '',
  bufferSize: 100,
  kvBucket: '',
  kvKey: '',
  buttonLabel: '',
  buttonPayload: '',
  buttonColor: '',
  thresholds: [],
  switchMode: 'kv',
  switchDefaultState: 'off',
  switchStateSubject: '',
  switchOnPayload: '{"state": "on"}',
  switchOffPayload: '{"state": "off"}',
  switchLabelOn: 'ON',
  switchLabelOff: 'OFF',
  switchConfirm: false,
  sliderMode: 'core',
  sliderStateSubject: '',
  sliderValueTemplate: '{{value}}',
  sliderMin: 0,
  sliderMax: 100,
  sliderStep: 1,
  sliderDefault: 50,
  sliderUnit: '',
  sliderConfirm: false,
  statFormat: '',
  statUnit: '',
  statShowTrend: true,
  statTrendWindow: 10,
  gaugeMin: 0,
  gaugeMax: 100,
  gaugeUnit: '',
  gaugeZones: [],
})

const errors = ref<Record<string, string>>({})

/**
 * Get widget type
 */
const widgetType = computed<WidgetType | null>(() => {
  if (!props.widgetId) return null
  const widget = dashboardStore.getWidget(props.widgetId)
  return widget?.type || null
})

/**
 * Load widget data into form when widgetId changes
 */
watch(() => props.widgetId, (widgetId) => {
  if (!widgetId) return
  
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
  // Common fields
  let currentSubject = ''
  if (widget.type === 'button') {
    currentSubject = widget.buttonConfig?.publishSubject || ''
  } else if (widget.type === 'switch') {
    currentSubject = widget.switchConfig?.publishSubject || ''
  } else if (widget.type === 'slider') {
    currentSubject = widget.sliderConfig?.publishSubject || ''
  } else {
    currentSubject = widget.dataSource.subject || ''
  }

  // Load thresholds
  let currentThresholds: ThresholdRule[] = []
  if (widget.type === 'text') {
    currentThresholds = widget.textConfig?.thresholds ? [...widget.textConfig.thresholds] : []
  } else if (widget.type === 'kv') {
    currentThresholds = widget.kvConfig?.thresholds ? [...widget.kvConfig.thresholds] : []
  } else if (widget.type === 'stat') {
    currentThresholds = widget.statConfig?.thresholds ? [...widget.statConfig.thresholds] : []
  }

  // Load KV bucket/key from the right place based on widget type
  let currentKvBucket = ''
  let currentKvKey = ''
  
  if (widget.type === 'switch' && widget.switchConfig?.mode === 'kv') {
    currentKvBucket = widget.switchConfig.kvBucket || ''
    currentKvKey = widget.switchConfig.kvKey || ''
  } else if (widget.type === 'slider' && widget.sliderConfig?.mode === 'kv') {
    currentKvBucket = widget.sliderConfig.kvBucket || ''
    currentKvKey = widget.sliderConfig.kvKey || ''
  } else if (widget.type === 'kv') {
    currentKvBucket = widget.dataSource.kvBucket || ''
    currentKvKey = widget.dataSource.kvKey || ''
  }

  // Populate form
  form.value = {
    title: widget.title,
    subject: currentSubject,
    jsonPath: widget.jsonPath || '',
    bufferSize: widget.buffer.maxCount,
    kvBucket: currentKvBucket,
    kvKey: currentKvKey,
    buttonLabel: widget.buttonConfig?.label || '',
    buttonPayload: widget.buttonConfig?.payload || '',
    buttonColor: widget.buttonConfig?.color || '',
    thresholds: currentThresholds,
    
    // Switch
    switchMode: widget.switchConfig?.mode || 'kv',
    switchDefaultState: widget.switchConfig?.defaultState || 'off',
    switchStateSubject: widget.switchConfig?.stateSubject || '',
    switchOnPayload: JSON.stringify(widget.switchConfig?.onPayload || {state: 'on'}),
    switchOffPayload: JSON.stringify(widget.switchConfig?.offPayload || {state: 'off'}),
    switchLabelOn: widget.switchConfig?.labels?.on || 'ON',
    switchLabelOff: widget.switchConfig?.labels?.off || 'OFF',
    switchConfirm: widget.switchConfig?.confirmOnChange || false,
    
    // Slider
    sliderMode: widget.sliderConfig?.mode || 'core',
    sliderStateSubject: widget.sliderConfig?.stateSubject || '',
    sliderValueTemplate: widget.sliderConfig?.valueTemplate || '{{value}}',
    sliderMin: widget.sliderConfig?.min || 0,
    sliderMax: widget.sliderConfig?.max || 100,
    sliderStep: widget.sliderConfig?.step || 1,
    sliderDefault: widget.sliderConfig?.defaultValue || 50,
    sliderUnit: widget.sliderConfig?.unit || '',
    sliderConfirm: widget.sliderConfig?.confirmOnChange || false,
    
    // Stat
    statFormat: widget.statConfig?.format || '',
    statUnit: widget.statConfig?.unit || '',
    statShowTrend: widget.statConfig?.showTrend ?? true,
    statTrendWindow: widget.statConfig?.trendWindow || 10,
    
    // Gauge
    gaugeMin: widget.gaugeConfig?.min || 0,
    gaugeMax: widget.gaugeConfig?.max || 100,
    gaugeUnit: widget.gaugeConfig?.unit || '',
    gaugeZones: widget.gaugeConfig?.zones ? [...widget.gaugeConfig.zones] : [],
  }
  
  errors.value = {}
}, { immediate: true })

/**
 * Validate form based on widget type
 */
function validate(): boolean {
  errors.value = {}
  
  const widget = dashboardStore.getWidget(props.widgetId!)
  if (!widget) return false
  
  // Common validation
  const titleResult = validator.validateWidgetTitle(form.value.title)
  if (!titleResult.valid) errors.value.title = titleResult.error!
  
  // Type-specific validation
  if (['text', 'chart', 'stat', 'gauge'].includes(widget.type)) {
    const subjectResult = validator.validateSubject(form.value.subject)
    if (!subjectResult.valid) errors.value.subject = subjectResult.error!
    
    if (form.value.jsonPath) {
      const jsonResult = validator.validateJsonPath(form.value.jsonPath)
      if (!jsonResult.valid) errors.value.jsonPath = jsonResult.error!
    }
    
    const bufferResult = validator.validateBufferSize(form.value.bufferSize)
    if (!bufferResult.valid) errors.value.bufferSize = bufferResult.error!

  } else if (widget.type === 'button') {
    const subjectResult = validator.validateSubject(form.value.subject)
    if (!subjectResult.valid) errors.value.subject = subjectResult.error!
    
    if (!form.value.buttonLabel.trim()) {
      errors.value.buttonLabel = 'Label required'
    }
    
    if (form.value.buttonPayload) {
      const jsonResult = validator.validateJson(form.value.buttonPayload)
      if (!jsonResult.valid) errors.value.buttonPayload = jsonResult.error!
    }

  } else if (widget.type === 'kv') {
    const bucketResult = validator.validateKvBucket(form.value.kvBucket)
    if (!bucketResult.valid) errors.value.kvBucket = bucketResult.error!
    
    const keyResult = validator.validateKvKey(form.value.kvKey)
    if (!keyResult.valid) errors.value.kvKey = keyResult.error!
    
    if (form.value.jsonPath) {
      const jsonResult = validator.validateJsonPath(form.value.jsonPath)
      if (!jsonResult.valid) errors.value.jsonPath = jsonResult.error!
    }
    
  } else if (widget.type === 'switch') {
    if (form.value.switchMode === 'kv') {
      const bucketResult = validator.validateKvBucket(form.value.kvBucket)
      if (!bucketResult.valid) errors.value.kvBucket = bucketResult.error!
      
      const keyResult = validator.validateKvKey(form.value.kvKey)
      if (!keyResult.valid) errors.value.kvKey = keyResult.error!
    } else {
      // CORE mode requires publish subject
      const subjectResult = validator.validateSubject(form.value.subject)
      if (!subjectResult.valid) errors.value.subject = subjectResult.error!
    }
    
  } else if (widget.type === 'slider') {
    if (form.value.sliderMode === 'kv') {
      const bucketResult = validator.validateKvBucket(form.value.kvBucket)
      if (!bucketResult.valid) errors.value.kvBucket = bucketResult.error!
      
      const keyResult = validator.validateKvKey(form.value.kvKey)
      if (!keyResult.valid) errors.value.kvKey = keyResult.error!
    } else {
      // CORE mode requires publish subject
      const subjectResult = validator.validateSubject(form.value.subject)
      if (!subjectResult.valid) errors.value.subject = subjectResult.error!
    }
    
    if (form.value.jsonPath) {
      const jsonResult = validator.validateJsonPath(form.value.jsonPath)
      if (!jsonResult.valid) errors.value.jsonPath = jsonResult.error!
    }
  }
  
  return Object.keys(errors.value).length === 0
}

/**
 * Save widget configuration
 */
function save() {
  if (!props.widgetId) return
  
  if (!validate()) return
  
  const widget = dashboardStore.getWidget(props.widgetId)
  if (!widget) return
  
  // Build updates object
  const updates: any = { title: form.value.title.trim() }
  
  if (widget.type === 'text') {
    updates.dataSource = { ...widget.dataSource, subject: form.value.subject.trim() }
    updates.jsonPath = form.value.jsonPath.trim() || undefined
    updates.buffer = { maxCount: form.value.bufferSize }
    updates.textConfig = { 
      ...widget.textConfig,
      thresholds: [...form.value.thresholds]
    }
  } else if (widget.type === 'chart') {
    updates.dataSource = { ...widget.dataSource, subject: form.value.subject.trim() }
    updates.jsonPath = form.value.jsonPath.trim() || undefined
    updates.buffer = { maxCount: form.value.bufferSize }
  } else if (widget.type === 'button') {
    updates.buttonConfig = {
      label: form.value.buttonLabel.trim(),
      publishSubject: form.value.subject.trim(),
      payload: form.value.buttonPayload.trim() || '{}',
      color: form.value.buttonColor || undefined,
    }
  } else if (widget.type === 'kv') {
    updates.dataSource = {
      type: 'kv',
      kvBucket: form.value.kvBucket.trim(),
      kvKey: form.value.kvKey.trim(),
    }
    updates.jsonPath = form.value.jsonPath.trim() || undefined
    updates.kvConfig = {
      ...widget.kvConfig,
      thresholds: [...form.value.thresholds]
    }
  } else if (widget.type === 'switch') {
    updates.switchConfig = {
      mode: form.value.switchMode,
      ...(form.value.switchMode === 'kv' ? {
        // KV mode: only bucket and key needed
        kvBucket: form.value.kvBucket.trim(),
        kvKey: form.value.kvKey.trim(),
      } : {
        // CORE mode: publish subject and state tracking
        publishSubject: form.value.subject.trim(),
        defaultState: form.value.switchDefaultState,
        stateSubject: form.value.switchStateSubject.trim() || undefined,
      }),
      onPayload: JSON.parse(form.value.switchOnPayload),
      offPayload: JSON.parse(form.value.switchOffPayload),
      labels: {
        on: form.value.switchLabelOn.trim(),
        off: form.value.switchLabelOff.trim(),
      },
      confirmOnChange: form.value.switchConfirm,
    }
  } else if (widget.type === 'slider') {
    updates.jsonPath = form.value.jsonPath.trim() || undefined
    updates.sliderConfig = {
      mode: form.value.sliderMode,
      ...(form.value.sliderMode === 'kv' ? {
        kvBucket: form.value.kvBucket.trim(),
        kvKey: form.value.kvKey.trim(),
      } : {
        publishSubject: form.value.subject.trim(),
        stateSubject: form.value.sliderStateSubject.trim() || undefined,
      }),
      valueTemplate: form.value.sliderValueTemplate.trim() || '{{value}}',
      min: form.value.sliderMin,
      max: form.value.sliderMax,
      step: form.value.sliderStep,
      defaultValue: form.value.sliderDefault,
      unit: form.value.sliderUnit.trim(),
      confirmOnChange: form.value.sliderConfirm,
    }
  } else if (widget.type === 'stat') {
    updates.dataSource = { ...widget.dataSource, subject: form.value.subject.trim() }
    updates.jsonPath = form.value.jsonPath.trim() || undefined
    updates.buffer = { maxCount: form.value.bufferSize }
    updates.statConfig = {
      format: form.value.statFormat.trim() || undefined,
      unit: form.value.statUnit.trim() || undefined,
      showTrend: form.value.statShowTrend,
      trendWindow: form.value.statTrendWindow,
      thresholds: [...form.value.thresholds],
    }
  } else if (widget.type === 'gauge') {
    updates.dataSource = { ...widget.dataSource, subject: form.value.subject.trim() }
    updates.jsonPath = form.value.jsonPath.trim() || undefined
    updates.buffer = { maxCount: form.value.bufferSize }
    updates.gaugeConfig = {
      min: form.value.gaugeMin,
      max: form.value.gaugeMax,
      unit: form.value.gaugeUnit.trim() || undefined,
      zones: [...form.value.gaugeZones],
    }
  }
  
  // Use the safe update method from our composable
  updateWidgetConfiguration(props.widgetId, updates)
  
  emit('saved')
  close()
}

/**
 * Close modal
 */
function close() {
  emit('update:modelValue', false)
  errors.value = {}
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
  z-index: 1000;
}

.modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
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

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.close-btn {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 24px;
  cursor: pointer;
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--text);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.btn-primary,
.btn-secondary {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
