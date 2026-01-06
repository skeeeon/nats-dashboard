// src/composables/useDesignTokens.ts
import { computed, watch } from 'vue'
import { useTheme } from './useTheme'

/**
 * Design Tokens Composable
 * 
 * Provides reactive access to CSS design tokens.
 * Colors automatically update when theme changes.
 */

/**
 * Get CSS custom property value from document root
 */
function getToken(tokenName: string): string {
  const name = tokenName.startsWith('--') ? tokenName : `--${tokenName}`
  
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}

/**
 * Main composable
 */
export function useDesignTokens() {
  const { theme } = useTheme()
  
  // ============================================================================
  // REACTIVE COLOR GETTERS
  // ============================================================================
  
  /**
   * Helper to ensure reactivity
   * We must access theme.value to force Vue to re-evaluate these computed properties
   * when the theme changes.
   */
  const dependOnTheme = () => {
    return theme.value ? true : false
  }
  
  /**
   * Chart colors - for data visualization
   */
  const chartColors = computed(() => {
    dependOnTheme() // Force reactivity
    return {
      color1: getToken('--chart-color-1'),
      color2: getToken('--chart-color-2'),
      color3: getToken('--chart-color-3'),
      color4: getToken('--chart-color-4'),
      color5: getToken('--chart-color-5'),
      color6: getToken('--chart-color-6'),
      color7: getToken('--chart-color-7'),
      color8: getToken('--chart-color-8'),
      
      color1Alpha30: getToken('--chart-color-1-alpha-30'),
      color1Alpha05: getToken('--chart-color-1-alpha-05'),
      color2Alpha30: getToken('--chart-color-2-alpha-30'),
      color2Alpha05: getToken('--chart-color-2-alpha-05'),
      color3Alpha30: getToken('--chart-color-3-alpha-30'),
      color3Alpha05: getToken('--chart-color-3-alpha-05'),
    }
  })
  
  /**
   * Get chart color by index (1-8)
   */
  function getChartColor(index: number): string {
    const clampedIndex = Math.max(1, Math.min(8, index))
    // Note: This function isn't computed, so it pulls fresh from DOM when called.
    // If used inside a computed property elsewhere, ensure that computed property depends on theme.
    return getToken(`--chart-color-${clampedIndex}`)
  }
  
  /**
   * Get array of chart colors
   */
  function getChartColorArray(count: number): string[] {
    const colors: string[] = []
    const maxCount = Math.min(count, 8)
    for (let i = 1; i <= maxCount; i++) {
      colors.push(getChartColor(i))
    }
    return colors
  }
  
  /**
   * Semantic colors - for UI states
   */
  const semanticColors = computed(() => {
    dependOnTheme()
    return {
      primary: getToken('--color-primary'),
      primaryHover: getToken('--color-primary-hover'),
      primaryActive: getToken('--color-primary-active'),
      
      secondary: getToken('--color-secondary'),
      secondaryHover: getToken('--color-secondary-hover'),
      secondaryActive: getToken('--color-secondary-active'),
      
      accent: getToken('--color-accent'),
      accentHover: getToken('--color-accent-hover'),
      
      success: getToken('--color-success'),
      successBg: getToken('--color-success-bg'),
      successBorder: getToken('--color-success-border'),
      
      warning: getToken('--color-warning'),
      warningBg: getToken('--color-warning-bg'),
      warningBorder: getToken('--color-warning-border'),
      
      error: getToken('--color-error'),
      errorBg: getToken('--color-error-bg'),
      errorBorder: getToken('--color-error-border'),
      
      info: getToken('--color-info'),
      infoBg: getToken('--color-info-bg'),
      infoBorder: getToken('--color-info-border'),
    }
  })
  
  /**
   * Threshold colors - for alert levels
   */
  const thresholdColors = computed(() => {
    dependOnTheme()
    return {
      normal: getToken('--threshold-normal'),
      normalBg: getToken('--threshold-normal-bg'),
      
      warning: getToken('--threshold-warning'),
      warningBg: getToken('--threshold-warning-bg'),
      
      critical: getToken('--threshold-critical'),
      criticalBg: getToken('--threshold-critical-bg'),
      
      severe: getToken('--threshold-severe'),
      severeBg: getToken('--threshold-severe-bg'),
    }
  })
  
  /**
   * Get threshold color based on value
   */
  function getThresholdColor(
    value: number,
    thresholds: { warning?: number; critical?: number; severe?: number }
  ): string {
    const { warning, critical, severe } = thresholds
    
    // Note: access .value here to ensure we get the current reactive colors
    if (severe !== undefined && value >= severe) return thresholdColors.value.severe
    if (critical !== undefined && value >= critical) return thresholdColors.value.critical
    if (warning !== undefined && value >= warning) return thresholdColors.value.warning
    
    return thresholdColors.value.normal
  }
  
  /**
   * Status colors
   */
  const statusColors = computed(() => {
    dependOnTheme()
    return {
      active: getToken('--status-active'),
      inactive: getToken('--status-inactive'),
      pending: getToken('--status-pending'),
      error: getToken('--status-error'),
      unknown: getToken('--status-unknown'),
    }
  })
  
  /**
   * Connection status colors
   */
  const connectionColors = computed(() => {
    dependOnTheme()
    return {
      connected: getToken('--connection-connected'),
      connecting: getToken('--connection-connecting'),
      reconnecting: getToken('--connection-reconnecting'),
      disconnected: getToken('--connection-disconnected'),
    }
  })
  
  function getConnectionColor(status: string): string {
    switch (status.toLowerCase()) {
      case 'connected': return connectionColors.value.connected
      case 'connecting': return connectionColors.value.connecting
      case 'reconnecting': return connectionColors.value.reconnecting
      case 'disconnected':
      default: return connectionColors.value.disconnected
    }
  }
  
  /**
   * Chart styling colors
   */
  const chartStyling = computed(() => {
    dependOnTheme()
    return {
      grid: getToken('--chart-grid'),
      axis: getToken('--chart-axis'),
      tooltipBg: getToken('--chart-tooltip-bg'),
      tooltipBorder: getToken('--chart-tooltip-border'),
      text: getToken('--text'),
      textSecondary: getToken('--text-secondary'),
      muted: getToken('--muted'),
      border: getToken('--border'),
    }
  })
  
  /**
   * Base colors
   */
  const baseColors = computed(() => {
    dependOnTheme()
    return {
      bg: getToken('--bg'),
      panel: getToken('--panel'),
      border: getToken('--border'),
      inputBg: getToken('--input-bg'),
      text: getToken('--text'),
      textSecondary: getToken('--text-secondary'),
      muted: getToken('--muted'),
    }
  })
  
  // ============================================================================
  // HELPERS
  // ============================================================================
  
  function hexToRgba(hex: string, alpha: number): string {
    hex = hex.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  
  function getColorWithAlpha(color: string, alpha: number): string {
    if (color.startsWith('rgba')) {
      return color.replace(/[\d.]+\)$/, `${alpha})`)
    }
    if (color.startsWith('rgb')) {
      return color.replace('rgb', 'rgba').replace(')', `, ${alpha})`)
    }
    return hexToRgba(color, alpha)
  }
  
  return {
    getToken,
    chartColors,
    semanticColors,
    thresholdColors,
    statusColors,
    connectionColors,
    chartStyling,
    baseColors,
    getChartColor,
    getChartColorArray,
    getThresholdColor,
    getConnectionColor,
    hexToRgba,
    getColorWithAlpha,
  }
}

export type ChartColors = ReturnType<typeof useDesignTokens>['chartColors']['value']
export type SemanticColors = ReturnType<typeof useDesignTokens>['semanticColors']['value']
export type ThresholdColors = ReturnType<typeof useDesignTokens>['thresholdColors']['value']
export type StatusColors = ReturnType<typeof useDesignTokens>['statusColors']['value']
