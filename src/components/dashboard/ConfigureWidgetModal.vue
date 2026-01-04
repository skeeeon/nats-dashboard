<template>
  <div v-if="modelValue && widgetId" class="modal-overlay" @click.self="close">
    <div class="modal">
      <div class="modal-header">
        <h3>Configure Widget</h3>
        <button class="close-btn" @click="close">✕</button>
      </div>
      <div class="modal-body">
        <!-- Widget Title (common to all types) -->
        <div class="form-group">
          <label>Widget Title</label>
          <input 
            v-model="form.title" 
            type="text" 
            class="form-input"
            :class="{ 'has-error': errors.title }"
            placeholder="My Widget"
          />
          <div v-if="errors.title" class="error-text">
            {{ errors.title }}
          </div>
        </div>
        
        <!-- Text & Chart & Stat & Gauge Widget Config (Data Widgets) -->
        <template v-if="['text', 'chart', 'stat', 'gauge'].includes(widgetType || '')">
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

          <!-- Text Widget Specific -->
          <template v-if="widgetType === 'text'">
            <div class="form-group">
              <label>Conditional Formatting</label>
              <ThresholdEditor v-model="form.thresholds" />
            </div>
          </template>

          <!-- Stat Widget Specific -->
          <template v-if="widgetType === 'stat'">
            <div class="form-group">
              <label>Format (optional)</label>
              <input 
                v-model="form.statFormat" 
                type="text" 
                class="form-input"
                placeholder="{value}°C"
              />
              <div class="help-text">
                Use {value} as placeholder. Example: "{value}°C" or "$%{value}"
              </div>
            </div>

            <div class="form-group">
              <label>Unit (optional)</label>
              <input 
                v-model="form.statUnit" 
                type="text" 
                class="form-input"
                placeholder="°C, MB, req/s"
              />
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="form.statShowTrend" />
                <span>Show trend indicator</span>
              </label>
            </div>

            <div v-if="form.statShowTrend" class="form-group">
              <label>Trend Window (messages)</label>
              <input 
                v-model.number="form.statTrendWindow" 
                type="number" 
                class="form-input"
                min="2"
                max="100"
                placeholder="10"
              />
              <div class="help-text">
                Compare current value to N messages ago
              </div>
            </div>

            <div class="form-group">
              <label>Conditional Formatting</label>
              <ThresholdEditor v-model="form.thresholds" />
            </div>
          </template>

          <!-- Gauge Widget Specific -->
          <template v-if="widgetType === 'gauge'">
            <div class="form-group">
              <label>Gauge Range</label>
              <div class="range-inputs">
                <div class="range-input-group">
                  <label class="range-label">Min</label>
                  <input 
                    v-model.number="form.gaugeMin" 
                    type="number" 
                    class="form-input"
                    placeholder="0"
                    step="any"
                  />
                </div>
                <div class="range-input-group">
                  <label class="range-label">Max</label>
                  <input 
                    v-model.number="form.gaugeMax" 
                    type="number" 
                    class="form-input"
                    placeholder="100"
                    step="any"
                  />
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>Unit (optional)</label>
              <input 
                v-model="form.gaugeUnit" 
                type="text" 
                class="form-input"
                placeholder="%, °C, RPM"
              />
            </div>

            <div class="form-group">
              <label>Color Zones</label>
              <GaugeZoneEditor v-model="form.gaugeZones" />
              <div class="help-text">
                Define color ranges for different value zones
              </div>
            </div>
          </template>
        </template>
        
        <!-- Button Widget Config -->
        <template v-if="widgetType === 'button'">
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
        </template>
        
        <!-- KV Widget Config -->
        <template v-if="widgetType === 'kv'">
          <div class="form-group">
            <label>KV Bucket Name</label>
            <input 
              v-model="form.kvBucket" 
              type="text" 
              class="form-input"
              :class="{ 'has-error': errors.kvBucket }"
              placeholder="my-bucket"
            />
            <div v-if="errors.kvBucket" class="error-text">
              {{ errors.kvBucket }}
            </div>
          </div>
          
          <div class="form-group">
            <label>KV Key</label>
            <input 
              v-model="form.kvKey" 
              type="text" 
              class="form-input"
              :class="{ 'has-error': errors.kvKey }"
              placeholder="app.version"
            />
            <div v-if="errors.kvKey" class="error-text">
              {{ errors.kvKey }}
            </div>
          </div>

          <div class="form-group">
            <label>JSONPath Filter (optional)</label>
            <input 
              v-model="form.jsonPath" 
              type="text" 
              class="form-input"
              :class="{ 'has-error': errors.jsonPath }"
              placeholder="$.data.value"
            />
            <div v-if="errors.jsonPath" class="error-text">
              {{ errors.jsonPath }}
            </div>
            <div v-else class="help-text">
              Extract specific data from JSON values
            </div>
          </div>

          <div class="form-group">
            <label>Conditional Formatting (Single Value Mode)</label>
            <ThresholdEditor v-model="form.thresholds" />
          </div>
        </template>

        <!-- Switch Widget Config -->
        <template v-if="widgetType === 'switch'">
          <div class="form-group">
            <label>Mode</label>
            <select v-model="form.switchMode" class="form-input">
              <option value="kv">KV (Stateful)</option>
              <option value="core">CORE (Pub/Sub)</option>
            </select>
            <div class="help-text">
              KV mode writes directly to KV store. CORE mode uses pub/sub messaging.
            </div>
          </div>

          <!-- KV Mode Fields -->
          <template v-if="form.switchMode === 'kv'">
            <div class="form-group">
              <label>KV Bucket</label>
              <input 
                v-model="form.kvBucket" 
                type="text" 
                class="form-input"
                :class="{ 'has-error': errors.kvBucket }"
                placeholder="device-states"
              />
              <div v-if="errors.kvBucket" class="error-text">
                {{ errors.kvBucket }}
              </div>
              <div v-else class="help-text">
                Bucket where switch state will be stored
              </div>
            </div>

            <div class="form-group">
              <label>KV Key</label>
              <input 
                v-model="form.kvKey" 
                type="text" 
                class="form-input"
                :class="{ 'has-error': errors.kvKey }"
                placeholder="device.switch"
              />
              <div v-if="errors.kvKey" class="error-text">
                {{ errors.kvKey }}
              </div>
              <div v-else class="help-text">
                Key to store switch state (will be watched for changes)
              </div>
            </div>
          </template>

          <!-- CORE Mode Fields -->
          <template v-if="form.switchMode === 'core'">
            <div class="form-group">
              <label>Publish Subject</label>
              <input 
                v-model="form.subject" 
                type="text" 
                class="form-input"
                :class="{ 'has-error': errors.subject }"
                placeholder="device.control"
              />
              <div v-if="errors.subject" class="error-text">
                {{ errors.subject }}
              </div>
              <div v-else class="help-text">
                Subject to publish control commands
              </div>
            </div>

            <div class="form-group">
              <label>State Subject (optional)</label>
              <input 
                v-model="form.switchStateSubject" 
                type="text" 
                class="form-input"
                placeholder="device.state (leave empty to use publish subject)"
              />
              <div class="help-text">
                Subject to subscribe for state confirmation. Defaults to publish subject if empty.
              </div>
            </div>

            <div class="form-group">
              <label>Default State</label>
              <select v-model="form.switchDefaultState" class="form-input">
                <option value="off">OFF</option>
                <option value="on">ON</option>
              </select>
              <div class="help-text">
                Initial state to display before receiving state updates
              </div>
            </div>
          </template>

          <div class="form-group">
            <label>ON Payload</label>
            <textarea 
              v-model="form.switchOnPayload" 
              class="form-textarea"
              rows="3"
              placeholder='{"state": "on"}'
            />
          </div>

          <div class="form-group">
            <label>OFF Payload</label>
            <textarea 
              v-model="form.switchOffPayload" 
              class="form-textarea"
              rows="3"
              placeholder='{"state": "off"}'
            />
          </div>

          <div class="form-group">
            <label>Labels</label>
            <div class="label-inputs">
              <input 
                v-model="form.switchLabelOn" 
                type="text" 
                class="form-input"
                placeholder="ON"
              />
              <input 
                v-model="form.switchLabelOff" 
                type="text" 
                class="form-input"
                placeholder="OFF"
              />
            </div>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.switchConfirm" />
              <span>Require confirmation before changing state</span>
            </label>
          </div>
        </template>

        <!-- Slider Widget Config -->
        <template v-if="widgetType === 'slider'">
          <div class="form-group">
            <label>Publish Subject</label>
            <input 
              v-model="form.subject" 
              type="text" 
              class="form-input"
              :class="{ 'has-error': errors.subject }"
              placeholder="device.slider"
            />
            <div v-if="errors.subject" class="error-text">
              {{ errors.subject }}
            </div>
          </div>

          <div class="form-group">
            <label>Range</label>
            <div class="range-inputs">
              <div class="range-input-group">
                <label class="range-label">Min</label>
                <input 
                  v-model.number="form.sliderMin" 
                  type="number" 
                  class="form-input"
                  placeholder="0"
                  step="any"
                />
              </div>
              <div class="range-input-group">
                <label class="range-label">Max</label>
                <input 
                  v-model.number="form.sliderMax" 
                  type="number" 
                  class="form-input"
                  placeholder="100"
                  step="any"
                />
              </div>
              <div class="range-input-group">
                <label class="range-label">Step</label>
                <input 
                  v-model.number="form.sliderStep" 
                  type="number" 
                  class="form-input"
                  placeholder="1"
                  step="any"
                />
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>Default Value</label>
            <input 
              v-model.number="form.sliderDefault" 
              type="number" 
              class="form-input"
              placeholder="50"
              step="any"
            />
          </div>

          <div class="form-group">
            <label>Unit (optional)</label>
            <input 
              v-model="form.sliderUnit" 
              type="text" 
              class="form-input"
              placeholder="%, °C, dB"
            />
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.sliderConfirm" />
              <span>Require confirmation before publishing value</span>
            </label>
          </div>
        </template>
        
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
import ThresholdEditor from './ThresholdEditor.vue'
import GaugeZoneEditor from './GaugeZoneEditor.vue'
import type { WidgetType, ThresholdRule } from '@/types/dashboard'

