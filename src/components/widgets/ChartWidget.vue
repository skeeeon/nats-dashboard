<template>
  <div class="chart-widget">
    <v-chart 
      v-if="hasData"
      :option="chartOption" 
      :autoresize="true"
      class="chart"
    />
    <div v-else class="no-data">
      <div class="no-data-icon">📈</div>
      <div class="no-data-text">Waiting for data...</div>
      <div class="no-data-hint">
        Subscribed to: <code>{{ config.dataSource.subject }}</code>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { use } from 'echarts/core'
import { LineChart, BarChart, PieChart, GaugeChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { useWidgetDataStore } from '@/stores/widgetData'
import { useDesignTokens } from '@/composables/useDesignTokens'
import { useTheme } from '@/composables/useTheme'
import type { WidgetConfig } from '@/types/dashboard'

/**
 * Chart Widget
 * 
 * Grug say: Show data as pretty pictures. Lines go up, lines go down.
 * Use ECharts because it good at making charts.
 * 
 * NEW: Now uses design tokens for theme-aware colors!
 * Charts automatically update when theme changes.
 */

// Register ECharts components
use([
  LineChart,
  BarChart,
  PieChart,
  GaugeChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer,
])

const props = defineProps<{
  config: WidgetConfig
}>()

const dataStore = useWidgetDataStore()
const { chartColors, chartStyling, getChartColorArray } = useDesignTokens()
const { theme } = useTheme()

// Get buffered data
const buffer = computed(() => dataStore.getBuffer(props.config.id))

// Check if we have any data
const hasData = computed(() => buffer.value.length > 0)

// Get chart type (default to line)
const chartType = computed(() => props.config.chartConfig?.chartType || 'line')

/**
 * Generate chart option based on chart type
 * All colors now come from design tokens!
 */
const chartOption = computed(() => {
  const data = buffer.value

  switch (chartType.value) {
    case 'line':
      return generateLineChart(data)
    case 'bar':
      return generateBarChart(data)
    case 'gauge':
      return generateGaugeChart(data)
    case 'pie':
      return generatePieChart(data)
    default:
      return generateLineChart(data)
  }
})

/**
 * Line Chart - Show values over time
 * Grug say: Most useful for NATS messages. See trends.
 * 
 * NEW: Uses design tokens for all colors!
 */
function generateLineChart(data: any[]) {
  const colors = chartColors.value
  const styling = chartStyling.value
  
  return {
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: styling.tooltipBg,
      borderColor: styling.tooltipBorder,
      textStyle: { 
        color: styling.text,
        fontSize: 12,
      },
    },
    xAxis: {
      type: 'category',
      data: data.map((m) => new Date(m.timestamp).toLocaleTimeString()),
      axisLine: { 
        lineStyle: { color: styling.axis }
      },
      axisLabel: { 
        color: styling.muted,
        fontSize: 11,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { 
        lineStyle: { color: styling.axis }
      },
      axisLabel: { 
        color: styling.muted,
        fontSize: 11,
      },
      splitLine: { 
        lineStyle: { color: styling.grid }
      },
    },
    series: [
      {
        data: data.map((m) => m.value),
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: colors.color1,
          width: 2,
        },
        itemStyle: {
          color: colors.color1,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: colors.color1Alpha30 },
              { offset: 1, color: colors.color1Alpha05 },
            ],
          },
        },
      },
    ],
    // Apply custom options if provided (but don't override colors)
    ...props.config.chartConfig?.echartOptions,
  }
}

/**
 * Bar Chart - Show values as bars
 * NEW: Uses design tokens!
 */
function generateBarChart(data: any[]) {
  const colors = chartColors.value
  const styling = chartStyling.value
  
  return {
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: styling.tooltipBg,
      borderColor: styling.tooltipBorder,
      textStyle: { 
        color: styling.text,
        fontSize: 12,
      },
    },
    xAxis: {
      type: 'category',
      data: data.map((m) => new Date(m.timestamp).toLocaleTimeString()),
      axisLine: { 
        lineStyle: { color: styling.axis }
      },
      axisLabel: { 
        color: styling.muted,
        fontSize: 11,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { 
        lineStyle: { color: styling.axis }
      },
      axisLabel: { 
        color: styling.muted,
        fontSize: 11,
      },
      splitLine: { 
        lineStyle: { color: styling.grid }
      },
    },
    series: [
      {
        data: data.map((m) => m.value),
        type: 'bar',
        itemStyle: {
          color: colors.color2, // Use green for bars
        },
      },
    ],
    ...props.config.chartConfig?.echartOptions,
  }
}

