<template>
  <div class="dashboard-view">
    <!-- Top toolbar -->
    <div class="dashboard-toolbar">
      <div class="toolbar-left">
        <h1 class="dashboard-name">
          {{ dashboardStore.activeDashboard?.name || 'Dashboard' }}
        </h1>
        <div v-if="natsStore.isConnected" class="connection-status connected">
          <div class="status-dot"></div>
          <span>Connected</span>
          <span v-if="natsStore.rtt" class="rtt">{{ natsStore.rtt }}ms</span>
        </div>
        <div v-else class="connection-status disconnected">
          <div class="status-dot"></div>
          <span>Disconnected</span>
        </div>
      </div>
      
      <div class="toolbar-right">
        <button 
          class="btn-icon" 
          :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`"
          @click="toggleTheme"
        >
          {{ theme === 'dark' ? '☀️' : '🌙' }}
        </button>
        <button class="btn-primary" @click="showAddWidget = true">
          + Add Widget
        </button>
        <button class="btn-secondary" @click="$router.push('/settings')">
          ⚙️ Settings
        </button>
      </div>
    </div>
    
    <!-- Grid with widgets -->
    <div class="dashboard-content">
      <DashboardGrid
        :widgets="dashboardStore.activeWidgets"
        @delete-widget="handleDeleteWidget"
        @configure-widget="handleConfigureWidget"
        @duplicate-widget="handleDuplicateWidget"
        @fullscreen-widget="toggleFullScreen"
      />
    </div>
    
    <!-- Add Widget Modal -->
    <div v-if="showAddWidget" class="modal-overlay" @click.self="showAddWidget = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Add Widget</h3>
          <button class="close-btn" @click="showAddWidget = false">✕</button>
        </div>
        <div class="modal-body">
          <p>Select widget type to add:</p>
          <div class="widget-type-buttons">
            <button class="widget-type-btn" @click="addTestWidget('text')">
              <div class="widget-type-icon">📝</div>
              <div class="widget-type-name">Text Widget</div>
              <div class="widget-type-desc">Display latest value</div>
            </button>
            <button class="widget-type-btn" @click="addTestWidget('chart')">
              <div class="widget-type-icon">📈</div>
              <div class="widget-type-name">Chart Widget</div>
              <div class="widget-type-desc">Line chart over time</div>
            </button>
            <button class="widget-type-btn" @click="addTestWidget('button')">
              <div class="widget-type-icon">📤</div>
              <div class="widget-type-name">Button Widget</div>
              <div class="widget-type-desc">Publish messages</div>
            </button>
            <button class="widget-type-btn" @click="addTestWidget('kv')">
              <div class="widget-type-icon">🗄️</div>
              <div class="widget-type-name">KV Widget</div>
              <div class="widget-type-desc">Display KV values</div>
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Configure Widget Modal -->
    <div v-if="showConfigWidget" class="modal-overlay" @click.self="showConfigWidget = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Configure Widget</h3>
          <button class="close-btn" @click="showConfigWidget = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Widget Title</label>
            <input 
              v-model="configForm.title" 
              type="text" 
              class="form-input"
              :class="{ 'has-error': validationErrors.title }"
              placeholder="My Widget"
            />
            <div v-if="validationErrors.title" class="error-text">
              {{ validationErrors.title }}
            </div>
          </div>
          
          <!-- Text & Chart Widget Config -->
          <template v-if="configWidgetType === 'text' || configWidgetType === 'chart'">
            <div class="form-group">
              <label>NATS Subject</label>
              <input 
                v-model="configForm.subject" 
                type="text" 
                class="form-input"
                :class="{ 'has-error': validationErrors.subject }"
                placeholder="sensors.temperature"
              />
              <div v-if="validationErrors.subject" class="error-text">
                {{ validationErrors.subject }}
              </div>
              <div v-else class="help-text">
                NATS subject pattern to subscribe to
              </div>
            </div>
            
            <div class="form-group">
              <label>JSONPath (optional)</label>
              <input 
                v-model="configForm.jsonPath" 
                type="text" 
                class="form-input"
                :class="{ 'has-error': validationErrors.jsonPath }"
                placeholder="$.value or $.sensors[0].temp"
              />
              <div v-if="validationErrors.jsonPath" class="error-text">
                {{ validationErrors.jsonPath }}
              </div>
              <div v-else class="help-text">
                Extract specific data from messages. Leave empty to show full message.
              </div>
            </div>
            
            <div class="form-group">
              <label>Buffer Size</label>
              <input 
                v-model.number="configForm.bufferSize" 
                type="number" 
                class="form-input"
                :class="{ 'has-error': validationErrors.bufferSize }"
                min="10"
                max="1000"
              />
              <div v-if="validationErrors.bufferSize" class="error-text">
                {{ validationErrors.bufferSize }}
              </div>
              <div v-else class="help-text">
                Number of messages to keep in history (10-1000)
              </div>
            </div>
          </template>
          
          <!-- Button Widget Config -->
          <template v-if="configWidgetType === 'button'">
            <div class="form-group">
              <label>Button Label</label>
              <input 
                v-model="configForm.buttonLabel" 
                type="text" 
                class="form-input"
                :class="{ 'has-error': validationErrors.buttonLabel }"
                placeholder="Send Message"
              />
              <div v-if="validationErrors.buttonLabel" class="error-text">
                {{ validationErrors.buttonLabel }}
              </div>
              <div v-else class="help-text">
                Text displayed on the button
              </div>
            </div>
            
            <div class="form-group">
              <label>Publish Subject</label>
              <input 
                v-model="configForm.subject" 
                type="text" 
                class="form-input"
                :class="{ 'has-error': validationErrors.subject }"
                placeholder="button.clicked"
              />
              <div v-if="validationErrors.subject" class="error-text">
                {{ validationErrors.subject }}
              </div>
              <div v-else class="help-text">
                NATS subject to publish to when clicked
              </div>
            </div>
            
            <div class="form-group">
              <label>Message Payload</label>
              <textarea 
                v-model="configForm.buttonPayload" 
                class="form-textarea"
                :class="{ 'has-error': validationErrors.buttonPayload }"
                rows="6"
                placeholder='{"action": "clicked"}'
              />
              <div v-if="validationErrors.buttonPayload" class="error-text">
                {{ validationErrors.buttonPayload }}
              </div>
              <div v-else class="help-text">
                Data to send (JSON, string, number, boolean, etc.)
              </div>
            </div>
          </template>
          
          <!-- KV Widget Config -->
          <template v-if="configWidgetType === 'kv'">
            <div class="form-group">
              <label>KV Bucket Name</label>
              <input 
                v-model="configForm.kvBucket" 
                type="text" 
                class="form-input"
                :class="{ 'has-error': validationErrors.kvBucket }"
                placeholder="my-bucket"
              />
              <div v-if="validationErrors.kvBucket" class="error-text">
                {{ validationErrors.kvBucket }}
              </div>
              <div v-else class="help-text">
                Name of the KV bucket (e.g., "config", "twin")
              </div>
            </div>
            
            <div class="form-group">
              <label>KV Key</label>
              <input 
                v-model="configForm.kvKey" 
                type="text" 
                class="form-input"
                :class="{ 'has-error': validationErrors.kvKey }"
                placeholder="app.version"
              />
              <div v-if="validationErrors.kvKey" class="error-text">
                {{ validationErrors.kvKey }}
              </div>
              <div v-else class="help-text">
                Key within the bucket (e.g., "app.version", "location.bldg-home.test")
              </div>
            </div>
          </template>
          
          <div class="modal-actions">
            <button class="btn-secondary" @click="showConfigWidget = false">
              Cancel
            </button>
            <button class="btn-primary" @click="saveWidgetConfig">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Full-Screen Widget Modal -->
    <div v-if="fullScreenWidgetId && fullScreenWidget" class="fullscreen-modal" @click.self="exitFullScreen">
      <div class="fullscreen-container">
        <div class="fullscreen-header">
          <div class="fullscreen-title">{{ fullScreenWidget.title }}</div>
          <button class="close-btn" title="Exit full screen (Esc)" @click="exitFullScreen">✕</button>
        </div>
        <div class="fullscreen-body">
          <!-- Render the widget component directly -->
          <component
            v-if="fullScreenWidget.type === 'text'"
            :is="TextWidget"
            :config="fullScreenWidget"
          />
          <component
            v-else-if="fullScreenWidget.type === 'chart'"
            :is="ChartWidget"
            :config="fullScreenWidget"
          />
          <component
            v-else-if="fullScreenWidget.type === 'button'"
            :is="ButtonWidget"
            :config="fullScreenWidget"
          />
          <component
            v-else-if="fullScreenWidget.type === 'kv'"
            :is="KvWidget"
            :config="fullScreenWidget"
          />
        </div>
        <div class="fullscreen-hint">
          Press <kbd>Esc</kbd> to exit full screen
        </div>
      </div>
    </div>
    
    <!-- Debug Panel (Performance Monitoring) -->
    <DebugPanel />
  </div>
</template>

<script setup lang="ts">
// ... (script content remains largely the same, just imports updated components)
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { useWidgetDataStore } from '@/stores/widgetData'
import { getSubscriptionManager } from '@/composables/useSubscriptionManager'
import { useValidation } from '@/composables/useValidation'
import { useTheme } from '@/composables/useTheme'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import DashboardGrid from '@/components/dashboard/DashboardGrid.vue'
import DebugPanel from '@/components/common/DebugPanel.vue'
import TextWidget from '@/components/widgets/TextWidget.vue'
import ChartWidget from '@/components/widgets/ChartWidget.vue'
import ButtonWidget from '@/components/widgets/ButtonWidget.vue'
import KvWidget from '@/components/widgets/KvWidget.vue'
import { createDefaultWidget } from '@/types/dashboard'
import type { WidgetConfig } from '@/types/dashboard'

// ... (rest of script is identical to previous version)
const router = useRouter()
const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()
const dataStore = useWidgetDataStore()
const subManager = getSubscriptionManager()
const validator = useValidation()
const { theme, toggleTheme } = useTheme()

const showAddWidget = ref(false)
const showConfigWidget = ref(false)
const configWidgetId = ref<string | null>(null)
const validationErrors = ref<Record<string, string>>({})

const fullScreenWidgetId = ref<string | null>(null)
const fullScreenWidget = computed(() => {
  if (!fullScreenWidgetId.value) return null
  return dashboardStore.getWidget(fullScreenWidgetId.value)
})

const selectedWidgetId = ref<string | null>(null)

const configWidgetType = computed(() => {
  if (!configWidgetId.value) return null
  const widget = dashboardStore.getWidget(configWidgetId.value)
  return widget?.type || null
})

const configForm = ref({
  title: '',
  subject: '',
  jsonPath: '',
  bufferSize: 100,
  kvBucket: '',
  kvKey: '',
  buttonLabel: '',
  buttonPayload: '',
})

// All the handler functions remain the same...
function subscribeWidget(widgetId: string) {
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
  dataStore.initializeBuffer(widgetId, widget.buffer.maxCount, widget.buffer.maxAge)
  
  if (widget.dataSource.type === 'subscription') {
    const subject = widget.dataSource.subject
    if (!subject) {
      console.warn(`Widget ${widgetId} has no subject configured`)
      return
    }
    
    console.log(`[Dashboard] Subscribing widget ${widgetId} to ${subject}`)
    subManager.subscribe(widgetId, subject, widget.jsonPath)
  }
}

function unsubscribeWidget(widgetId: string) {
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
  if (widget.dataSource.type === 'subscription') {
    const subject = widget.dataSource.subject
    if (subject) {
      console.log(`[Dashboard] Unsubscribing widget ${widgetId} from ${subject}`)
      subManager.unsubscribe(widgetId, subject)
    }
  }
  
  dataStore.removeBuffer(widgetId)
}

function subscribeAllWidgets() {
  console.log(`[Dashboard] Subscribing ${dashboardStore.activeWidgets.length} widgets`)
  dashboardStore.activeWidgets.forEach(widget => {
    subscribeWidget(widget.id)
  })
}

function unsubscribeAllWidgets() {
  console.log(`[Dashboard] Unsubscribing ${dashboardStore.activeWidgets.length} widgets`)
  dashboardStore.activeWidgets.forEach(widget => {
    unsubscribeWidget(widget.id)
  })
}

function handleDeleteWidget(widgetId: string) {
  unsubscribeWidget(widgetId)
  dashboardStore.removeWidget(widgetId)
}

function handleDuplicateWidget(widgetId: string) {
  const original = dashboardStore.getWidget(widgetId)
  if (!original) return
  
  const copy = JSON.parse(JSON.stringify(original))
  copy.id = `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  copy.title = `${original.title} (Copy)`
  copy.y = original.y + original.h + 1
  copy.x = original.x
  
  dashboardStore.addWidget(copy)
  
  if (copy.type !== 'button' && copy.type !== 'kv') {
    subscribeWidget(copy.id)
  }
  
  console.log(`[Dashboard] Duplicated widget ${widgetId} → ${copy.id}`)
}