/**
 * Configure Widget Modal Component
 * 
 * Grug say: Big modal with forms for configuring all 8 widget types.
 * Each widget type has different fields.
 * Validate before saving.
 * 
 * COMPLETE: Now includes Switch, Slider, Stat, and Gauge widgets!
 * FIXED: Switch KV mode fields now properly load from switchConfig
 */

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

// Form state - extended to support all widget types
interface FormState {
  // Common
  title: string
  subject: string
  jsonPath: string
  bufferSize: number
  
  // KV Widget
  kvBucket: string
  kvKey: string
  
  // Button Widget
  buttonLabel: string
  buttonPayload: string
  
  // Thresholds (Text, KV, Stat)
  thresholds: ThresholdRule[]
  
  // Switch Widget
  switchMode: 'kv' | 'core'
  switchDefaultState: 'on' | 'off'
  switchStateSubject: string
  switchOnPayload: string
  switchOffPayload: string
  switchLabelOn: string
  switchLabelOff: string
  switchConfirm: boolean
  
  // Slider Widget
  sliderMin: number
  sliderMax: number
  sliderStep: number
  sliderDefault: number
  sliderUnit: string
  sliderConfirm: boolean
  
  // Stat Widget
  statFormat: string
  statUnit: string
  statShowTrend: boolean
  statTrendWindow: number
  
