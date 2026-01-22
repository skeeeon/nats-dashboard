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

  function parseWindowToMs(windowStr: string | undefined): number {
    if (!windowStr) return 300000 
    const match = windowStr.match(/^(\d+)([smhd])$/)
    if (!match) return 300000
    const val = parseInt(match[1])
    const unit = match[2]
    switch (unit) {
      case 's': return val * 1000
      case 'm': return val * 60 * 1000
      case 'h': return val * 60 * 60 * 1000
      case 'd': return val * 24 * 60 * 60 * 1000
      default: return 300000
    }
  }

  function subscribeWidget(widgetId: string) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return
    
    if (widget.dataSource.useJetStream && widget.dataSource.deliverPolicy === 'by_start_time') {
      const buffer = dataStore.getBuffer(widgetId)
      if (buffer.length > 0) {
        const latest = buffer[buffer.length - 1]
        const windowMs = parseWindowToMs(widget.dataSource.timeWindow)
        if (Date.now() - latest.timestamp > windowMs) {
          dataStore.clearBuffer(widgetId)
        }
      }
    }

    dataStore.initializeBuffer(widgetId, widget.buffer.maxCount, widget.buffer.maxAge)
    
    if (widget.dataSource.type === 'subscription') {
      const subjects = widget.dataSource.subjects?.length ? widget.dataSource.subjects : [widget.dataSource.subject!]
      for (const rawSub of subjects) {
        const sub = resolveTemplate(rawSub, dashboardStore.currentVariableValues)
        if (sub) subManager.subscribe(widgetId, { ...widget.dataSource, subject: sub }, widget.jsonPath)
      }
    }

    if (widget.type === 'map' && widget.mapConfig?.markers) {
      for (const marker of widget.mapConfig.markers) {
        const pos = marker.positionConfig
        if (pos?.mode === 'dynamic' && pos.subject) {
          const sub = resolveTemplate(pos.subject, dashboardStore.currentVariableValues)
          if (sub) subManager.subscribe(widgetId, { type: 'subscription', subject: sub, useJetStream: pos.useJetStream, deliverPolicy: pos.deliverPolicy || 'last' })
        }
      }
    }
  }

  function unsubscribeWidget(widgetId: string, keepData: boolean = false) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return
    
    if (widget.dataSource.type === 'subscription') {
      const subjects = widget.dataSource.subjects?.length ? widget.dataSource.subjects : [widget.dataSource.subject!]
      for (const rawSub of subjects) {
        const sub = resolveTemplate(rawSub, dashboardStore.currentVariableValues)
        if (sub) subManager.unsubscribe(widgetId, { ...widget.dataSource, subject: sub })
      }
    }
    
    if (!keepData) dataStore.removeBuffer(widgetId)
  }

  function subscribeAllWidgets() {
    dashboardStore.activeWidgets.forEach(w => subscribeWidget(w.id))
  }

  function unsubscribeAllWidgets(keepData: boolean = false) {
    dashboardStore.activeWidgets.forEach(w => unsubscribeWidget(w.id, keepData))
  }

  function updateWidgetConfiguration(widgetId: string, updates: Partial<WidgetConfig>) {
    const widget = dashboardStore.getWidget(widgetId)
    if (!widget) return
    
    // Unsubscribe from old config if it's a subscription type
    if (widget.dataSource.type === 'subscription') {
      unsubscribeWidget(widgetId, false) 
    }
    
    dashboardStore.updateWidget(widgetId, updates)
    
    // Resubscribe with new config
    subscribeWidget(widgetId)
  }

  return {
    subscribeWidget, 
    unsubscribeWidget, 
    subscribeAllWidgets, 
    unsubscribeAllWidgets,
    updateWidgetConfiguration,
    createWidget: (type: WidgetType) => {
      const w = createDefaultWidget(type, { x: 0, y: 0 })
      dashboardStore.addWidget(w)
      if (natsStore.isConnected) subscribeWidget(w.id)
      return w
    },
    deleteWidget: (id: string) => { unsubscribeWidget(id); dashboardStore.removeWidget(id) },
    duplicateWidget: (id: string) => {
      const orig = dashboardStore.getWidget(id)
      if (!orig) return
      const copy = JSON.parse(JSON.stringify(orig))
      copy.id = `widget_${Date.now()}`
      dashboardStore.addWidget(copy)
      if (natsStore.isConnected) subscribeWidget(copy.id)
    }
  }
}
