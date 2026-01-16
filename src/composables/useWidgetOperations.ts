// src/composables/useWidgetOperations.ts
import { useDashboardStore } from '@/stores/dashboard'
import { useWidgetDataStore } from '@/stores/widgetData'
import { useNatsStore } from '@/stores/nats'
import { getSubscriptionManager } from '@/composables/useSubscriptionManager'
import { createDefaultWidget } from '@/types/dashboard'
import { resolveTemplate } from '@/utils/variables'
import type { WidgetType, WidgetConfig, DataSourceConfig } from '@/types/dashboard'

/**
 * Widget Operations Composable
 * 
 * Centralized widget lifecycle management:
 * - Create/Delete/Duplicate widgets
 * - Subscribe/Unsubscribe widget data sources
 * - Handle configuration updates
 * 
 * Grug say: One place to do all widget things. Don't scatter logic.
 */

export function useWidgetOperations() {
  const dashboardStore = useDashboardStore()
  const dataStore = useWidgetDataStore()
  const natsStore = useNatsStore()
  const subManager = getSubscriptionManager()

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Subscribe a widget to its data source(s)
   */
  function subscribeWidget(widgetId: string) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return
    
    // Initialize buffer
    dataStore.initializeBuffer(widgetId, widget.buffer.maxCount, widget.buffer.maxAge)
    
    // Subscribe based on widget type
    if (widget.dataSource.type === 'subscription') {
      subscribeToDataSource(widgetId, widget)
    }

    // Map widget dynamic markers
    if (widget.type === 'map' && widget.mapConfig?.markers) {
      subscribeMapMarkers(widgetId, widget.mapConfig.markers)
    }
  }

  /**
   * Subscribe to standard data source (subject or subjects array)
   */
  function subscribeToDataSource(widgetId: string, widget: WidgetConfig) {
    const subjects = getWidgetSubjects(widget)
    
    for (const rawSubject of subjects) {
      const subject = resolveTemplate(rawSubject, dashboardStore.currentVariableValues)
      if (!subject) continue
      
      const config: DataSourceConfig = { 
        ...widget.dataSource, 
        subject 
      }
      subManager.subscribe(widgetId, config, widget.jsonPath)
    }
  }

  /**
   * Subscribe to map marker dynamic position sources
   */
  function subscribeMapMarkers(widgetId: string, markers: any[]) {
    for (const marker of markers) {
      const pos = marker.positionConfig
      if (pos?.mode === 'dynamic' && pos.subject) {
        const subject = resolveTemplate(pos.subject, dashboardStore.currentVariableValues)
        if (subject) {
          subManager.subscribe(widgetId, {
            type: 'subscription',
            subject,
            useJetStream: pos.useJetStream,
            deliverPolicy: pos.deliverPolicy || 'last'
          })
        }
      }
    }
  }

  /**
   * Get all subjects a widget subscribes to
   */
  function getWidgetSubjects(widget: WidgetConfig): string[] {
    if (widget.dataSource.subjects && widget.dataSource.subjects.length > 0) {
      return widget.dataSource.subjects
    }
    if (widget.dataSource.subject) {
      return [widget.dataSource.subject]
    }
    return []
  }

  /**
   * Unsubscribe a widget from all its data sources
   */
  function unsubscribeWidget(widgetId: string, keepData: boolean = false) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return
    
    // Unsubscribe standard data source
    if (widget.dataSource.type === 'subscription') {
      const subjects = getWidgetSubjects(widget)
      
      for (const rawSubject of subjects) {
        const subject = resolveTemplate(rawSubject, dashboardStore.currentVariableValues)
        if (!subject) continue
        
        const config: DataSourceConfig = { ...widget.dataSource, subject }
        subManager.unsubscribe(widgetId, config)
      }
    }

    // Unsubscribe map markers
    if (widget.type === 'map' && widget.mapConfig?.markers) {
      for (const marker of widget.mapConfig.markers) {
        const pos = marker.positionConfig
        if (pos?.mode === 'dynamic' && pos.subject) {
          const subject = resolveTemplate(pos.subject, dashboardStore.currentVariableValues)
          if (subject) {
            subManager.unsubscribe(widgetId, {
              type: 'subscription',
              subject
            })
          }
        }
      }
    }
    
    // Clear buffer unless keeping data
    if (!keepData) {
      dataStore.removeBuffer(widgetId)
    }
  }

  /**
   * Subscribe all widgets in the active dashboard
   */
  function subscribeAllWidgets() {
    for (const widget of dashboardStore.activeWidgets) {
      if (needsSubscription(widget.type, widget)) {
        subscribeWidget(widget.id)
      }
    }
  }

  /**
   * Unsubscribe all widgets
   */
  function unsubscribeAllWidgets(keepData: boolean = false) {
    for (const widget of dashboardStore.activeWidgets) {
      if (needsSubscription(widget.type, widget)) {
        unsubscribeWidget(widget.id, keepData)
      }
    }
  }

  /**
   * Check if a widget type needs subscription management
   * 
   * Some widgets manage their own subscriptions (KV, Switch, etc.)
   */
  function needsSubscription(widgetType: WidgetType, config?: WidgetConfig): boolean {
    // Map widgets need subscription for dynamic markers
    if (widgetType === 'map') return true

    // These manage their own connections
    const selfManagedTypes: WidgetType[] = ['button', 'kv', 'switch', 'slider', 'publisher'] 
    if (selfManagedTypes.includes(widgetType)) return false
    
    // Status widget: only if using subscription (not KV)
    if (widgetType === 'status') {
      return config?.dataSource?.type !== 'kv'
    }
    
    // Markdown: only if it has a subject configured
    if (widgetType === 'markdown') {
      return !!(config?.dataSource?.subject)
    }
    
    return true
  }

  // ============================================================================
  // WIDGET CRUD
  // ============================================================================

  /**
   * Create a new widget
   */
  function createWidget(type: WidgetType) {
    const position = { x: 0, y: 100 }
    const widget = createDefaultWidget(type, position)
    
    // Set sensible defaults based on type
    applyWidgetDefaults(widget, type)
    
    dashboardStore.addWidget(widget)
    
    // Subscribe if connected
    if (natsStore.isConnected && needsSubscription(type, widget)) {
      subscribeWidget(widget.id)
    }
    
    return widget
  }

  /**
   * Apply type-specific defaults to a new widget
   */
  function applyWidgetDefaults(widget: WidgetConfig, type: WidgetType) {
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
      case 'switch':
        widget.title = 'Switch Control'
        break
      case 'slider':
        widget.title = 'Slider Control'
        break
      case 'stat':
        widget.title = 'Stat Card'
        widget.dataSource = { type: 'subscription', subject: 'metrics.value' }
        widget.jsonPath = '$.value'
        break
      case 'gauge':
        widget.title = 'Gauge Meter'
        widget.dataSource = { type: 'subscription', subject: 'sensor.value' }
        widget.jsonPath = '$.value'
        break
      case 'map':
        widget.title = 'Map Widget'
        widget.mapConfig = {
          center: { lat: 39.8283, lon: -98.5795 },
          zoom: 4,
          markers: []
        }
        break
      case 'console':
        widget.title = 'Console Stream'
        widget.dataSource = { type: 'subscription', subject: '>', subjects: ['>'] }
        widget.consoleConfig = { fontSize: 12, showTimestamp: true }
        widget.buffer.maxCount = 200
        break
      case 'publisher':
        widget.title = 'Publisher'
        widget.publisherConfig = {
          defaultSubject: 'test.subject',
          defaultPayload: '{\n  "msg": "hello"\n}',
          history: []
        }
        break
      case 'status':
        widget.title = 'Status'
        widget.dataSource = { type: 'subscription', subject: 'service.status' }
        widget.statusConfig = {
          mappings: [
            { id: '1', value: 'online', color: 'var(--color-success)', label: 'Online', blink: false },
            { id: '2', value: 'error', color: 'var(--color-error)', label: 'Error', blink: true }
          ],
          defaultColor: 'var(--color-info)',
          defaultLabel: 'Unknown',
          showStale: true,
          stalenessThreshold: 60000,
          staleColor: 'var(--muted)',
          staleLabel: 'Stale'
        }
        break
      case 'markdown':
        widget.title = ''
        widget.dataSource = { type: 'subscription', subject: '' }
        widget.markdownConfig = {
          content: '### Notes\n\nThis is a text block. You can use **markdown**.\n\nVariables: {{device_id}}'
        }
        break
    }
  }

  /**
   * Delete a widget
   */
  function deleteWidget(widgetId: string) {
    unsubscribeWidget(widgetId, false)
    dashboardStore.removeWidget(widgetId)
  }

  /**
   * Duplicate a widget
   */
  function duplicateWidget(widgetId: string) {
    const original = dashboardStore.getWidget(widgetId)
    if (!original) return null
    
    const copy = JSON.parse(JSON.stringify(original))
    const now = Date.now()
    copy.id = `widget_${now}_${Math.random().toString(36).substr(2, 9)}`
    copy.title = `${original.title} (Copy)`
    copy.y = original.y + original.h + 1
    copy.x = original.x
    
    dashboardStore.addWidget(copy)
    
    if (natsStore.isConnected && needsSubscription(copy.type, copy)) {
      subscribeWidget(copy.id)
    }
    
    return copy
  }

  /**
   * Update widget configuration
   * 
   * Handles resubscription when data source changes
   */
  function updateWidgetConfiguration(widgetId: string, updates: Partial<WidgetConfig>) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return

    // Unsubscribe from old config
    if (needsSubscription(widget.type, widget)) {
      unsubscribeWidget(widgetId, false) 
    }

    // Apply updates
    dashboardStore.updateWidget(widgetId, updates)

    // Resubscribe with new config
    const updatedWidget = dashboardStore.getWidget(widgetId)!
    if (natsStore.isConnected && needsSubscription(updatedWidget.type, updatedWidget)) {
      subscribeWidget(widgetId)
    }
  }

  /**
   * Force resubscribe a widget
   * 
   * Useful when variables change or connection is restored
   */
  function resubscribeWidget(widgetId: string) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget || !natsStore.isConnected) return
    
    if (needsSubscription(widget.type, widget)) {
      unsubscribeWidget(widgetId, false)
      subscribeWidget(widgetId)
    }
  }

  return {
    // Subscription management
    subscribeWidget,
    unsubscribeWidget,
    resubscribeWidget,
    subscribeAllWidgets,
    unsubscribeAllWidgets,
    needsSubscription,
    
    // CRUD
    createWidget,
    deleteWidget,
    duplicateWidget,
    updateWidgetConfiguration,
  }
}
