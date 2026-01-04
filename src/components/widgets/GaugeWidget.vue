<template>
  <div class="gauge-widget">
    <!-- SVG Gauge -->
    <svg :viewBox="`0 0 ${size} ${size}`" class="gauge-svg">
      <!-- Background track (270° arc) -->
      <path
        :d="backgroundPath"
        fill="none"
        :stroke="backgroundColor"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        class="background-arc"
      />
      
      <!-- Zone segments -->
      <path
        v-for="(zone, index) in zonePaths"
        :key="index"
        :d="zone.path"
        fill="none"
        :stroke="zone.color"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        class="zone-arc"
      />
      
      <!-- Value arc (full path, animated with dasharray) -->
      <path
        v-if="hasData"
        :d="fullGaugePath"
        fill="none"
        :stroke="valueColor"
        :stroke-width="strokeWidth + 2"
        :stroke-dasharray="valueArcLength"
        :stroke-dashoffset="valueDashOffset"
        stroke-linecap="round"
        class="value-arc"
      />
      
      <!-- Center value text -->
      <text
        :x="center"
        :y="center - 5"
        text-anchor="middle"
        dominant-baseline="middle"
        class="gauge-value"
        :fill="valueColor"
      >
        {{ displayValue }}
      </text>
      
      <!-- Unit text -->
      <text
        v-if="cfg.unit"
        :x="center"
        :y="center + 18"
        text-anchor="middle"
        dominant-baseline="middle"
        class="gauge-unit"
        fill="var(--muted)"
      >
        {{ cfg.unit }}
      </text>
    </svg>
    
    <!-- Min/Max labels -->
    <div class="gauge-labels">
      <span class="label-min">{{ cfg.min }}</span>
      <span class="label-max">{{ cfg.max }}</span>
    </div>
    
    <!-- No data state -->
    <div v-if="!hasData" class="no-data-overlay">
      <div class="no-data-icon">📊</div>
      <div class="no-data-text">Waiting for data...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWidgetDataStore } from '@/stores/widgetData'
import { useDesignTokens } from '@/composables/useDesignTokens'
import type { WidgetConfig } from '@/types/dashboard'

/**
 * Gauge Widget (Simplified with SVG Paths)
 * 
 * Grug say: Use simple SVG path arcs. No dasharray tricks.
 * Draw what we see. Much easier to understand.
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const dataStore = useWidgetDataStore()
const { chartColors } = useDesignTokens()

// SVG dimensions
const size = 200
const center = size / 2
const strokeWidth = 20
const radius = (size / 2) - (strokeWidth / 2) - 5

// Configuration
const cfg = computed(() => props.config.gaugeConfig!)

// Get buffer data
const buffer = computed(() => dataStore.getBuffer(props.config.id))
const hasData = computed(() => buffer.value.length > 0)

// Latest value
const latestValue = computed(() => {
  if (buffer.value.length === 0) return null
  const val = buffer.value[buffer.value.length - 1].value
  return typeof val === 'number' ? val : Number(val)
})

// Clamp value to min/max range
const clampedValue = computed(() => {
  if (latestValue.value === null) return cfg.value.min
  return Math.max(cfg.value.min, Math.min(cfg.value.max, latestValue.value))
})

// Display value
const displayValue = computed(() => {
  if (latestValue.value === null) return '—'
  return latestValue.value.toFixed(getDecimalPlaces(latestValue.value))
})

function getDecimalPlaces(value: number): number {
  if (Math.abs(value) >= 100) return 0
  if (Math.abs(value) >= 10) return 1
  return 2
}

// Calculate percentage (0-1)
const valuePercent = computed(() => {
  const range = cfg.value.max - cfg.value.min
  return (clampedValue.value - cfg.value.min) / range
})

/**
 * Helper function to convert polar coordinates to cartesian
 * Grug say: Math to find point on circle at given angle
 */
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  }
}

/**
 * Helper function to create an SVG arc path
 * Grug say: Make arc from start angle to end angle
 */
function describeArc(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle)
  const end = polarToCartesian(centerX, centerY, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1"
  
  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ")
}

/**
 * Background path - full 270° arc from -135° to 135°
 */
