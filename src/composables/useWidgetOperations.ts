// src/composables/useWidgetOperations.ts
import { useDashboardStore } from '@/stores/dashboard'
import { useWidgetDataStore } from '@/stores/widgetData'
import { useNatsStore } from '@/stores/nats'
import { getSubscriptionManager } from '@/composables/useSubscriptionManager'
import { createDefaultWidget } from '@/types/dashboard'
import { resolveTemplate } from '@/utils/variables'
import type { WidgetType, WidgetConfig } from '@/types/dashboard'

export function useWidgetOperations() {
  const dashboardStore = useDashboardStore()
  const dataStore = useWidgetDataStore()
  const natsStore = useNatsStore()
  const subManager = getSubscriptionManager()

  function subscribeWidget(widgetId: string) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return
    
    dataStore.initializeBuffer(widgetId, widget.buffer.maxCount, widget.buffer.maxAge)
    
    if (widget.dataSource.type === 'subscription') {
      const rawSubject = widget.dataSource.subject
      if (!rawSubject) return
      
      const subject = resolveTemplate(rawSubject, dashboardStore.currentVariableValues)
      
      // Clone config to ensure we pass the resolved subject
      const config = { 
        ...widget.dataSource, 
        subject 
      }
      
      subManager.subscribe(widgetId, config, widget.jsonPath)
    }
  }

  function unsubscribeWidget(widgetId: string, keepData: boolean = false) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return
    
    if (widget.dataSource.type === 'subscription' && widget.dataSource.subject) {
      const subject = resolveTemplate(widget.dataSource.subject, dashboardStore.currentVariableValues)
      
      // We must pass the config so the manager knows if it's JS or Core
      // to calculate the correct map key
      const config = { ...widget.dataSource, subject }
      subManager.unsubscribe(widgetId, config)
    }
    
    if (!keepData) {
      dataStore.removeBuffer(widgetId)
    }
  }

  function subscribeAllWidgets() {
    dashboardStore.activeWidgets.forEach(widget => subscribeWidget(widget.id))
  }

  function unsubscribeAllWidgets(keepData: boolean = false) {
    dashboardStore.activeWidgets.forEach(widget => unsubscribeWidget(widget.id, keepData))
  }

  function needsSubscription(widgetType: WidgetType): boolean {
    const selfManagedTypes: WidgetType[] = ['button', 'kv', 'switch', 'slider', 'map', 'publisher']
    return !selfManagedTypes.includes(widgetType)
  }

  function createWidget(type: WidgetType) {
    const position = { x: 0, y: 100 }
    const widget = createDefaultWidget(type, position)
    
    // Set sensible defaults
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
        widget.dataSource = { type: 'subscription', subject: '>' }
        widget.consoleConfig = { fontSize: 12, showTimestamp: true }
        widget.buffer.maxCount = 200 // Higher default for console
        break
      case 'publisher':
        widget.title = 'Publisher'
        widget.publisherConfig = {
          defaultSubject: 'test.subject',
          defaultPayload: '{\n  "msg": "hello"\n}',
          history: []
        }
        break
    }
    
    dashboardStore.addWidget(widget)
    
    if (natsStore.isConnected && needsSubscription(type)) {
      subscribeWidget(widget.id)
    }
    
    return widget
  }

  function deleteWidget(widgetId: string) {
    unsubscribeWidget(widgetId, false)
    dashboardStore.removeWidget(widgetId)
  }

  function duplicateWidget(widgetId: string) {
    const original = dashboardStore.getWidget(widgetId)
    if (!original) return null
    
    const copy = JSON.parse(JSON.stringify(original))
    copy.id = `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    copy.title = `${original.title} (Copy)`
    copy.y = original.y + original.h + 1
    copy.x = original.x
    
    dashboardStore.addWidget(copy)
    
    if (natsStore.isConnected && needsSubscription(copy.type)) {
      subscribeWidget(copy.id)
    }
    
    return copy
  }

  function updateWidgetConfiguration(widgetId: string, updates: Partial<WidgetConfig>) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return

    // Unsubscribe using CURRENT config (before updates applied)
    // This ensures we clean up the correct subscription key
    if (needsSubscription(widget.type)) {
      unsubscribeWidget(widgetId, false) 
    }

    dashboardStore.updateWidget(widgetId, updates)

    if (natsStore.isConnected && needsSubscription(widget.type)) {
      subscribeWidget(widgetId)
    }
  }

  function resubscribeWidget(widgetId: string) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget || !natsStore.isConnected) return
    
    if (needsSubscription(widget.type)) {
      unsubscribeWidget(widgetId, false)
      subscribeWidget(widgetId)
    }
  }

  return {
    subscribeWidget,
    unsubscribeWidget,
    resubscribeWidget,
    updateWidgetConfiguration,
    subscribeAllWidgets,
    unsubscribeAllWidgets,
    createWidget,
    deleteWidget,
    duplicateWidget,
    needsSubscription,
  }
}
