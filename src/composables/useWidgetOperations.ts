import { useDashboardStore } from '@/stores/dashboard'
import { useWidgetDataStore } from '@/stores/widgetData'
import { useNatsStore } from '@/stores/nats'
import { getSubscriptionManager } from '@/composables/useSubscriptionManager'
import { createDefaultWidget } from '@/types/dashboard'
import type { WidgetType, WidgetConfig } from '@/types/dashboard'

/**
 * Widget Operations Composable
 * 
 * Grug say: All widget CRUD operations in one place.
 * Subscribe, unsubscribe, create, delete, duplicate.
 * Don't repeat yourself - use this everywhere.
 */
export function useWidgetOperations() {
  const dashboardStore = useDashboardStore()
  const dataStore = useWidgetDataStore()
  const natsStore = useNatsStore()
  const subManager = getSubscriptionManager()

  /**
   * Subscribe widget to its data source
   * Grug say: Start listening to NATS for this widget
   */
  function subscribeWidget(widgetId: string) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return
    
    // Initialize data buffer
    dataStore.initializeBuffer(widgetId, widget.buffer.maxCount, widget.buffer.maxAge)
    
    // Subscribe to NATS if it's a subscription-based widget
    if (widget.dataSource.type === 'subscription') {
      const subject = widget.dataSource.subject
      if (!subject) return
      subManager.subscribe(widgetId, subject, widget.jsonPath)
    }
  }

  /**
   * Unsubscribe widget from its data source
   * Grug say: Stop listening, clean up memory
   */
  function unsubscribeWidget(widgetId: string) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return
    
    // Unsubscribe from NATS
    if (widget.dataSource.type === 'subscription' && widget.dataSource.subject) {
      subManager.unsubscribe(widgetId, widget.dataSource.subject)
    }
    
    // Remove data buffer
    dataStore.removeBuffer(widgetId)
  }

  /**
   * Subscribe all widgets in active dashboard
   * Grug say: Connect everything when dashboard loads
   */
  function subscribeAllWidgets() {
    dashboardStore.activeWidgets.forEach(widget => subscribeWidget(widget.id))
  }

  /**
   * Unsubscribe all widgets
   * Grug say: Disconnect everything when switching dashboards or disconnecting
   */
  function unsubscribeAllWidgets() {
    dashboardStore.activeWidgets.forEach(widget => unsubscribeWidget(widget.id))
  }

  /**
   * Check if widget type needs data subscription
   * Grug say: Control widgets (button, switch, slider) manage their own connections
   */
  function needsSubscription(widgetType: WidgetType): boolean {
    // These widgets handle their own connections internally
    const selfManagedTypes: WidgetType[] = ['button', 'kv', 'switch', 'slider']
    return !selfManagedTypes.includes(widgetType)
  }

  /**
   * Create new widget
   * Grug say: Make widget, add to dashboard, subscribe if needed
   */
  function createWidget(type: WidgetType) {
    const position = { x: 0, y: 100 }
    const widget = createDefaultWidget(type, position)
    
    // Set sensible defaults based on type
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
        // Config already set by createDefaultWidget
        break
      case 'slider':
        widget.title = 'Slider Control'
        // Config already set by createDefaultWidget
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
    }
    
    // Add to dashboard
    dashboardStore.addWidget(widget)
    
    // Subscribe if it's a data widget and NATS is connected
    if (natsStore.isConnected && needsSubscription(type)) {
      subscribeWidget(widget.id)
    }
    
    return widget
  }

  /**
   * Delete widget
   * Grug say: Unsubscribe first, then remove from dashboard
   */
  function deleteWidget(widgetId: string) {
    unsubscribeWidget(widgetId)
    dashboardStore.removeWidget(widgetId)
  }

  /**
   * Duplicate widget
   * Grug say: Copy widget, give it new ID, place below original
   */
  function duplicateWidget(widgetId: string) {
    const original = dashboardStore.getWidget(widgetId)
    if (!original) return null
    
    // Deep clone the widget
    const copy = JSON.parse(JSON.stringify(original))
    copy.id = `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    copy.title = `${original.title} (Copy)`
    copy.y = original.y + original.h + 1
    copy.x = original.x
    
    // Add to dashboard
    dashboardStore.addWidget(copy)
    
    // Subscribe if it's a data widget and NATS is connected
    if (natsStore.isConnected && needsSubscription(copy.type)) {
      subscribeWidget(copy.id)
    }
    
    return copy
  }

  /**
   * Safely update widget configuration
   * 
   * Grug say: Crucial step.
   * 1. Unsubscribe using OLD config (so we know what subject to stop listening to)
   * 2. Update store with NEW config
   * 3. Subscribe using NEW config
   * 
   * This prevents "ghost subscriptions" where we update store first, then try to 
   * unsubscribe, but can't find the old subject anymore.
   */
  function updateWidgetConfiguration(widgetId: string, updates: Partial<WidgetConfig>) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return

    // 1. Unsubscribe using CURRENT (old) configuration
    if (needsSubscription(widget.type)) {
      unsubscribeWidget(widgetId)
    }

    // 2. Update the blueprint in the store
    dashboardStore.updateWidget(widgetId, updates)

    // 3. Subscribe using NEW configuration
    if (natsStore.isConnected && needsSubscription(widget.type)) {
      subscribeWidget(widgetId)
    }
  }

  /**
   * Resubscribe widget after configuration change
   * @deprecated Use updateWidgetConfiguration instead for atomic updates
   */
  function resubscribeWidget(widgetId: string) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget || !natsStore.isConnected) return
    
    if (needsSubscription(widget.type)) {
      unsubscribeWidget(widgetId)
      subscribeWidget(widgetId)
    }
  }

  return {
    // Single widget operations
    subscribeWidget,
    unsubscribeWidget,
    resubscribeWidget,
    updateWidgetConfiguration, // NEW explicit update function
    
    // Bulk operations
    subscribeAllWidgets,
    unsubscribeAllWidgets,
    
    // CRUD operations
    createWidget,
    deleteWidget,
    duplicateWidget,
    
    // Utilities
    needsSubscription,
  }
}
