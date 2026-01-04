<template>
  <div class="stat-card-widget">
    <!-- Main value -->
    <div class="stat-value" :style="{ color: valueColor }">
      {{ displayValue }}
    </div>
    
    <!-- Trend indicator -->
    <div v-if="showTrend && trend !== null" class="stat-trend" :class="trendClass">
      <span class="trend-arrow">{{ trendArrow }}</span>
      <span class="trend-text">{{ trendText }}</span>
    </div>
    
    <!-- Mini sparkline (optional) -->
    <div v-if="showSparkline" class="sparkline">
      <svg :viewBox="`0 0 ${sparklineWidth} ${sparklineHeight}`" class="sparkline-svg">
        <polyline
          :points="sparklinePoints"
          fill="none"
          :stroke="valueColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    
    <!-- No data state -->
    <div v-if="!hasData" class="no-data">
      <div class="no-data-icon">📊</div>
      <div class="no-data-text">Waiting for data...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWidgetDataStore } from '@/stores/widgetData'
import { useDesignTokens } from '@/composables/useDesignTokens'
import { useThresholds } from '@/composables/useThresholds'
import type { WidgetConfig } from '@/types/dashboard'

/**
 * Stat Card Widget
 * 
 * Grug say: Big number with trend arrow. Good for KPIs.
 * Show if going up or down compared to before.
 */

const props = defineProps<{
  config: WidgetConfig
}>()

const dataStore = useWidgetDataStore()
const { baseColors } = useDesignTokens()
const { evaluateThresholds } = useThresholds()

// Get configuration
const cfg = computed(() => props.config.statConfig!)
const showTrend = computed(() => cfg.value.showTrend ?? true)
const trendWindow = computed(() => cfg.value.trendWindow ?? 10)
const thresholds = computed(() => cfg.value.thresholds || [])

// Get buffer data
const buffer = computed(() => dataStore.getBuffer(props.config.id))
const hasData = computed(() => buffer.value.length > 0)

// Latest value
const latestValue = computed(() => {
  if (buffer.value.length === 0) return null
  return buffer.value[buffer.value.length - 1].value
})

// Previous value for trend calculation
const previousValue = computed(() => {
  const index = buffer.value.length - 1 - trendWindow.value
  if (index < 0 || buffer.value.length < 2) return null
  return buffer.value[index].value
})

// Calculate trend
const trend = computed(() => {
  if (latestValue.value === null || previousValue.value === null) return null
  
  const current = Number(latestValue.value)
  const previous = Number(previousValue.value)
  
  if (isNaN(current) || isNaN(previous) || previous === 0) return null
  
  const change = current - previous
  const percent = (change / Math.abs(previous)) * 100
  
  return {
    change,
    percent,
    isPositive: change > 0,
    isNegative: change < 0,
    isNeutral: change === 0
  }
})

// Trend display
const trendArrow = computed(() => {
  if (!trend.value) return ''
  if (trend.value.isPositive) return '↑'
  if (trend.value.isNegative) return '↓'
  return '→'
})

const trendText = computed(() => {
  if (!trend.value) return ''
  const percent = Math.abs(trend.value.percent).toFixed(1)
  return `${percent}%`
})

const trendClass = computed(() => {
  if (!trend.value) return ''
  if (trend.value.isPositive) return 'trend-positive'
  if (trend.value.isNegative) return 'trend-negative'
  return 'trend-neutral'
})

// Format display value
const displayValue = computed(() => {
  if (latestValue.value === null) return '—'
  
  const value = latestValue.value
  const format = cfg.value.format
  const unit = cfg.value.unit || ''
  
  if (format) {
    return format.replace('{value}', String(value))
  }
  
  // Format number with appropriate precision
  if (typeof value === 'number') {
    const formatted = value.toFixed(getDecimalPlaces(value))
    return `${formatted}${unit}`
  }
  
  return `${value}${unit}`
})

// Determine decimal places based on value magnitude
function getDecimalPlaces(value: number): number {
  if (Math.abs(value) >= 100) return 0
  if (Math.abs(value) >= 10) return 1
  return 2
}

// Determine color based on thresholds
const valueColor = computed(() => {
  if (latestValue.value === null) return baseColors.value.muted
  
  const color = evaluateThresholds(latestValue.value, thresholds.value)
  return color || baseColors.value.text
})

// Sparkline (simple line chart of recent values)
const showSparkline = computed(() => buffer.value.length > 5)
const sparklineWidth = 100
const sparklineHeight = 20

const sparklinePoints = computed(() => {
  if (!showSparkline.value) return ''
  
  // Get last 20 values
  const values = buffer.value.slice(-20).map(m => Number(m.value)).filter(v => !isNaN(v))
  if (values.length < 2) return ''
  
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * sparklineWidth
      const y = sparklineHeight - ((value - min) / range) * sparklineHeight
      return `${x},${y}`
    })
    .join(' ')
})
</script>

<style scoped>
.stat-card-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--widget-bg);
  gap: 8px;
}

.stat-value {
  font-size: 56px;
  font-weight: 700;
  font-family: var(--mono);
  line-height: 1;
  text-align: center;
  transition: color 0.3s ease;
}

.stat-trend {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
  font-weight: 600;
}

.trend-positive {
  color: var(--color-success);
}

.trend-negative {
  color: var(--color-error);
}

.trend-neutral {
  color: var(--muted);
}

.trend-arrow {
  font-size: 24px;
  line-height: 1;
}

.sparkline {
  width: 100%;
  max-width: 200px;
  height: 30px;
  opacity: 0.6;
}

.sparkline-svg {
  width: 100%;
  height: 100%;
}

.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
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
  .stat-value {
    font-size: 42px;
  }
  
  .stat-trend {
    font-size: 16px;
  }
  
  .trend-arrow {
    font-size: 20px;
  }
}
</style>