/**
 * Gauge Chart - Show single value as gauge
 * Grug say: Good for showing current value like temperature, speed, etc.
 * 
 * NEW: Uses threshold colors for color ranges!
 */
function generateGaugeChart(data: any[]) {
  const colors = chartColors.value
  const styling = chartStyling.value
  
  // Use latest value for gauge
  const latestValue = data.length > 0 ? data[data.length - 1].value : 0

  return {
    series: [
      {
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        splitNumber: 5,
        itemStyle: {
          color: colors.color1,
        },
        progress: {
          show: true,
          width: 18,
        },
        pointer: {
          show: false,
        },
        axisLine: {
          lineStyle: {
            width: 18,
            // Use semantic colors for ranges
            color: [
              [0.3, colors.color2],  // Green for low (good)
              [0.7, colors.color3],  // Orange for medium (warning)
              [1, colors.color5],    // Red for high (critical)
            ],
          },
        },
        axisTick: {
          distance: -22,
          splitNumber: 5,
          lineStyle: {
            width: 1,
            color: styling.muted,
          },
        },
        splitLine: {
          distance: -28,
          length: 14,
          lineStyle: {
            width: 2,
            color: styling.muted,
          },
        },
        axisLabel: {
          distance: -20,
          color: styling.muted,
          fontSize: 12,
        },
        anchor: {
          show: false,
        },
        title: {
          show: false,
        },
        detail: {
          valueAnimation: true,
          width: '60%',
          lineHeight: 40,
          borderRadius: 8,
          offsetCenter: [0, '10%'],
          fontSize: 32,
          fontWeight: 'bolder',
          formatter: '{value}',
          color: styling.text,
        },
        data: [
          {
            value: latestValue,
          },
        ],
      },
    ],
    ...props.config.chartConfig?.echartOptions,
  }
}

/**
 * Pie Chart - Show distribution
 * Grug say: Good if your data has categories
 * 
 * NEW: Uses chart color palette!
 */
function generatePieChart(data: any[]) {
  const styling = chartStyling.value
  
  // For pie chart, we need to aggregate data
  // If value is object with categories, use those
  // Otherwise, count occurrences of each value
  
  const pieData: Record<string, number> = {}
  
  data.forEach((m) => {
    const val = String(m.value)
    pieData[val] = (pieData[val] || 0) + 1
  })
  
  // Get colors for pie slices
  const colorArray = getChartColorArray(Object.keys(pieData).length)

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: styling.tooltipBg,
      borderColor: styling.tooltipBorder,
      textStyle: { 
        color: styling.text,
        fontSize: 12,
      },
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      textStyle: { 
        color: styling.muted,
      },
    },
    color: colorArray, // Use our color palette
    series: [
      {
        type: 'pie',
        radius: '60%',
        data: Object.entries(pieData).map(([name, value]) => ({
          name,
          value,
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
    ...props.config.chartConfig?.echartOptions,
  }
}

// Watch for theme changes and force chart update
// ECharts needs explicit notification when colors change
watch(theme, () => {
  // chartOption is already reactive and will update,
  // but we log it for debugging
  if (import.meta.env.DEV) {
    console.log('[ChartWidget] Theme changed, chart colors will update')
  }
})
</script>

<style scoped>
.chart-widget {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;
  background: var(--widget-bg);
  border-radius: 8px;
}

.chart {
  flex: 1;
  min-height: 0;
}

/* No data state */
.no-data {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  padding: 20px;
}

.no-data-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.no-data-text {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text);
}

.no-data-hint {
  font-size: 12px;
  text-align: center;
  line-height: 1.4;
}

.no-data-hint code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--mono);
  color: var(--color-accent);
}
</style>
