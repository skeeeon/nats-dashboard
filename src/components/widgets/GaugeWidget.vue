<template>
  <div class="gauge-widget">
    <!-- SVG Gauge -->
    <svg :viewBox="`0 0 ${size} ${size}`" class="gauge-svg">
      <!-- Background circle -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="backgroundColor"
        :stroke-width="strokeWidth"
      />
      
      <!-- Zone segments -->
      <circle
        v-for="(zone, index) in zoneArcs"
        :key="index"
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="zone.color"
        :stroke-width="strokeWidth"
        :stroke-dasharray="zone.dasharray"
        :stroke-dashoffset="zone.dashoffset"
        stroke-linecap="round"
        class="zone-arc"
      />
      
      <!-- Value arc -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="valueColor"
        :stroke-width="strokeWidth + 2"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="valueDashoffset"
        stroke-linecap="round"
        class="value-arc"
      />
      
      <!-- Center value text -->
      <text
        :x="center"
        :y="center"
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
 * Gauge Widget
 * 
 * Grug say: Round meter show value in range.
 * Color zones show good/warning/bad areas.
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const dataStore = useWidgetDataStore()
const { baseColors, chartColors } = useDesignTokens()

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

// SVG arc calculations
const circumference = 2 * Math.PI * radius
const startAngle = -135 // Start at bottom-left
const endAngle = 135   // End at bottom-right
const totalAngle = endAngle - startAngle // 270 degrees

// Value arc offset (animate from empty to filled)
const valueDashoffset = computed(() => {
  const arcLength = (totalAngle / 360) * circumference
  return circumference - (arcLength * valuePercent.value)
})

// Background color
const backgroundColor = computed(() => {
  return 'rgba(255, 255, 255, 0.1)'
})

// Determine value color based on zones
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

// Zone arcs (background colored segments)
const zoneArcs = computed(() => {
  if (!cfg.value.zones) return []
  
  const range = cfg.value.max - cfg.value.min
  const arcLength = (totalAngle / 360) * circumference
  
  return cfg.value.zones.map(zone => {
    const zoneStart = (zone.min - cfg.value.min) / range
    const zoneEnd = (zone.max - cfg.value.min) / range
    const zoneLength = (zoneEnd - zoneStart) * arcLength
    
    return {
      color: zone.color,
      dasharray: `${zoneLength} ${circumference}`,
      dashoffset: circumference - (zoneStart * arcLength)
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
  transform: rotate(135deg); /* Start from bottom-left */
}

.zone-arc {
  opacity: 0.3;
  transition: opacity 0.3s;
}

.value-arc {
  transition: stroke-dashoffset 0.5s ease-out, stroke 0.3s ease;
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
  margin-top: -20px;
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
