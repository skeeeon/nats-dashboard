/**
 * Widget Types
 * Grug say: Four types of widget. Chart show graph. Text show value. Button push message. KV show key.
 */
export type WidgetType = 'chart' | 'text' | 'button' | 'kv'

/**
 * Data Source Types
 * Grug say: Three ways to get data. Subscribe to subject. Consume from stream. Watch KV key.
 */
export type DataSourceType = 'subscription' | 'consumer' | 'kv'

/**
 * Chart Types (for ChartWidget)
 */
export type ChartType = 'line' | 'bar' | 'pie' | 'gauge'

/**
 * Data Source Configuration
 * Grug say: Tell widget where to get data from
 */
export interface DataSourceConfig {
  type: DataSourceType
  
  // For subscription (NATS Core)
  subject?: string
  
  // For consumer (JetStream)
  stream?: string
  consumer?: string  // Optional - if not provided, create ephemeral
  
  // For KV Store
  kvBucket?: string
  kvKey?: string
}

/**
 * Message Buffer Configuration
 * Grug say: How many messages to keep. Start with count, add time later.
 */
export interface BufferConfig {
  maxCount: number     // Keep last N messages (default: 100)
  maxAge?: number      // Keep messages from last N milliseconds (future enhancement)
}

/**
 * Chart Widget Configuration
 */
export interface ChartWidgetConfig {
  chartType: ChartType
  echartOptions?: any  // ECharts options - use 'any' to avoid deep type checking issues
}

/**
 * Text Widget Configuration
 */
export interface TextWidgetConfig {
  format?: string       // Template string like "{value}°C" or just show raw value
  fontSize?: number     // Font size in pixels
  color?: string        // Text color
}

/**
 * Button Widget Configuration
 */
export interface ButtonWidgetConfig {
  label: string              // Button text
  publishSubject: string     // Where to send message
  payload: string            // Message payload (JSON string)
  color?: string             // Button color
}

/**
 * KV Widget Configuration
 */
export interface KvWidgetConfig {
  displayFormat?: 'raw' | 'json'  // How to display value
  refreshInterval?: number         // Auto-refresh every N ms (optional)
}

/**
 * Widget Configuration
 * Grug say: This is blueprint for one widget. Everything widget need to know.
 */
export interface WidgetConfig {
  // Identity
  id: string
  type: WidgetType
  title: string
  
  // Layout (grid position)
  x: number
  y: number
  w: number  // Width in grid units
  h: number  // Height in grid units
  
  // Data source
  dataSource: DataSourceConfig
  jsonPath?: string  // JSONPath to extract data from message (e.g., "$.temperature")
  
  // Buffering
  buffer: BufferConfig
  
  // Widget-specific configuration
  chartConfig?: ChartWidgetConfig
  textConfig?: TextWidgetConfig
  buttonConfig?: ButtonWidgetConfig
  kvConfig?: KvWidgetConfig
}

/**
 * Dashboard Configuration
 * Grug say: Dashboard is collection of widgets. Like shelf with many boxes.
 */
export interface Dashboard {
  id: string
  name: string
  description?: string
  created: number      // Timestamp
  modified: number     // Timestamp
  widgets: WidgetConfig[]
}

/**
 * Default Widget Sizes
 * Grug say: Good starting sizes for each widget type
 */
export const DEFAULT_WIDGET_SIZES: Record<WidgetType, { w: number; h: number }> = {
  chart: { w: 6, h: 4 },     // Medium size for charts
  text: { w: 3, h: 2 },      // Small size for text
  button: { w: 2, h: 1 },    // Compact button
  kv: { w: 4, h: 3 },        // Medium size for KV display
}

/**
 * Default Buffer Configuration
 */
export const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  maxCount: 100,  // Keep last 100 messages by default
}

/**
 * Helper: Create new widget with defaults
 * Grug say: Make creating widget easy. Fill in sensible defaults.
 */
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
  
  // Add type-specific defaults
  switch (type) {
    case 'chart':
      base.chartConfig = {
        chartType: 'line',
      }
      break
    case 'text':
      base.textConfig = {
        fontSize: 24,
        color: '#e0e0e0',
      }
      break
    case 'button':
      base.buttonConfig = {
        label: 'Send',
        publishSubject: 'button.clicked',
        payload: '{}',
      }
      break
    case 'kv':
      base.kvConfig = {
        displayFormat: 'json',
      }
      break
  }
  
  return base
}

/**
 * Helper: Create new dashboard with defaults
 */
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