  // Gauge Widget
  gaugeMin: number
  gaugeMax: number
  gaugeUnit: string
  gaugeZones: Array<{ min: number; max: number; color: string }>
}

const form = ref<FormState>({
  title: '',
  subject: '',
  jsonPath: '',
  bufferSize: 100,
  kvBucket: '',
  kvKey: '',
  buttonLabel: '',
  buttonPayload: '',
  thresholds: [],
  switchMode: 'kv',
  switchDefaultState: 'off',
  switchStateSubject: '',
  switchOnPayload: '{"state": "on"}',
  switchOffPayload: '{"state": "off"}',
  switchLabelOn: 'ON',
  switchLabelOff: 'OFF',
  switchConfirm: false,
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
 * FIXED: Now properly loads KV bucket/key for switch widgets
 */
watch(() => props.widgetId, (widgetId) => {
  if (!widgetId) return
  
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
  // Common fields
  let currentSubject = ''
  if (widget.type === 'button') {
    currentSubject = widget.buttonConfig?.publishSubject || ''
  } else if (widget.type === 'switch' || widget.type === 'slider') {
    currentSubject = widget.switchConfig?.publishSubject || widget.sliderConfig?.publishSubject || ''
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

  // FIXED: Load KV bucket/key from the right place based on widget type
  let currentKvBucket = ''
  let currentKvKey = ''
  
  if (widget.type === 'switch' && widget.switchConfig?.mode === 'kv') {
    // For switch in KV mode, load from switchConfig
    currentKvBucket = widget.switchConfig.kvBucket || ''
    currentKvKey = widget.switchConfig.kvKey || ''
  } else if (widget.type === 'kv') {
    // For KV widget, load from dataSource
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
    const subjectResult = validator.validateSubject(form.value.subject)
    if (!subjectResult.valid) errors.value.subject = subjectResult.error!
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
    updates.sliderConfig = {
      publishSubject: form.value.subject.trim(),
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
  
  dashboardStore.updateWidget(props.widgetId, updates)
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

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 14px;
  transition: border-color 0.2s;
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
  font-family: var(--mono);
}

.help-text {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
  line-height: 1.4;
}

.error-text {
  font-size: 12px;
  color: var(--color-error);
  margin-top: 4px;
}

/* Checkbox */
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: normal;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--color-primary);
}

/* Range inputs for Slider/Gauge */
.range-inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
}

.range-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.range-label {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}

/* Label inputs for Switch */
.label-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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
