/**
 * Widget Types
 */
export type WidgetType = 'chart' | 'text' | 'button' | 'kv'
export type DataSourceType = 'subscription' | 'consumer' | 'kv'
export type ChartType = 'line' | 'bar' | 'pie' | 'gauge'

// --- NEW: Threshold Types ---
export type ThresholdOperator = '>' | '>=' | '<' | '<=' | '==' | '!='

export interface ThresholdRule {
  id: string
  operator: ThresholdOperator
  value: string      // Stored as string, parsed during evaluation
  color: string      // Hex or CSS var
}
// ----------------------------

export interface DataSourceConfig {
  type: DataSourceType
  subject?: string
  stream?: string
  consumer?: string
  kvBucket?: string
  kvKey?: string
}

export interface BufferConfig {
  maxCount: number
  maxAge?: number
}

export interface ChartWidgetConfig {
  chartType: ChartType
  echartOptions?: any
}

export interface TextWidgetConfig {
  format?: string
  fontSize?: number
  color?: string
  thresholds?: ThresholdRule[] // Added
}

export interface ButtonWidgetConfig {
  label: string
  publishSubject: string
  payload: string
  color?: string
}

export interface KvWidgetConfig {
  displayFormat?: 'raw' | 'json'
  refreshInterval?: number
  thresholds?: ThresholdRule[] // Added
}

export interface WidgetConfig {
  id: string
  type: WidgetType
  title: string
  x: number
  y: number
  w: number
  h: number
  dataSource: DataSourceConfig
  jsonPath?: string
  buffer: BufferConfig
  
  chartConfig?: ChartWidgetConfig
  textConfig?: TextWidgetConfig
  buttonConfig?: ButtonWidgetConfig
  kvConfig?: KvWidgetConfig
}

export interface Dashboard {
  id: string
  name: string
  description?: string
  created: number
  modified: number
  widgets: WidgetConfig[]
}

export const DEFAULT_WIDGET_SIZES: Record<WidgetType, { w: number; h: number }> = {
  chart: { w: 6, h: 4 },
  text: { w: 3, h: 2 },
  button: { w: 2, h: 1 },
  kv: { w: 4, h: 3 },
}

export const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  maxCount: 100,
}

export function createDefaultWidget(type: WidgetType, position: { x: number; y: number }): WidgetConfig {
  const size = DEFAULT_WIDGET_SIZES[type]
  const id = `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const base: WidgetConfig = {
    id,
    type,
    title: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Widget`,
    x: position.x,
    y: position.y,
    w: size.w,
    h: size.h,
    dataSource: { type: 'subscription' },
    buffer: { ...DEFAULT_BUFFER_CONFIG },
  }
  
  switch (type) {
    case 'chart':
      base.chartConfig = { chartType: 'line' }
      break
    case 'text':
      base.textConfig = { fontSize: 24, color: '#e0e0e0', thresholds: [] }
      break
    case 'button':
      base.buttonConfig = { label: 'Send', publishSubject: 'button.clicked', payload: '{}' }
      break
    case 'kv':
      base.kvConfig = { displayFormat: 'json', thresholds: [] }
      break
  }
  
  return base
}

export function createDefaultDashboard(name: string): Dashboard {
  const now = Date.now()
  return {
    id: `dashboard_${now}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    description: '',
    created: now,
    modified: now,
    widgets: [],
  }
}
