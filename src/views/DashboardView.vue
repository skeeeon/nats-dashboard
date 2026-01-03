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
      />
    </div>
    
    <!-- Add Widget Modal (placeholder for now) -->
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
              placeholder="My Widget"
            />
          </div>
          
          <!-- Text & Chart Widget Config -->
          <template v-if="configWidgetType === 'text' || configWidgetType === 'chart'">
            <div class="form-group">
              <label>NATS Subject</label>
              <input 
                v-model="configForm.subject" 
                type="text" 
                class="form-input"
                placeholder="sensors.temperature"
              />
              <div class="help-text">
                NATS subject pattern to subscribe to
              </div>
            </div>
            
            <div class="form-group">
              <label>JSONPath (optional)</label>
              <input 
                v-model="configForm.jsonPath" 
                type="text" 
                class="form-input"
                placeholder="$.value or $.sensors[0].temp"
              />
              <div class="help-text">
                Extract specific data from messages. Leave empty to show full message.
              </div>
            </div>
            
            <div class="form-group">
              <label>Buffer Size</label>
              <input 
                v-model.number="configForm.bufferSize" 
                type="number" 
                class="form-input"
                min="10"
                max="1000"
              />
              <div class="help-text">
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
                placeholder="Send Message"
              />
              <div class="help-text">
                Text displayed on the button
              </div>
            </div>
            
            <div class="form-group">
              <label>Publish Subject</label>
              <input 
                v-model="configForm.subject" 
                type="text" 
                class="form-input"
                placeholder="button.clicked"
              />
              <div class="help-text">
                NATS subject to publish to when clicked
              </div>
            </div>
            
            <div class="form-group">
              <label>Message Payload</label>
              <textarea 
                v-model="configForm.buttonPayload" 
                class="form-textarea"
                rows="6"
                placeholder='{"action": "clicked"}'
              />
              <div class="help-text">
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
                placeholder="my-bucket"
              />
              <div class="help-text">
                Name of the KV bucket (e.g., "config", "twin")
              </div>
            </div>
            
            <div class="form-group">
              <label>KV Key</label>
              <input 
                v-model="configForm.kvKey" 
                type="text" 
                class="form-input"
                placeholder="app.version"
              />
              <div class="help-text">
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useNatsStore } from '@/stores/nats'
import { useDashboardStore } from '@/stores/dashboard'
import { useWidgetDataStore } from '@/stores/widgetData'
import { getSubscriptionManager } from '@/composables/useSubscriptionManager'
import DashboardGrid from '@/components/dashboard/DashboardGrid.vue'
import { createDefaultWidget } from '@/types/dashboard'

/**
 * Dashboard View
 * 
 * Grug say: This is main page. Show widgets. Handle connections.
 * When widget added, subscribe to NATS.
 * When widget removed, unsubscribe from NATS.
 * Simple lifecycle management.
 */

const router = useRouter()
const natsStore = useNatsStore()
const dashboardStore = useDashboardStore()
const dataStore = useWidgetDataStore()
const subManager = getSubscriptionManager()

const showAddWidget = ref(false)
const showConfigWidget = ref(false)
const configWidgetId = ref<string | null>(null)

// Get widget type being configured
const configWidgetType = computed(() => {
  if (!configWidgetId.value) return null
  const widget = dashboardStore.getWidget(configWidgetId.value)
  return widget?.type || null
})

// Form fields for widget configuration
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

// ============================================================================
// WIDGET SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Subscribe widget to its data source
 * Grug say: Connect widget to NATS messages
 */
function subscribeWidget(widgetId: string) {
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
  // Initialize buffer for widget
  dataStore.initializeBuffer(widgetId, widget.buffer.maxCount, widget.buffer.maxAge)
  
  // Subscribe based on data source type
  if (widget.dataSource.type === 'subscription') {
    const subject = widget.dataSource.subject
    if (!subject) {
      console.warn(`Widget ${widgetId} has no subject configured`)
      return
    }
    
    console.log(`[Dashboard] Subscribing widget ${widgetId} to ${subject}`)
    subManager.subscribe(widgetId, subject, widget.jsonPath)
  }
  // TODO: Handle consumer and KV sources in Phase 3
}