function handleConfigureWidget(widgetId: string) {
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
  configWidgetId.value = widgetId
  configForm.value = {
    title: widget.title,
    subject: widget.dataSource.subject || '',
    jsonPath: widget.jsonPath || '',
    bufferSize: widget.buffer.maxCount,
    kvBucket: widget.dataSource.kvBucket || '',
    kvKey: widget.dataSource.kvKey || '',
    buttonLabel: widget.buttonConfig?.label || '',
    buttonPayload: widget.buttonConfig?.payload || '',
  }
  
  showConfigWidget.value = true
}

function saveWidgetConfig() {
  if (!configWidgetId.value) return
  
  const widget = dashboardStore.getWidget(configWidgetId.value)
  if (!widget) return
  
  validationErrors.value = {}
  
  const titleResult = validator.validateWidgetTitle(configForm.value.title)
  if (!titleResult.valid) {
    validationErrors.value.title = titleResult.error!
  }
  
  if (widget.type === 'text' || widget.type === 'chart') {
    const subjectResult = validator.validateSubject(configForm.value.subject)
    if (!subjectResult.valid) {
      validationErrors.value.subject = subjectResult.error!
    }
    
    if (configForm.value.jsonPath) {
      const jsonPathResult = validator.validateJsonPath(configForm.value.jsonPath)
      if (!jsonPathResult.valid) {
        validationErrors.value.jsonPath = jsonPathResult.error!
      }
    }
    
    const bufferResult = validator.validateBufferSize(configForm.value.bufferSize)
    if (!bufferResult.valid) {
      validationErrors.value.bufferSize = bufferResult.error!
    }
    
  } else if (widget.type === 'button') {
    const subjectResult = validator.validateSubject(configForm.value.subject)
    if (!subjectResult.valid) {
      validationErrors.value.subject = subjectResult.error!
    }
    
    if (!configForm.value.buttonLabel.trim()) {
      validationErrors.value.buttonLabel = 'Button label cannot be empty'
    }
    
    if (configForm.value.buttonPayload) {
      const jsonResult = validator.validateJson(configForm.value.buttonPayload)
      if (!jsonResult.valid) {
        validationErrors.value.buttonPayload = jsonResult.error!
      }
    }
    
  } else if (widget.type === 'kv') {
    const bucketResult = validator.validateKvBucket(configForm.value.kvBucket)
    if (!bucketResult.valid) {
      validationErrors.value.kvBucket = bucketResult.error!
    }
    
    const keyResult = validator.validateKvKey(configForm.value.kvKey)
    if (!keyResult.valid) {
      validationErrors.value.kvKey = keyResult.error!
    }
  }
  
  if (Object.keys(validationErrors.value).length > 0) {
    console.log('[Dashboard] Validation errors:', validationErrors.value)
    return
  }
  
  const updates: any = {
    title: configForm.value.title.trim(),
  }
  
  if (widget.type === 'text' || widget.type === 'chart') {
    updates.dataSource = {
      ...widget.dataSource,
      subject: configForm.value.subject.trim(),
    }
    updates.jsonPath = configForm.value.jsonPath.trim() || undefined
    updates.buffer = {
      maxCount: configForm.value.bufferSize,
    }
  } else if (widget.type === 'button') {
    updates.buttonConfig = {
      label: configForm.value.buttonLabel.trim() || 'Send',
      publishSubject: configForm.value.subject.trim(),
      payload: configForm.value.buttonPayload.trim() || '{}',
    }
  } else if (widget.type === 'kv') {
    updates.dataSource = {
      type: 'kv',
      kvBucket: configForm.value.kvBucket.trim(),
      kvKey: configForm.value.kvKey.trim(),
    }
  }
  
  dashboardStore.updateWidget(configWidgetId.value, updates)
  
  if (widget.type === 'text' || widget.type === 'chart') {
    unsubscribeWidget(configWidgetId.value)
    subscribeWidget(configWidgetId.value)
  }
  
  showConfigWidget.value = false
  configWidgetId.value = null
  validationErrors.value = {}
}

