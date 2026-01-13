<!-- src/components/dashboard/ConfigureWidgetModal.vue -->
<template>
  <div v-if="modelValue && widgetId" class="modal-overlay" @click.self="close">
    <div class="modal" :class="{ 'modal-large': widgetType === 'map' }">
      <div class="modal-header">
        <h3>Configure Widget</h3>
        <button class="close-btn" @click="close">✕</button>
      </div>
      <div class="modal-body">
        <!-- Common Title -->
        <ConfigCommon :form="form" :errors="errors" />
        
        <!-- Data Source (Shared by visualization widgets) -->
        <ConfigDataSource 
          v-if="['text', 'chart', 'stat', 'gauge', 'console'].includes(widgetType || '')"
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
        
        <ConfigMap 
          v-if="widgetType === 'map'" 
          :form="form" 
          :errors="errors" 
        />

        <ConfigConsole
          v-if="widgetType === 'console'"
          :form="form"
          :errors="errors"
        />

        <ConfigPublisher
          v-if="widgetType === 'publisher'"
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
import type { WidgetType, ThresholdRule, MapMarker } from '@/types/dashboard'
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
import ConfigMap from './config/ConfigMap.vue'
import ConfigConsole from './config/ConfigConsole.vue'
import ConfigPublisher from './config/ConfigPublisher.vue'

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
  buttonActionType: 'publish',
  buttonTimeout: 1000,
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
  mapCenterLat: 39.8283,
  mapCenterLon: -98.5795,
  mapZoom: 4,
  mapMarkers: [],
  consoleFontSize: 12,
  consoleShowTimestamp: true,
  publisherDefaultSubject: '',
  publisherDefaultPayload: '',
  publisherTimeout: 2000,
  
  // JetStream Defaults
  useJetStream: false,
  deliverPolicy: 'last',
  jetstreamTimeWindow: '10m'
})

const errors = ref<Record<string, string>>({})

const widgetType = computed<WidgetType | null>(() => {
  if (!props.widgetId) return null
  const widget = dashboardStore.getWidget(props.widgetId)
  return widget?.type || null
})

watch(() => props.widgetId, (widgetId) => {
  if (!widgetId) return
  
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
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

  let currentThresholds: ThresholdRule[] = []
  if (widget.type === 'text') {
    currentThresholds = widget.textConfig?.thresholds ? [...widget.textConfig.thresholds] : []
  } else if (widget.type === 'kv') {
    currentThresholds = widget.kvConfig?.thresholds ? [...widget.kvConfig.thresholds] : []
  } else if (widget.type === 'stat') {
    currentThresholds = widget.statConfig?.thresholds ? [...widget.statConfig.thresholds] : []
  }

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

  let mapCenterLat = 39.8283
  let mapCenterLon = -98.5795
  let mapZoom = 4
  let mapMarkers: MapMarker[] = []

  if (widget.type === 'map' && widget.mapConfig) {
    mapCenterLat = widget.mapConfig.center?.lat ?? 39.8283
    mapCenterLon = widget.mapConfig.center?.lon ?? -98.5795
    mapZoom = widget.mapConfig.zoom ?? 4
    mapMarkers = JSON.parse(JSON.stringify(widget.mapConfig.markers || []))
  }

  let consoleFontSize = 12
  let consoleShowTimestamp = true

  if (widget.type === 'console' && widget.consoleConfig) {
    consoleFontSize = widget.consoleConfig.fontSize ?? 12
    consoleShowTimestamp = widget.consoleConfig.showTimestamp ?? true
  }

  let publisherDefaultSubject = ''
  let publisherDefaultPayload = ''
  let publisherTimeout = 2000

  if (widget.type === 'publisher' && widget.publisherConfig) {
    publisherDefaultSubject = widget.publisherConfig.defaultSubject || ''
    publisherDefaultPayload = widget.publisherConfig.defaultPayload || ''
    publisherTimeout = widget.publisherConfig.timeout || 2000
  }

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
    buttonActionType: widget.buttonConfig?.actionType || 'publish',
    buttonTimeout: widget.buttonConfig?.timeout || 1000,
    thresholds: currentThresholds,
    switchMode: widget.switchConfig?.mode || 'kv',
    switchDefaultState: widget.switchConfig?.defaultState || 'off',
    switchStateSubject: widget.switchConfig?.stateSubject || '',
    switchOnPayload: JSON.stringify(widget.switchConfig?.onPayload || {state: 'on'}),
    switchOffPayload: JSON.stringify(widget.switchConfig?.offPayload || {state: 'off'}),
    switchLabelOn: widget.switchConfig?.labels?.on || 'ON',
    switchLabelOff: widget.switchConfig?.labels?.off || 'OFF',
    switchConfirm: widget.switchConfig?.confirmOnChange || false,
    sliderMode: widget.sliderConfig?.mode || 'core',
    sliderStateSubject: widget.sliderConfig?.stateSubject || '',
    sliderValueTemplate: widget.sliderConfig?.valueTemplate || '{{value}}',
    sliderMin: widget.sliderConfig?.min || 0,
    sliderMax: widget.sliderConfig?.max || 100,
    sliderStep: widget.sliderConfig?.step || 1,
    sliderDefault: widget.sliderConfig?.defaultValue || 50,
    sliderUnit: widget.sliderConfig?.unit || '',
    sliderConfirm: widget.sliderConfig?.confirmOnChange || false,
    statFormat: widget.statConfig?.format || '',
    statUnit: widget.statConfig?.unit || '',
    statShowTrend: widget.statConfig?.showTrend ?? true,
    statTrendWindow: widget.statConfig?.trendWindow || 10,
    gaugeMin: widget.gaugeConfig?.min || 0,
    gaugeMax: widget.gaugeConfig?.max || 100,
    gaugeUnit: widget.gaugeConfig?.unit || '',
    gaugeZones: widget.gaugeConfig?.zones ? [...widget.gaugeConfig.zones] : [],
    mapCenterLat,
    mapCenterLon,
    mapZoom,
    mapMarkers,
    consoleFontSize,
    consoleShowTimestamp,
    publisherDefaultSubject,
    publisherDefaultPayload,
    publisherTimeout,
    
    // JetStream Props
    useJetStream: widget.dataSource.useJetStream || false,
    deliverPolicy: widget.dataSource.deliverPolicy || 'last',
    jetstreamTimeWindow: widget.dataSource.timeWindow || '10m'
  }
  
  errors.value = {}
}, { immediate: true })

