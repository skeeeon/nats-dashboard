import type { ThresholdRule } from './dashboard'

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
  
  // Map Widget (V1: single marker, single action - flat structure)
  mapCenterLat: number
  mapCenterLon: number
  mapZoom: number
  mapMarkerLabel: string
  mapMarkerLat: number
  mapMarkerLon: number
  mapActionLabel: string
  mapActionSubject: string
  mapActionPayload: string
}