const backgroundPath = computed(() => {
  return describeArc(center, center, radius, -135, 135)
})

/**
 * Full gauge path (always 270°) - we'll animate the dasharray instead of the path
 */
const fullGaugePath = computed(() => {
  return describeArc(center, center, radius, -135, 135)
})

/**
 * Calculate the length of the full gauge arc (270°)
 */
const fullArcLength = computed(() => {
  // Arc length = radius × angle in radians
  const angleInRadians = (270 * Math.PI) / 180
  return radius * angleInRadians
})

/**
 * Value arc length for dasharray animation
 * This controls how much of the full path is visible
 */
const valueArcLength = computed(() => {
  const visibleLength = fullArcLength.value * valuePercent.value
  const invisibleLength = fullArcLength.value * 10 // Make sure rest is hidden
  return `${visibleLength} ${invisibleLength}`
})

/**
 * Dash offset to make the arc fill from left to right
 * Without this, it fills from right to left (the end of the path)
 */
const valueDashOffset = computed(() => {
  // Negative offset shifts the visible portion to start at the beginning
  return -fullArcLength.value * (1 - valuePercent.value)
})

/**
 * Value path - arc showing current value (kept for reference, not used)
 */
const valuePath = computed(() => {
  const startAngle = -135
  const endAngle = startAngle + (270 * valuePercent.value)
  return describeArc(center, center, radius, startAngle, endAngle)
})

/**
 * Background color
 */
const backgroundColor = computed(() => 'rgba(255, 255, 255, 0.1)')

/**
 * Determine value color based on zones
 */
const valueColor = computed(() => {
  if (!cfg.value.zones || cfg.value.zones.length === 0) {
    return chartColors.value.color1
  }
  
  const value = clampedValue.value
  
  // Find matching zone
  for (const zone of cfg.value.zones) {
    if (value >= zone.min && value <= zone.max) {
      return zone.color
    }
  }
  
  // Default color if no zone matches
  return chartColors.value.color1
})

/**
 * Zone paths - each zone as a separate arc
 */
const zonePaths = computed(() => {
  if (!cfg.value.zones) return []
  
  const range = cfg.value.max - cfg.value.min
  const gaugeStartAngle = -135
  const gaugeAngleRange = 270
  
  return cfg.value.zones.map(zone => {
    // Calculate zone start and end as percentages (0-1)
    const zoneStartPercent = (zone.min - cfg.value.min) / range
    const zoneEndPercent = (zone.max - cfg.value.min) / range
    
    // Convert to angles within the gauge range
    const startAngle = gaugeStartAngle + (gaugeAngleRange * zoneStartPercent)
    const endAngle = gaugeStartAngle + (gaugeAngleRange * zoneEndPercent)
    
    return {
      color: zone.color,
      path: describeArc(center, center, radius, startAngle, endAngle)
    }
  })
})
</script>

<style scoped>
.gauge-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--widget-bg);
  position: relative;
}

.gauge-svg {
  width: 100%;
  max-width: 200px;
  height: auto;
}

.background-arc {
  transition: stroke 0.3s;
}

.zone-arc {
  opacity: 0.3;
  transition: opacity 0.3s;
}

.value-arc {
  transition: stroke-dasharray 0.5s ease-out, stroke-dashoffset 0.5s ease-out, stroke 0.3s ease;
  filter: drop-shadow(0 0 4px currentColor);
}

.gauge-value {
  font-size: 36px;
  font-weight: 700;
  font-family: var(--mono);
  transition: fill 0.3s ease;
}

.gauge-unit {
  font-size: 14px;
  font-weight: 500;
}

.gauge-labels {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 180px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
  font-family: var(--mono);
}

.no-data-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--widget-bg);
  color: var(--muted);
}

.no-data-icon {
  font-size: 32px;
  opacity: 0.5;
}

.no-data-text {
  font-size: 13px;
}

/* Responsive sizing */
@media (max-width: 600px) {
  .gauge-svg {
    max-width: 160px;
  }
  
  .gauge-value {
    font-size: 28px;
  }
  
  .gauge-unit {
    font-size: 12px;
  }
}
</style>