function validate(): boolean {
  errors.value = {}
  const widget = dashboardStore.getWidget(props.widgetId!)
  if (!widget) return false
  
  const titleResult = validator.validateWidgetTitle(form.value.title)
  if (!titleResult.valid) errors.value.title = titleResult.error!
  
  if (['text', 'chart', 'stat', 'gauge', 'console'].includes(widget.type)) {
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
    if (!form.value.buttonLabel.trim()) errors.value.buttonLabel = 'Label required'
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

function save() {
  if (!props.widgetId) return
  if (!validate()) return
  
  const widget = dashboardStore.getWidget(props.widgetId)
  if (!widget) return
  
  const updates: any = { title: form.value.title.trim() }
  
  if (['text', 'chart', 'stat', 'gauge', 'console'].includes(widget.type)) {
    updates.dataSource = { 
      ...widget.dataSource, 
      subject: form.value.subject.trim(),
      useJetStream: form.value.useJetStream,
      deliverPolicy: form.value.deliverPolicy,
      timeWindow: form.value.jetstreamTimeWindow
    }
    updates.jsonPath = form.value.jsonPath.trim() || undefined
    updates.buffer = { maxCount: form.value.bufferSize }
  }
  
  if (widget.type === 'text') {
    updates.textConfig = { ...widget.textConfig, thresholds: [...form.value.thresholds] }
  } else if (widget.type === 'button') {
    updates.buttonConfig = {
      label: form.value.buttonLabel.trim(),
      publishSubject: form.value.subject.trim(),
      payload: form.value.buttonPayload.trim() || '{}',
      color: form.value.buttonColor || undefined,
      actionType: form.value.buttonActionType,
      timeout: form.value.buttonTimeout
    }
  } else if (widget.type === 'kv') {
    updates.dataSource = {
      type: 'kv',
      kvBucket: form.value.kvBucket.trim(),
      kvKey: form.value.kvKey.trim(),
    }
    updates.jsonPath = form.value.jsonPath.trim() || undefined
    updates.kvConfig = { ...widget.kvConfig, thresholds: [...form.value.thresholds] }
  } else if (widget.type === 'switch') {
    updates.switchConfig = {
      mode: form.value.switchMode,
      ...(form.value.switchMode === 'kv' ? {
        kvBucket: form.value.kvBucket.trim(),
        kvKey: form.value.kvKey.trim(),
      } : {
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
    updates.statConfig = {
      format: form.value.statFormat.trim() || undefined,
      unit: form.value.statUnit.trim() || undefined,
      showTrend: form.value.statShowTrend,
      trendWindow: form.value.statTrendWindow,
      thresholds: [...form.value.thresholds],
    }
  } else if (widget.type === 'gauge') {
    updates.gaugeConfig = {
      min: form.value.gaugeMin,
      max: form.value.gaugeMax,
      unit: form.value.gaugeUnit.trim() || undefined,
      zones: [...form.value.gaugeZones],
    }
  } else if (widget.type === 'map') {
    updates.mapConfig = {
      center: { lat: form.value.mapCenterLat, lon: form.value.mapCenterLon },
      zoom: form.value.mapZoom,
      markers: JSON.parse(JSON.stringify(form.value.mapMarkers)),
    }
  } else if (widget.type === 'console') {
    updates.consoleConfig = {
      fontSize: form.value.consoleFontSize,
      showTimestamp: form.value.consoleShowTimestamp
    }
  } else if (widget.type === 'publisher') {
    const currentHistory = widget.publisherConfig?.history || []
    updates.publisherConfig = {
      defaultSubject: form.value.publisherDefaultSubject.trim(),
      defaultPayload: form.value.publisherDefaultPayload,
      history: currentHistory,
      timeout: form.value.publisherTimeout
    }
  }
  
  updateWidgetConfiguration(props.widgetId, updates)
  emit('saved')
  close()
}

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

.modal.modal-large {
  max-width: 800px;
  max-height: 90vh;
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