function addTestWidget(type: 'text' | 'chart' | 'button' | 'kv' = 'text') {
  const sizes = {
    text: { w: 3, h: 2 },
    chart: { w: 6, h: 4 },
    button: { w: 2, h: 1 },
    kv: { w: 4, h: 3 },
  }
  
  const size = sizes[type]
  const position = findNextAvailablePosition(size)
  const widget = createDefaultWidget(type, position)
  
  switch (type) {
    case 'text':
      widget.title = 'Text Widget'
      widget.dataSource = {
        type: 'subscription',
        subject: 'test.subject'
      }
      widget.jsonPath = '$.value'
      break
      
    case 'chart':
      widget.title = 'Chart Widget'
      widget.dataSource = {
        type: 'subscription',
        subject: 'test.subject'
      }
      widget.jsonPath = '$.value'
      widget.chartConfig = {
        chartType: 'line',
      }
      break
      
    case 'button':
      widget.title = 'Button Widget'
      widget.buttonConfig = {
        label: 'Send Message',
        publishSubject: 'button.clicked',
        payload: '{"action": "clicked", "timestamp": "' + new Date().toISOString() + '"}',
      }
      break
      
    case 'kv':
      widget.title = 'KV Widget'
      widget.dataSource = {
        type: 'kv',
        kvBucket: 'my-bucket',
        kvKey: 'my-key',
      }
      widget.kvConfig = {
        displayFormat: 'json',
      }
      break
  }
  
  dashboardStore.addWidget(widget)
  
  if (type !== 'button' && type !== 'kv') {
    subscribeWidget(widget.id)
  }
  
  showAddWidget.value = false
}

