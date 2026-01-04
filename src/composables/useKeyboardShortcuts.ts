import { onMounted, onUnmounted } from 'vue'

/**
 * Keyboard Shortcut Handler
 * Grug say: Function that runs when key pressed
 */
type ShortcutHandler = (event: KeyboardEvent) => void

/**
 * Shortcut Definition
 * Grug say: What keys to press and what happens
 */
interface ShortcutDefinition {
  key: string           // The key (e.g., 's', 'n', 'Delete')
  ctrl?: boolean        // Requires Ctrl/Cmd key
  shift?: boolean       // Requires Shift key
  alt?: boolean         // Requires Alt key
  handler: ShortcutHandler
  description: string   // For help menu
}

/**
 * Keyboard Shortcuts Composable
 * 
 * Grug say: Listen for keyboard. Run functions when keys pressed.
 * Clean up when component destroyed. Simple.
 * 
 * Shortcuts:
 * - Cmd/Ctrl + S: Save dashboard
 * - Cmd/Ctrl + N: New widget
 * - Delete/Backspace: Delete selected widget
 * - Escape: Close modal / Exit full screen
 * - Cmd/Ctrl + D: Duplicate widget
 * - F: Toggle full screen on selected widget
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDefinition[]) {
  
  /**
   * Check if event matches shortcut definition
   * Grug say: Compare pressed keys with what we want
   */
  function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutDefinition): boolean {
    // Check key match (case insensitive)
    const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase()
    
    // Check modifiers
    const ctrlMatches = !!shortcut.ctrl === (event.ctrlKey || event.metaKey) // Meta is Cmd on Mac
    const shiftMatches = !!shortcut.shift === event.shiftKey
    const altMatches = !!shortcut.alt === event.altKey
    
    return keyMatches && ctrlMatches && shiftMatches && altMatches
  }
  
  /**
   * Handle keyboard event
   * Grug say: Check all shortcuts. Run handler if match.
   */
  function handleKeyDown(event: KeyboardEvent) {
    // Don't trigger shortcuts when typing in input/textarea
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable) {
      return
    }
    
    // Check each shortcut
    for (const shortcut of shortcuts) {
      if (matchesShortcut(event, shortcut)) {
        // Prevent default browser behavior
        event.preventDefault()
        
        // Run handler
        shortcut.handler(event)
        
        // Stop after first match
        break
      }
    }
  }
  
  /**
   * Register keyboard listener
   */
  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
    console.log(`[Shortcuts] Registered ${shortcuts.length} keyboard shortcuts`)
  })
  
  /**
   * Cleanup listener
   */
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    console.log('[Shortcuts] Unregistered keyboard shortcuts')
  })
  
  /**
   * Get list of shortcuts for help menu
   */
  function getShortcutsList(): string[] {
    return shortcuts.map(s => {
      const keys: string[] = []
      if (s.ctrl) keys.push('Ctrl/Cmd')
      if (s.shift) keys.push('Shift')
      if (s.alt) keys.push('Alt')
      keys.push(s.key.toUpperCase())
      
      return `${keys.join(' + ')}: ${s.description}`
    })
  }
  
  return {
    getShortcutsList,
  }
}

/**
 * Format shortcut for display
 * Grug say: Make nice string like "Cmd+S" for UI
 */
export function formatShortcut(shortcut: ShortcutDefinition): string {
  const keys: string[] = []
  
  // Use Mac symbols if on Mac
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  
  if (shortcut.ctrl) {
    keys.push(isMac ? '⌘' : 'Ctrl')
  }
  if (shortcut.shift) {
    keys.push(isMac ? '⇧' : 'Shift')
  }
  if (shortcut.alt) {
    keys.push(isMac ? '⌥' : 'Alt')
  }
  
  keys.push(shortcut.key.toUpperCase())
  
  return keys.join(isMac ? '' : '+')
}
