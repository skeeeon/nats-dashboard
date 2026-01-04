import { ref, watch } from 'vue'

/**
 * Theme Type
 * Grug say: Two themes. Dark or light. Simple.
 */
export type Theme = 'dark' | 'light'

/**
 * Theme Composable
 * 
 * Grug say: Switch between dark and light mode.
 * Save choice in localStorage. Set CSS variables on <html> element.
 * 
 * Uses singleton pattern - one theme for whole app.
 */

const STORAGE_KEY = 'nats_dashboard_theme'

// Singleton theme state
const theme = ref<Theme>('dark')

// Track if already initialized
let initialized = false

/**
 * Initialize theme from localStorage or system preference
 */
function initializeTheme() {
  if (initialized) return
  
  // Try to load from localStorage
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (stored === 'dark' || stored === 'light') {
    theme.value = stored
  } else {
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      theme.value = 'light'
    } else {
      theme.value = 'dark'
    }
  }
  
  // Apply theme
  applyTheme(theme.value)
  
  initialized = true
}

/**
 * Apply theme by setting data attribute on html element
 * Grug say: CSS variables keyed off data-theme attribute
 */
function applyTheme(newTheme: Theme) {
  document.documentElement.setAttribute('data-theme', newTheme)
  localStorage.setItem(STORAGE_KEY, newTheme)
}

/**
 * Toggle between dark and light theme
 */
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(theme.value)
}

/**
 * Set specific theme
 */
function setTheme(newTheme: Theme) {
  theme.value = newTheme
  applyTheme(newTheme)
}

/**
 * Watch for theme changes and apply
 */
watch(theme, (newTheme) => {
  applyTheme(newTheme)
})

/**
 * useTheme composable
 * Grug say: Export this. Components call this to get/set theme.
 */
export function useTheme() {
  // Initialize on first use
  if (!initialized) {
    initializeTheme()
  }
  
  return {
    theme,
    toggleTheme,
    setTheme,
  }
}
