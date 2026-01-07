import type { ThresholdRule, MapMarker } from './dashboard'

/**
 * Widget Form State
 * 
 * Grug say: Flat structure for simple widgets, nested for complex ones (map).
 * ConfigureWidgetModal uses this to manage all widget config forms.
 */
export interface WidgetFormState {
  // Common
  title: string
  subject: string
  jsonPath: string
  bufferSize: number
  
  // KV Widget
  kvBucket: string
  kvKey: string
  
  // Button Widget
  buttonLabel: string
  buttonPayload: string
  buttonColor: string
  
  // Thresholds (Text, KV, Stat)
  thresholds: ThresholdRule[]
  
  // Switch Widget
  switchMode: 'kv' | 'core'
  switchDefaultState: 'on' | 'off'
  switchStateSubject: string
  switchOnPayload: string
  switchOffPayload: string
  switchLabelOn: string
  switchLabelOff: string
  switchConfirm: boolean
  
  // Slider Widget
  sliderMode: 'kv' | 'core'
  sliderStateSubject: string
  sliderValueTemplate: string
  sliderMin: number
  sliderMax: number
  sliderStep: number
  sliderDefault: number
  sliderUnit: string
  sliderConfirm: boolean
  
  // Stat Widget
  statFormat: string
  statUnit: string
  statShowTrend: boolean
  statTrendWindow: number
  
  // Gauge Widget
  gaugeMin: number
  gaugeMax: number
  gaugeUnit: string
  gaugeZones: Array<{ min: number; max: number; color: string }>
  
  // Map Widget - V2: Full structured data
  mapCenterLat: number
  mapCenterLon: number
  mapZoom: number
  mapMarkers: MapMarker[]  // Full array of markers with nested actions
}

/**
 * Create empty form state with defaults
 * Grug say: Useful for resetting form or creating new widget config
 */
export function createEmptyFormState(): WidgetFormState {
  return {
    title: '',
    subject: '',
    jsonPath: '',
    bufferSize: 100,
    kvBucket: '',
    kvKey: '',
    buttonLabel: '',
    buttonPayload: '',
    buttonColor: '',
    thresholds: [],
    switchMode: 'kv',
    switchDefaultState: 'off',
    switchStateSubject: '',
    switchOnPayload: '{"state": "on"}',
    switchOffPayload: '{"state": "off"}',
    switchLabelOn: 'ON',
    switchLabelOff: 'OFF',
    switchConfirm: false,
    sliderMode: 'core',
    sliderStateSubject: '',
    sliderValueTemplate: '{{value}}',
    sliderMin: 0,
    sliderMax: 100,
    sliderStep: 1,
    sliderDefault: 50,
    sliderUnit: '',
    sliderConfirm: false,
    statFormat: '',
    statUnit: '',
    statShowTrend: true,
    statTrendWindow: 10,
    gaugeMin: 0,
    gaugeMax: 100,
    gaugeUnit: '',
    gaugeZones: [],
    mapCenterLat: 39.8283,
    mapCenterLon: -98.5795,
    mapZoom: 4,
    mapMarkers: [],
  }
}