function findNextAvailablePosition(size: { w: number; h: number }): { x: number; y: number } {
  const widgets = dashboardStore.activeWidgets
  
  if (widgets.length === 0) {
    return { x: 0, y: 0 }
  }
  
  let maxY = 0
  let maxYWidget: WidgetConfig | null = null
  
  for (const widget of widgets) {
    const bottomY = widget.y + widget.h
    if (bottomY > maxY) {
      maxY = bottomY
      maxYWidget = widget
    }
  }
  
  return { x: 0, y: maxY }
}

function toggleFullScreen(widgetId: string) {
  if (fullScreenWidgetId.value === widgetId) {
    fullScreenWidgetId.value = null
  } else {
    fullScreenWidgetId.value = widgetId
  }
}

function exitFullScreen() {
  fullScreenWidgetId.value = null
}

useKeyboardShortcuts([
  {
    key: 's',
    ctrl: true,
    description: 'Save dashboard',
    handler: () => {
      dashboardStore.saveToStorage()
      console.log('[Shortcuts] Dashboard saved')
    }
  },
  {
    key: 'n',
    ctrl: true,
    description: 'Add new widget',
    handler: () => {
      showAddWidget.value = true
    }
  },
  {
    key: 'Delete',
    description: 'Delete selected widget',
    handler: () => {
      if (selectedWidgetId.value) {
        handleDeleteWidget(selectedWidgetId.value)
        selectedWidgetId.value = null
      }
    }
  },
  {
    key: 'Backspace',
    description: 'Delete selected widget',
    handler: () => {
      if (selectedWidgetId.value) {
        handleDeleteWidget(selectedWidgetId.value)
        selectedWidgetId.value = null
      }
    }
  },
  {
    key: 'Escape',
    description: 'Close modal / Exit full screen',
    handler: () => {
      if (fullScreenWidgetId.value) {
        exitFullScreen()
      } else if (showConfigWidget.value) {
        showConfigWidget.value = false
      } else if (showAddWidget.value) {
        showAddWidget.value = false
      }
    }
  },
  {
    key: 'd',
    ctrl: true,
    description: 'Duplicate selected widget',
    handler: (e) => {
      if (selectedWidgetId.value) {
        handleDuplicateWidget(selectedWidgetId.value)
      }
    }
  },
  {
    key: 'f',
    description: 'Toggle full screen on selected widget',
    handler: () => {
      if (selectedWidgetId.value) {
        toggleFullScreen(selectedWidgetId.value)
      }
    }
  },
])