/**
 * Unsubscribe widget from its data source
 * Grug say: Disconnect widget from NATS messages
 */
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
  // TODO: Handle consumer and KV sources in Phase 3
  
  // Clean up buffer
  dataStore.removeBuffer(widgetId)
}

/**
 * Subscribe all widgets
 * Grug say: Connect all widgets when dashboard loads
 */
function subscribeAllWidgets() {
  console.log(`[Dashboard] Subscribing ${dashboardStore.activeWidgets.length} widgets`)
  dashboardStore.activeWidgets.forEach(widget => {
    subscribeWidget(widget.id)
  })
}

/**
 * Unsubscribe all widgets
 * Grug say: Disconnect all widgets when leaving dashboard
 */
function unsubscribeAllWidgets() {
  console.log(`[Dashboard] Unsubscribing ${dashboardStore.activeWidgets.length} widgets`)
  dashboardStore.activeWidgets.forEach(widget => {
    unsubscribeWidget(widget.id)
  })
}

// ============================================================================
// WIDGET CRUD HANDLERS
// ============================================================================

/**
 * Handle widget deletion
 */
function handleDeleteWidget(widgetId: string) {
  unsubscribeWidget(widgetId)
  dashboardStore.removeWidget(widgetId)
}

/**
 * Handle widget configuration
 */
function handleConfigureWidget(widgetId: string) {
  const widget = dashboardStore.getWidget(widgetId)
  if (!widget) return
  
  // Load widget config into form
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

/**
 * Save widget configuration
 */
function saveWidgetConfig() {
  if (!configWidgetId.value) return
  
  const widget = dashboardStore.getWidget(configWidgetId.value)
  if (!widget) return
  
  // Build updates based on widget type
  const updates: any = {
    title: configForm.value.title,
  }
  
  // Type-specific configuration
  if (widget.type === 'text' || widget.type === 'chart') {
    // Text and Chart widgets use subject + JSONPath
    updates.dataSource = {
      ...widget.dataSource,
      subject: configForm.value.subject,
    }
    updates.jsonPath = configForm.value.jsonPath
    updates.buffer = {
      maxCount: configForm.value.bufferSize,
    }
  } else if (widget.type === 'button') {
    // Button widget configuration
    updates.buttonConfig = {
      label: configForm.value.buttonLabel || 'Send',
      publishSubject: configForm.value.subject,
      payload: configForm.value.buttonPayload || '{}',
    }
  } else if (widget.type === 'kv') {
    // KV widget uses bucket + key
    updates.dataSource = {
      type: 'kv',
      kvBucket: configForm.value.kvBucket,
      kvKey: configForm.value.kvKey,
    }
  }
  
  // Update widget in store
  dashboardStore.updateWidget(configWidgetId.value, updates)
  
  // Re-subscribe for data-driven widgets (not button/kv)
  if (widget.type === 'text' || widget.type === 'chart') {
    unsubscribeWidget(configWidgetId.value)
    subscribeWidget(configWidgetId.value)
  }
  
  // Close modal
  showConfigWidget.value = false
  configWidgetId.value = null
}

/**
 * Add test widget for development
 * Grug say: Create widget based on type selected
 */
function addTestWidget(type: 'text' | 'chart' | 'button' | 'kv' = 'text') {
  // Different sizes for different widget types
  const sizes = {
    text: { w: 3, h: 2 },
    chart: { w: 6, h: 4 },
    button: { w: 2, h: 1 },
    kv: { w: 4, h: 3 },
  }
  
  const size = sizes[type]
  const position = findNextAvailablePosition(size)
  const widget = createDefaultWidget(type, position)
  
  // Configure based on type
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
      // Button widgets don't need data source
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
        kvBucket: 'my-bucket',  // User must configure
        kvKey: 'my-key',        // User must configure
      }
      widget.kvConfig = {
        displayFormat: 'json',
      }
      break
  }
  
  dashboardStore.addWidget(widget)
  
  // Only subscribe for data-driven widgets (not button)
  if (type !== 'button' && type !== 'kv') {
    subscribeWidget(widget.id)
  }
  
  showAddWidget.value = false
}

