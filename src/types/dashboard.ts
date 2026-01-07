/**
 * Widget Types
 */
export type WidgetType = 'chart' | 'text' | 'button' | 'kv' | 'switch' | 'slider' | 'stat' | 'gauge' | 'map'
export type DataSourceType = 'subscription' | 'consumer' | 'kv'
export type ChartType = 'line' | 'bar' | 'pie' | 'gauge'

// --- Threshold Types ---
export type ThresholdOperator = '>' | '>=' | '<' | '<=' | '==' | '!='

export interface ThresholdRule {
  id: string
  operator: ThresholdOperator
  value: string
  color: string
}

// --- Data Source Configuration ---
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

// --- Widget-Specific Configurations ---
export interface ChartWidgetConfig {
  chartType: ChartType
  echartOptions?: any
}

export interface TextWidgetConfig {
  format?: string
  fontSize?: number
  color?: string
  thresholds?: ThresholdRule[]
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
  thresholds?: ThresholdRule[]
}

export interface SwitchWidgetConfig {
  mode: 'kv' | 'core'
  kvBucket?: string
  kvKey?: string
  defaultState?: 'on' | 'off'
  stateSubject?: string
  publishSubject: string
  onPayload: any
  offPayload: any
  confirmOnChange?: boolean
  confirmMessage?: string
  labels?: {
    on?: string
    off?: string
  }
}

export interface SliderWidgetConfig {
  mode: 'core' | 'kv'
  publishSubject: string
  stateSubject?: string
  kvBucket?: string
  kvKey?: string
  min: number
  max: number
  step: number
  defaultValue: number
  unit?: string
  valueTemplate?: string
  jsonPath?: string
  confirmOnChange?: boolean
  confirmMessage?: string
}

export interface StatCardWidgetConfig {
  format?: string
  unit?: string
  showTrend?: boolean
  trendWindow?: number
  thresholds?: ThresholdRule[]
}

export interface GaugeWidgetConfig {
  min: number
  max: number
  unit?: string
  zones?: {
    min: number
    max: number
    color: string
  }[]
}

// --- Map Widget Types ---

/**
 * Map Widget Limits
 * Grug say: Reasonable limits for localStorage and UI usability.
 * - 50 markers max: Leaflet handles more, but config storage and UI get unwieldy
 * - 10 actions max: A popup with 10 buttons/switches is already crowded
 */
export const MAP_LIMITS = {
  MAX_MARKERS: 50,
  MAX_ACTIONS_PER_MARKER: 10,
} as const

/**
 * Map Action Type
 * Grug say: Two types. Publish is fire-and-forget. Switch is stateful toggle.
 */
export type MapActionType = 'publish' | 'switch'

/**
 * Map Marker Action - Switch Configuration
 * Grug say: Same structure as SwitchWidget config, embedded in action.
 */
export interface MapActionSwitchConfig {
  mode: 'kv' | 'core'
  kvBucket?: string
  kvKey?: string
  publishSubject?: string
  stateSubject?: string
  onPayload: any
  offPayload: any
  confirmOnChange?: boolean
  labels?: {
    on?: string
    off?: string
  }
}

/**
 * Map Marker Action
 * Grug say: Click action in popup. Can be publish (like button) or switch (stateful toggle).
 */
export interface MapMarkerAction {
  id: string
  type: MapActionType
  label: string
  // For publish type
  subject?: string
  payload?: string
  // For switch type
  switchConfig?: MapActionSwitchConfig
}

/**
 * Map Marker
 * Grug say: Point on map. Has location and multiple actions.
 */
export interface MapMarker {
  id: string
  label: string
  lat: number
  lon: number
  color?: string
  actions: MapMarkerAction[]
}

/**
 * Map Widget Configuration
 * Grug say: Show map with markers. Click markers to do things.
 * Supports multiple markers, each with multiple actions (publish or switch).
 */
export interface MapWidgetConfig {
  center: {
    lat: number
    lon: number
  }
  zoom: number
  markers: MapMarker[]
}

// --- Main Widget Configuration ---
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
  switchConfig?: SwitchWidgetConfig
  sliderConfig?: SliderWidgetConfig
  statConfig?: StatCardWidgetConfig
  gaugeConfig?: GaugeWidgetConfig
  mapConfig?: MapWidgetConfig
}

export interface Dashboard {
  id: string
  name: string
  description?: string
  created: number
  modified: number
  widgets: WidgetConfig[]
}

// --- Default Widget Sizes ---
export const DEFAULT_WIDGET_SIZES: Record<WidgetType, { w: number; h: number }> = {
  chart: { w: 6, h: 4 },
  text: { w: 2, h: 2 },
  button: { w: 2, h: 2 },
  kv: { w: 4, h: 3 },
  switch: { w: 2, h: 2 },
  slider: { w: 4, h: 2 },
  stat: { w: 3, h: 2 },
  gauge: { w: 3, h: 3 },
  map: { w: 6, h: 4 },
}

export const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  maxCount: 10,
}

// --- Widget Factory Functions ---
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
      base.textConfig = { fontSize: 24, thresholds: [] }
      break
    case 'button':
      base.buttonConfig = { label: 'Send', publishSubject: 'button.clicked', payload: '{}' }
      break
    case 'kv':
      base.kvConfig = { displayFormat: 'json', thresholds: [] }
      break
    case 'switch':
      base.switchConfig = {
        mode: 'kv',
        kvBucket: 'device-states',
        kvKey: 'device.switch',
        publishSubject: 'device.control',
        onPayload: { state: 'on' },
        offPayload: { state: 'off' },
        labels: { on: 'ON', off: 'OFF' }
      }
      break
    case 'slider':
      base.sliderConfig = {
        mode: 'core',
        publishSubject: 'device.slider',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 50,
        valueTemplate: '{{value}}',
        unit: '%'
      }
      break
    case 'stat':
      base.dataSource = { type: 'subscription', subject: 'metrics.value' }
      base.statConfig = {
        unit: '',
        showTrend: true,
        trendWindow: 10,
        thresholds: []
      }
      break
    case 'gauge':
      base.dataSource = { type: 'subscription', subject: 'sensor.value' }
      base.gaugeConfig = {
        min: 0,
        max: 100,
        unit: '',
        zones: [
          { min: 0, max: 60, color: 'var(--color-success)' },
          { min: 60, max: 80, color: 'var(--color-warning)' },
          { min: 80, max: 100, color: 'var(--color-error)' }
        ]
      }
      break
    case 'map':
      base.mapConfig = {
        center: { lat: 39.8283, lon: -98.5795 }, // US center
        zoom: 4,
        markers: []
      }
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

// --- Helper: Create default marker ---
export function createDefaultMarker(): MapMarker {
  return {
    id: `marker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    label: 'New Marker',
    lat: 0,
    lon: 0,
    actions: []
  }
}

// --- Helper: Create default action ---
export function createDefaultAction(type: MapActionType = 'publish'): MapMarkerAction {
  const id = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  if (type === 'switch') {
    return {
      id,
      type: 'switch',
      label: 'Toggle',
      switchConfig: {
        mode: 'kv',
        kvBucket: 'device-states',
        kvKey: 'device.switch',
        onPayload: { state: 'on' },
        offPayload: { state: 'off' },
        labels: { on: 'ON', off: 'OFF' }
      }
    }
  }
  
  return {
    id,
    type: 'publish',
    label: 'Send',
    subject: 'marker.action',
    payload: '{}'
  }
}