onMounted(async () => {
  console.log('[Dashboard] Mounted')
  
  dashboardStore.loadFromStorage()
  
  if (!natsStore.isConnected && !natsStore.autoConnect) {
    const hasSettings = natsStore.serverUrls.length > 0 || natsStore.getStoredCreds() !== null
    
    if (!hasSettings) {
      console.log('[Dashboard] No saved settings found, redirecting to settings')
      router.push('/settings')
      return
    }
  }
  
  if (natsStore.isConnected) {
    subscribeAllWidgets()
  }
})

onUnmounted(() => {
  console.log('[Dashboard] Unmounted')
  unsubscribeAllWidgets()
})

watch(() => natsStore.isConnected, (connected) => {
  if (connected) {
    subscribeAllWidgets()
  } else {
    unsubscribeAllWidgets()
    dataStore.clearAllBuffers()
  }
})

watch(() => dashboardStore.activeWidgets.length, (newCount, oldCount) => {
  if (!natsStore.isConnected) return
  
  if (newCount > oldCount) {
    const newWidget = dashboardStore.activeWidgets[newCount - 1]
    subscribeWidget(newWidget.id)
  }
})
</script>

<style scoped>
.dashboard-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
}

/* Toolbar - uses design tokens! */
.dashboard-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.toolbar-right {
  display: flex;
  gap: 12px;
}

