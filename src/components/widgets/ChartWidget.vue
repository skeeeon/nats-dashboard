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
import { computed } from 'vue'
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
import type { WidgetConfig } from '@/types/dashboard'

/**
 * Chart Widget
 * 
 * Grug say: Show data as pretty pictures. Lines go up, lines go down.
 * Use ECharts because it good at making charts.
 * Start with line chart. Add others later if needed.
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

// Get buffered data
const buffer = computed(() => dataStore.getBuffer(props.config.id))

// Check if we have any data
const hasData = computed(() => buffer.value.length > 0)

// Get chart type (default to line)
const chartType = computed(() => props.config.chartConfig?.chartType || 'line')

/**
 * Generate chart option based on chart type
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
 */
function generateLineChart(data: any[]) {
  return {
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#333',
      textStyle: { color: '#e0e0e0' },
    },
    xAxis: {
      type: 'category',
      data: data.map((m) => new Date(m.timestamp).toLocaleTimeString()),
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { color: '#888', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { color: '#888', fontSize: 11 },
      splitLine: { lineStyle: { color: '#222' } },
    },
    series: [
      {
        data: data.map((m) => m.value),
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: '#58a6ff',
          width: 2,
        },
        itemStyle: {
          color: '#58a6ff',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(88, 166, 255, 0.3)' },
              { offset: 1, color: 'rgba(88, 166, 255, 0.05)' },
            ],
          },
        },
      },
    ],
    // Apply custom options if provided
    ...props.config.chartConfig?.echartOptions,
  }
}

/**
 * Bar Chart - Show values as bars
 */
function generateBarChart(data: any[]) {
  return {
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#333',
      textStyle: { color: '#e0e0e0' },
    },
    xAxis: {
      type: 'category',
      data: data.map((m) => new Date(m.timestamp).toLocaleTimeString()),
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { color: '#888', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { color: '#888', fontSize: 11 },
      splitLine: { lineStyle: { color: '#222' } },
    },
    series: [
      {
        data: data.map((m) => m.value),
        type: 'bar',
        itemStyle: {
          color: '#3fb950',
        },
      },
    ],
    ...props.config.chartConfig?.echartOptions,
  }
}

/**
 * Gauge Chart - Show single value as gauge
 * Grug say: Good for showing current value like temperature, speed, etc.
 */
function generateGaugeChart(data: any[]) {
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
          color: '#58a6ff',
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
            color: [
              [0.3, '#3fb950'],
              [0.7, '#d29922'],
              [1, '#f85149'],
            ],
          },
        },
        axisTick: {
          distance: -22,
          splitNumber: 5,
          lineStyle: {
            width: 1,
            color: '#999',
          },
        },
        splitLine: {
          distance: -28,
          length: 14,
          lineStyle: {
            width: 2,
            color: '#999',
          },
        },
        axisLabel: {
          distance: -20,
          color: '#999',
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
          color: 'inherit',
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
 */
function generatePieChart(data: any[]) {
  // For pie chart, we need to aggregate data
  // If value is object with categories, use those
  // Otherwise, count occurrences of each value
  
  const pieData: Record<string, number> = {}
  
  data.forEach((m) => {
    const val = String(m.value)
    pieData[val] = (pieData[val] || 0) + 1
  })

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#333',
      textStyle: { color: '#e0e0e0' },
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      textStyle: { color: '#888' },
    },
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
</script>

<style scoped>
.chart-widget {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
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
  color: var(--muted, #888);
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
  color: var(--text, #e0e0e0);
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
  font-family: var(--mono, monospace);
  color: var(--accent, #58a6ff);
}
</style>
