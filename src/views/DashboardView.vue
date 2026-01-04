<template>
  <div class="dashboard-view">
    <!-- Dashboard Sidebar -->
    <DashboardSidebar ref="sidebarRef" />
    
    <!-- Main content area -->
    <div class="dashboard-main">
      <!-- Top toolbar -->
      <div class="dashboard-toolbar">
        <div class="toolbar-left">
          <!-- Hamburger menu (always visible) -->
          <button 
            class="hamburger-btn"
            @click="toggleSidebar"
            title="Toggle sidebar (Ctrl+B)"
          >
            ☰
          </button>
          
          <h1 class="dashboard-name">
            {{ dashboardStore.activeDashboard?.name || 'Dashboard' }}
          </h1>
          
          <!-- Connection Status -->
          <div v-if="natsStore.isConnected" class="connection-status connected">
            <div class="status-dot"></div>
            <span class="status-label">Connected</span>
            <span v-if="natsStore.rtt" class="rtt">{{ natsStore.rtt }}ms</span>
          </div>
          <div v-else class="connection-status disconnected">
            <div class="status-dot"></div>
            <span class="status-label">Disconnected</span>
          </div>
        </div>
        
        <div class="toolbar-right">
          <!-- Theme Toggle -->
          <button 
            class="btn-icon" 
            :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`"
            @click="toggleTheme"
          >
            {{ theme === 'dark' ? '☀️' : '🌙' }}
          </button>
          
          <!-- Add Widget -->
          <button class="btn-primary" @click="showAddWidget = true" title="Add Widget">
            <span class="btn-text">+ Add Widget</span>
            <span class="btn-icon-only">+</span>
          </button>
          
          <!-- Settings -->
          <button class="btn-secondary" @click="$router.push('/settings')" title="Settings">
            <span class="btn-text">⚙️ Settings</span>
            <span class="btn-icon-only">⚙️</span>
          </button>
        </div>
      </div>
      
      <!-- Grid with widgets -->
      <div class="dashboard-content">
        <DashboardGrid
          v-if="dashboardStore.activeWidgets.length > 0"
          :widgets="dashboardStore.activeWidgets"
          @delete-widget="handleDeleteWidget"
          @configure-widget="handleConfigureWidget"
          @duplicate-widget="handleDuplicateWidget"
          @fullscreen-widget="toggleFullScreen"
        />
        <div v-else class="no-widgets-state">
          <div class="no-widgets-icon">📊</div>
          <div class="no-widgets-text">No widgets in this dashboard</div>
          <div class="no-widgets-hint">Click "+ Add Widget" to get started</div>
        </div>
      </div>
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

            <!-- Conditional Formatting for Text Widget -->
            <div v-if="configWidgetType === 'text'" class="form-group">
              <label>Conditional Formatting</label>
              <ThresholdEditor v-model="configForm.thresholds" />
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
            </div>

            <div class="form-group">
              <label>JSONPath Filter (optional)</label>
              <input 
                v-model="configForm.jsonPath" 
                type="text" 
                class="form-input"
                :class="{ 'has-error': validationErrors.jsonPath }"
                placeholder="$.data.value"
              />
              <div v-if="validationErrors.jsonPath" class="error-text">
                {{ validationErrors.jsonPath }}
              </div>
              <div v-else class="help-text">
                Extract specific data from JSON values
              </div>
            </div>

            <!-- Conditional Formatting for KV Widget -->
            <div class="form-group">
              <label>Conditional Formatting (Single Value Mode)</label>
              <ThresholdEditor v-model="configForm.thresholds" />
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
    
    <!-- Debug Panel -->
    <DebugPanel />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { useWidgetDataStore } from '@/stores/widgetData'
import { getSubscriptionManager } from '@/composables/useSubscriptionManager'
import { useValidation } from '@/composables/useValidation'
import { useTheme } from '@/composables/useTheme'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar.vue'
import DashboardGrid from '@/components/dashboard/DashboardGrid.vue'
import DebugPanel from '@/components/common/DebugPanel.vue'
import ThresholdEditor from '@/components/dashboard/ThresholdEditor.vue'
import TextWidget from '@/components/widgets/TextWidget.vue'
import ChartWidget from '@/components/widgets/ChartWidget.vue'
import ButtonWidget from '@/components/widgets/ButtonWidget.vue'
import KvWidget from '@/components/widgets/KvWidget.vue'
import { createDefaultWidget } from '@/types/dashboard'
import type { WidgetConfig, ThresholdRule } from '@/types/dashboard'

/**
 * Dashboard View
 * 
 * Main dashboard page with sidebar for managing multiple dashboards.
 * 
 * NEW: Now includes multi-dashboard sidebar!
 */

const router = useRouter()
const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()
const dataStore = useWidgetDataStore()
const subManager = getSubscriptionManager()
const validator = useValidation()
const { theme, toggleTheme } = useTheme()

const sidebarRef = ref<InstanceType<typeof DashboardSidebar> | null>(null)

const showAddWidget = ref(false)
const showConfigWidget = ref(false)
const configWidgetId = ref<string | null>(null)
const validationErrors = ref<Record<string, string>>({})

const fullScreenWidgetId = ref<string | null>(null)
const fullScreenWidget = computed(() => {
  if (!fullScreenWidgetId.value) return null
  return dashboardStore.getWidget(fullScreenWidgetId.value)
})

const configWidgetType = computed(() => {
  if (!configWidgetId.value) return null
  const widget = dashboardStore.getWidget(configWidgetId.value)
  return widget?.type || null
})

interface ConfigFormState {
  title: string
  subject: string
  jsonPath: string
  bufferSize: number
  kvBucket: string
  kvKey: string
  buttonLabel: string
  buttonPayload: string
  thresholds: ThresholdRule[]
}

const configForm = ref<ConfigFormState>({
  title: '',
  subject: '',
  jsonPath: '',
  bufferSize: 100,
  kvBucket: '',
  kvKey: '',
  buttonLabel: '',
  buttonPayload: '',
  thresholds: [],
})

/**
 * Toggle sidebar (for hamburger menu)
 */
function toggleSidebar() {
  if (sidebarRef.value) {
    sidebarRef.value.toggleSidebar()
  }
}

function subscribeWidget(widgetId: string) {
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
  dataStore.initializeBuffer(widgetId, widget.buffer.maxCount, widget.buffer.maxAge)
  
  if (widget.dataSource.type === 'subscription') {
    const subject = widget.dataSource.subject
    if (!subject) return
    subManager.subscribe(widgetId, subject, widget.jsonPath)
  }
}

function unsubscribeWidget(widgetId: string) {
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
  if (widget.dataSource.type === 'subscription' && widget.dataSource.subject) {
    subManager.unsubscribe(widgetId, widget.dataSource.subject)
  }
  dataStore.removeBuffer(widgetId)
}

function subscribeAllWidgets() {
  dashboardStore.activeWidgets.forEach(widget => subscribeWidget(widget.id))
}

function unsubscribeAllWidgets() {
  dashboardStore.activeWidgets.forEach(widget => unsubscribeWidget(widget.id))
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
}

function handleConfigureWidget(widgetId: string) {
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
  configWidgetId.value = widgetId
  
  let currentSubject = ''
  if (widget.type === 'button') {
    currentSubject = widget.buttonConfig?.publishSubject || ''
  } else {
    currentSubject = widget.dataSource.subject || ''
  }

  // Load thresholds based on type
  let currentThresholds: ThresholdRule[] = []
  if (widget.type === 'text') {
    currentThresholds = widget.textConfig?.thresholds ? [...widget.textConfig.thresholds] : []
  } else if (widget.type === 'kv') {
    currentThresholds = widget.kvConfig?.thresholds ? [...widget.kvConfig.thresholds] : []
  }

  configForm.value = {
    title: widget.title,
    subject: currentSubject,
    jsonPath: widget.jsonPath || '',
    bufferSize: widget.buffer.maxCount,
    kvBucket: widget.dataSource.kvBucket || '',
    kvKey: widget.dataSource.kvKey || '',
    buttonLabel: widget.buttonConfig?.label || '',
    buttonPayload: widget.buttonConfig?.payload || '',
    thresholds: currentThresholds
  }
  showConfigWidget.value = true
}

function saveWidgetConfig() {
  if (!configWidgetId.value) return
  const widget = dashboardStore.getWidget(configWidgetId.value)
  if (!widget) return
  
  validationErrors.value = {}
  
  const titleResult = validator.validateWidgetTitle(configForm.value.title)
  if (!titleResult.valid) validationErrors.value.title = titleResult.error!
  
  if (widget.type === 'text' || widget.type === 'chart') {
    const subjectResult = validator.validateSubject(configForm.value.subject)
    if (!subjectResult.valid) validationErrors.value.subject = subjectResult.error!
    
    if (configForm.value.jsonPath) {
      const jsonResult = validator.validateJsonPath(configForm.value.jsonPath)
      if (!jsonResult.valid) validationErrors.value.jsonPath = jsonResult.error!
    }
    const bufferResult = validator.validateBufferSize(configForm.value.bufferSize)
    if (!bufferResult.valid) validationErrors.value.bufferSize = bufferResult.error!

  } else if (widget.type === 'button') {
    const subjectResult = validator.validateSubject(configForm.value.subject)
    if (!subjectResult.valid) validationErrors.value.subject = subjectResult.error!
    if (!configForm.value.buttonLabel.trim()) validationErrors.value.buttonLabel = 'Label required'
    if (configForm.value.buttonPayload) {
      const jsonResult = validator.validateJson(configForm.value.buttonPayload)
      if (!jsonResult.valid) validationErrors.value.buttonPayload = jsonResult.error!
    }

  } else if (widget.type === 'kv') {
    const bucketResult = validator.validateKvBucket(configForm.value.kvBucket)
    if (!bucketResult.valid) validationErrors.value.kvBucket = bucketResult.error!
    const keyResult = validator.validateKvKey(configForm.value.kvKey)
    if (!keyResult.valid) validationErrors.value.kvKey = keyResult.error!
    if (configForm.value.jsonPath) {
      const jsonResult = validator.validateJsonPath(configForm.value.jsonPath)
      if (!jsonResult.valid) validationErrors.value.jsonPath = jsonResult.error!
    }
  }
  
  if (Object.keys(validationErrors.value).length > 0) return
  
  const updates: any = { title: configForm.value.title.trim() }
  
  if (widget.type === 'text') {
    updates.dataSource = { ...widget.dataSource, subject: configForm.value.subject.trim() }
    updates.jsonPath = configForm.value.jsonPath.trim() || undefined
    updates.buffer = { maxCount: configForm.value.bufferSize }
    updates.textConfig = { 
      ...widget.textConfig,
      thresholds: [...configForm.value.thresholds]
    }
  } else if (widget.type === 'chart') {
    updates.dataSource = { ...widget.dataSource, subject: configForm.value.subject.trim() }
    updates.jsonPath = configForm.value.jsonPath.trim() || undefined
    updates.buffer = { maxCount: configForm.value.bufferSize }
  } else if (widget.type === 'button') {
    updates.buttonConfig = {
      label: configForm.value.buttonLabel.trim(),
      publishSubject: configForm.value.subject.trim(),
      payload: configForm.value.buttonPayload.trim() || '{}',
    }
  } else if (widget.type === 'kv') {
    updates.dataSource = {
      type: 'kv',
      kvBucket: configForm.value.kvBucket.trim(),
      kvKey: configForm.value.kvKey.trim(),
    }
    updates.jsonPath = configForm.value.jsonPath.trim() || undefined
    updates.kvConfig = {
      ...widget.kvConfig,
      thresholds: [...configForm.value.thresholds]
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
  const position = { x: 0, y: 100 } 
  const widget = createDefaultWidget(type, position)
  
  switch (type) {
    case 'text':
      widget.title = 'Text Widget'
      widget.dataSource = { type: 'subscription', subject: 'test.subject' }
      widget.jsonPath = '$.value'
      break
    case 'chart':
      widget.title = 'Chart Widget'
      widget.dataSource = { type: 'subscription', subject: 'test.subject' }
      widget.jsonPath = '$.value'
      widget.chartConfig = { chartType: 'line' }
      break
    case 'button':
      widget.title = 'Button Widget'
      widget.buttonConfig = { label: 'Send', publishSubject: 'button.clicked', payload: '{"val": 1}' }
      break
    case 'kv':
      widget.title = 'KV Widget'
      widget.dataSource = { type: 'kv', kvBucket: 'my-bucket', kvKey: 'my-key' }
      break
  }
  
  dashboardStore.addWidget(widget)
  if (type !== 'button' && type !== 'kv') subscribeWidget(widget.id)
  showAddWidget.value = false
}

function toggleFullScreen(widgetId: string) {
  fullScreenWidgetId.value = fullScreenWidgetId.value === widgetId ? null : widgetId
}

function exitFullScreen() {
  fullScreenWidgetId.value = null
}

useKeyboardShortcuts([
  { key: 's', ctrl: true, description: 'Save', handler: () => dashboardStore.saveToStorage() },
  { key: 'n', ctrl: true, description: 'New widget', handler: () => showAddWidget.value = true },
  { key: 't', ctrl: true, description: 'New dashboard', handler: () => {
    const name = prompt('Dashboard name:', 'New Dashboard')
    if (name) dashboardStore.createDashboard(name)
  }},
  { key: 'b', ctrl: true, description: 'Toggle sidebar', handler: toggleSidebar },
  { key: 'Escape', description: 'Close/Exit', handler: () => {
    if (fullScreenWidgetId.value) exitFullScreen()
    else showConfigWidget.value = false
    showAddWidget.value = false
  }}
])

onMounted(() => {
  dashboardStore.loadFromStorage()
  if (!natsStore.isConnected && !natsStore.autoConnect) {
    const hasSettings = natsStore.serverUrls.length > 0 || natsStore.getStoredCreds() !== null
    if (!hasSettings) router.push('/settings')
  }
  if (natsStore.isConnected) subscribeAllWidgets()
})

onUnmounted(() => {
  unsubscribeAllWidgets()
})

// Watch for connection changes
watch(() => natsStore.isConnected, (connected) => {
  if (connected) subscribeAllWidgets()
  else {
    unsubscribeAllWidgets()
    dataStore.clearAllBuffers()
  }
})

// Watch for dashboard switches - unsubscribe old, subscribe new
watch(() => dashboardStore.activeDashboardId, async () => {
  unsubscribeAllWidgets()
  
  // Wait for Vue to finish updating the DOM before subscribing
  // Grug say: Let Vue finish work first, then we do our work
  await nextTick()
  
  if (natsStore.isConnected) {
    subscribeAllWidgets()
  }
})

// Watch for new widgets being added
watch(() => dashboardStore.activeWidgets.length, (newCount, oldCount) => {
  if (natsStore.isConnected && newCount > oldCount) {
    subscribeWidget(dashboardStore.activeWidgets[newCount - 1].id)
  }
})
</script>

<style scoped>
.dashboard-view {
  height: 100vh;
  display: flex;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
}

/* Main content area (flexes to fill space after sidebar) */
.dashboard-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* Allow flex shrinking */
  overflow: hidden;
}

/* Toolbar */
.dashboard-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* Hamburger menu (always visible) */
.hamburger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.hamburger-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--color-accent);
}

.dashboard-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}

/* Connection Status */
.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  border: 2px solid;
  white-space: nowrap;
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

/* Buttons */
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
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
  position: relative;
}

/* No widgets state */
.no-widgets-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  padding: 40px;
}

.no-widgets-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.no-widgets-text {
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text);
}

.no-widgets-hint {
  font-size: 14px;
}

/* --- Responsive Media Queries --- */
.btn-text {
  display: inline;
}
.btn-icon-only {
  display: none;
}

@media (max-width: 900px) {
  .dashboard-toolbar {
    padding: 12px 16px;
  }
}

@media (max-width: 600px) {
  .dashboard-toolbar {
    flex-direction: column;
    align-items: stretch;
    padding: 12px;
  }

  .toolbar-left {
    justify-content: space-between;
    width: 100%;
    margin-bottom: 8px;
  }

  .toolbar-right {
    justify-content: space-between;
    width: 100%;
  }

  .btn-primary, .btn-secondary, .btn-icon {
    flex: 1;
  }
}

@media (max-width: 400px) {
  .btn-text {
    display: none;
  }
  .btn-icon-only {
    display: inline;
    font-size: 16px;
    font-weight: bold;
  }
  .rtt {
    display: none;
  }
  .status-label {
    font-size: 12px;
  }
}

/* Modal Styling */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
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

.modal-header h3 { margin: 0; font-size: 18px; }

.close-btn {
  background: none; border: none; color: var(--muted);
  font-size: 24px; cursor: pointer;
}

.modal-body { padding: 20px; overflow-y: auto; }

.form-group { margin-bottom: 20px; }
.form-group label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; color: var(--text); }
.form-input, .form-textarea {
  width: 100%; padding: 10px 12px;
  background: var(--input-bg); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text); font-family: var(--mono);
}
.help-text { font-size: 12px; color: var(--muted); margin-top: 4px; }
.error-text { font-size: 12px; color: var(--color-error); margin-top: 4px; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); }

.widget-type-buttons {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-top: 16px;
}

.widget-type-btn {
  background: var(--panel); border: 2px solid var(--border);
  border-radius: 8px; padding: 20px 10px; cursor: pointer;
  text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px;
  color: var(--text);
}
.widget-type-btn:hover { border-color: var(--color-accent); background: var(--color-info-bg); }
.widget-type-icon { font-size: 32px; }
.widget-type-name { font-size: 14px; font-weight: 600; color: var(--text); }
.widget-type-desc { font-size: 11px; color: var(--muted); line-height: 1.3; }

/* Fullscreen Modal */
.fullscreen-modal {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg); z-index: 2000; display: flex; flex-direction: column;
}
.fullscreen-header {
  display: flex; justify-content: space-between; padding: 20px 32px;
  background: var(--panel); border-bottom: 1px solid var(--border);
}
.fullscreen-body { flex: 1; padding: 32px; overflow: auto; }
.fullscreen-hint { padding: 12px; text-align: center; color: var(--muted); background: var(--panel); border-top: 1px solid var(--border); }
</style>