/**
 * Find next available position for a widget
 * Grug say: Put new widget below existing ones, not on top
 */
function findNextAvailablePosition(size: { w: number; h: number }): { x: number; y: number } {
  const widgets = dashboardStore.activeWidgets
  
  // If no widgets, start at top-left
  if (widgets.length === 0) {
    return { x: 0, y: 0 }
  }
  
  // Find the lowest Y position (bottom-most widget)
  let maxY = 0
  let maxYWidget: WidgetConfig | null = null
  
  for (const widget of widgets) {
    const bottomY = widget.y + widget.h
    if (bottomY > maxY) {
      maxY = bottomY
      maxYWidget = widget
    }
  }
  
  // Place new widget below the bottom-most widget
  // Start at left edge (x: 0)
  return { x: 0, y: maxY }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

onMounted(async () => {
  console.log('[Dashboard] Mounted')
  
  // Load dashboard configuration
  dashboardStore.loadFromStorage()
  
  // Check NATS connection
  if (!natsStore.isConnected) {
    console.log('[Dashboard] Not connected to NATS, redirecting to settings')
    router.push('/settings')
    return
  }
  
  // Subscribe all widgets
  subscribeAllWidgets()
})

onUnmounted(() => {
  console.log('[Dashboard] Unmounted')
  
  // Clean up all subscriptions
  unsubscribeAllWidgets()
})

// Watch for NATS connection changes
watch(() => natsStore.isConnected, (connected) => {
  if (connected) {
    // Reconnected - resubscribe widgets
    subscribeAllWidgets()
  } else {
    // Disconnected - clean up
    unsubscribeAllWidgets()
    dataStore.clearAllBuffers()
  }
})

// Watch for widget changes (dynamic add/remove)
// Grug say: If widget added while dashboard open, subscribe it
watch(() => dashboardStore.activeWidgets.length, (newCount, oldCount) => {
  if (!natsStore.isConnected) return
  
  if (newCount > oldCount) {
    // Widget added - subscribe the new one
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
  background: var(--bg, #0a0a0a);
  color: var(--text, #e0e0e0);
}

/* Toolbar */
.dashboard-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--panel, #161616);
  border-bottom: 1px solid var(--border, #333);
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
  color: var(--text, #e0e0e0);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
}

.connection-status.connected {
  background: rgba(63, 185, 80, 0.2);
  color: #56d364;
}

.connection-status.disconnected {
  background: rgba(248, 81, 73, 0.2);
  color: #f85149;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.rtt {
  margin-left: 4px;
  color: #888;
  font-size: 11px;
}

/* Buttons */
.btn-primary,
.btn-secondary {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: var(--primary, #3fb950);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover, #2ea043);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text, #e0e0e0);
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

/* Modal */
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
  background: var(--panel, #161616);
  border: 1px solid var(--border, #333);
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
  border-bottom: 1px solid var(--border, #333);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: var(--muted, #888);
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
  color: var(--text, #e0e0e0);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

/* Form Styling */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text, #e0e0e0);
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--input-bg, #050505);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  color: var(--text, #e0e0e0);
  font-size: 14px;
  font-family: var(--mono, monospace);
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent, #58a6ff);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
}

.help-text {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted, #888);
  line-height: 1.4;
}

.form-textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--input-bg, #050505);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  color: var(--text, #e0e0e0);
  font-size: 13px;
  font-family: var(--mono, monospace);
  transition: all 0.2s;
  resize: vertical;
  line-height: 1.5;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--accent, #58a6ff);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border, #333);
}

/* Widget Type Selection */
.widget-type-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.widget-type-btn {
  background: var(--panel, #161616);
  border: 2px solid var(--border, #333);
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
  border-color: var(--accent, #58a6ff);
  background: rgba(88, 166, 255, 0.1);
  transform: translateY(-2px);
}

.widget-type-icon {
  font-size: 32px;
  margin-bottom: 4px;
}

.widget-type-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #e0e0e0);
}

.widget-type-desc {
  font-size: 11px;
  color: var(--muted, #888);
  line-height: 1.3;
}
</style>