.dashboard-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
}

/* Connection status - uses design tokens! */
.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  border: 2px solid;
}

.connection-status.connected {
  background: var(--color-success-bg);
  border-color: var(--color-success-border);
  color: var(--connection-connected);
}

.connection-status.disconnected {
  background: var(--color-error-bg);
  border-color: var(--color-error-border);
  color: var(--connection-disconnected);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.rtt {
  margin-left: 4px;
  color: var(--muted);
  font-size: 11px;
}

/* Buttons - uses design tokens! */
.btn-primary,
.btn-secondary,
.btn-icon {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-icon {
  padding: 8px 12px;
  font-size: 18px;
  background: rgba(255, 255, 255, 0.1);
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: scale(1.1);
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

/* Content */
.dashboard-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Modal - uses design tokens! */
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
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

/* Form Styling - uses design tokens! */
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

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 14px;
  font-family: var(--mono);
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-info-bg);
}

.form-input.has-error {
  border-color: var(--color-error);
}

.form-input.has-error:focus {
  box-shadow: 0 0 0 3px var(--color-error-bg);
}

.help-text {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}

.error-text {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-error);
  line-height: 1.4;
  font-weight: 500;
}

.form-textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  font-family: var(--mono);
  transition: all 0.2s;
  resize: vertical;
  line-height: 1.5;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-info-bg);
}

.form-textarea.has-error {
  border-color: var(--color-error);
}

.form-textarea.has-error:focus {
  box-shadow: 0 0 0 3px var(--color-error-bg);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

/* Widget Type Selection - uses design tokens! */
.widget-type-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.widget-type-btn {
  background: var(--panel);
  border: 2px solid var(--border);
  border-radius: 8px;
  padding: 20px 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.widget-type-btn:hover {
  border-color: var(--color-accent);
  background: var(--color-info-bg);
  transform: translateY(-2px);
}

.widget-type-icon {
  font-size: 32px;
  margin-bottom: 4px;
}

.widget-type-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.widget-type-desc {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.3;
}

/* Full-screen Modal - uses design tokens! */
.fullscreen-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.fullscreen-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.fullscreen-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 32px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.fullscreen-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
}

.fullscreen-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 32px;
}

.fullscreen-hint {
  padding: 12px 32px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
  background: var(--panel);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.fullscreen-hint kbd {
  display: inline-block;
  padding: 3px 8px;
  font-size: 12px;
  line-height: 1;
  color: var(--text);
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-family: var(--mono);
  margin: 0 4px;
}
</style>
