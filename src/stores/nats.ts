import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { 
  wsconnect, 
  credsAuthenticator, 
  type NatsConnection,
  type Status
} from '@nats-io/nats-core'

/**
 * NATS Connection Store
 * 
 * Manages connection to NATS server with WebSocket support.
 * Handles authentication, reconnection events, and graceful shutdown.
 * 
 * Key behaviors:
 * - Emits 'nats:reconnected' event when connection is restored
 * - Uses drain() for graceful disconnect
 * - Tracks connection statistics
 */
export const useNatsStore = defineStore('nats', () => {
  // ============================================================================
  // STATE
  // ============================================================================
  
  const nc = ref<NatsConnection | null>(null)
  const status = ref<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected')
  const lastError = ref<string | null>(null)
  const serverUrls = ref<string[]>([])
  const autoConnect = ref(false)
  
  // Stats
  const rtt = ref<number | null>(null)
  const reconnectCount = ref(0)
  let statsInterval: number | null = null
  let statusMonitorAbort: AbortController | null = null

  // ============================================================================
  // COMPUTED
  // ============================================================================
  
  const isConnected = computed(() => status.value === 'connected')

  // ============================================================================
  // SETTINGS PERSISTENCE
  // ============================================================================
  
  const STORAGE_KEYS = {
    URLS: 'nats_dashboard_urls',
    AUTO_CONNECT: 'nats_dashboard_autoconnect',
    CREDS: 'nats_dashboard_creds',
  }

  function loadSettings() {
    const savedUrls = localStorage.getItem(STORAGE_KEYS.URLS)
    if (savedUrls) {
      try {
        serverUrls.value = JSON.parse(savedUrls)
      } catch {
        serverUrls.value = ['ws://localhost:9222']
      }
    } else {
      serverUrls.value = ['ws://localhost:9222']
    }

    const savedAuto = localStorage.getItem(STORAGE_KEYS.AUTO_CONNECT)
    autoConnect.value = savedAuto === 'true'
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.URLS, JSON.stringify(serverUrls.value))
    localStorage.setItem(STORAGE_KEYS.AUTO_CONNECT, String(autoConnect.value))
  }

  function saveCredsFile(content: string, remember: boolean) {
    localStorage.removeItem(STORAGE_KEYS.CREDS)
    sessionStorage.removeItem(STORAGE_KEYS.CREDS)

    if (remember) {
      localStorage.setItem(STORAGE_KEYS.CREDS, content)
    } else {
      sessionStorage.setItem(STORAGE_KEYS.CREDS, content)
    }
  }

  function getStoredCreds(): string | null {
    return sessionStorage.getItem(STORAGE_KEYS.CREDS) || localStorage.getItem(STORAGE_KEYS.CREDS)
  }

  function clearStoredCreds() {
    localStorage.removeItem(STORAGE_KEYS.CREDS)
    sessionStorage.removeItem(STORAGE_KEYS.CREDS)
  }

  function addUrl(url: string) {
    if (!url) return
    if (!serverUrls.value.includes(url)) {
      serverUrls.value.push(url)
      saveSettings()
    }
  }

  function removeUrl(url: string) {
    serverUrls.value = serverUrls.value.filter(u => u !== url)
    saveSettings()
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  /**
   * Connect to NATS server
   */
  async function connect(
    specificUrl?: string,
    authOptions?: {
      credsContent?: string
      token?: string
      user?: string
      pass?: string
    },
    rememberCreds: boolean = false
  ) {
    if (nc.value) await disconnect()

    const url = specificUrl || serverUrls.value[0]
    if (!url) {
      throw new Error('No NATS URL configured')
    }

    status.value = 'connecting'
    lastError.value = null
    reconnectCount.value = 0

    try {
      const opts: any = { 
        servers: [url],
        name: 'nats-dashboard',
        // Reconnection settings
        reconnect: true,
        maxReconnectAttempts: -1, // Infinite
        reconnectTimeWait: 2000,  // 2s between attempts
        reconnectJitter: 500,
      }

      // Setup authentication
      if (authOptions?.credsContent) {
        let rawText = authOptions.credsContent
        const jwtIndex = rawText.indexOf("-----BEGIN NATS USER JWT-----")
        if (jwtIndex > 0) {
          rawText = rawText.substring(jwtIndex)
        } else if (jwtIndex === -1) {
          throw new Error("Invalid .creds file: JWT section not found")
        }
        rawText = rawText.replace(/\r\n/g, "\n")
        
        const encoder = new TextEncoder()
        const credsBytes = encoder.encode(rawText)
        opts.authenticator = credsAuthenticator(credsBytes)
        
        saveCredsFile(authOptions.credsContent, rememberCreds)
      } else if (authOptions?.token) {
        opts.token = authOptions.token
      } else if (authOptions?.user) {
        opts.user = authOptions.user
        opts.pass = authOptions.pass || ''
      }

      console.log(`[NATS] Connecting to ${url}...`)
      
      nc.value = await wsconnect(opts)
      status.value = 'connected'
      console.log('[NATS] Connected successfully')

      monitorConnection()
      startStatsLoop()

      return nc.value

    } catch (err: any) {
      console.error('[NATS] Connection Error:', err)
      status.value = 'disconnected'
      lastError.value = err.message
      
      if (err.message.includes('ECONNREFUSED') || err.message.includes('Failed to fetch')) {
        throw new Error('Cannot reach NATS server. Check URL and ensure WebSocket is enabled.')
      } else if (err.message.includes('Authorization')) {
        throw new Error('Authentication failed. Check credentials.')
      } else {
        throw new Error(`Connection failed: ${err.message}`)
      }
    }
  }

  /**
   * Graceful disconnect using drain()
   * Drain ensures in-flight messages are processed before closing
   */
  async function disconnect() {
    // Stop monitoring
    if (statusMonitorAbort) {
      statusMonitorAbort.abort()
      statusMonitorAbort = null
    }
    
    if (statsInterval) {
      clearInterval(statsInterval)
      statsInterval = null
    }

    if (nc.value) {
      try {
        // Drain is the graceful way to close - it:
        // 1. Stops new messages from being delivered
        // 2. Processes all in-flight messages
        // 3. Closes the connection
        console.log('[NATS] Draining connection...')
        await nc.value.drain()
        console.log('[NATS] Connection drained and closed')
      } catch (err) {
        // If drain fails (e.g., already closed), force close
        console.warn('[NATS] Drain failed, forcing close:', err)
        try {
          await nc.value.close()
        } catch { /* ignore */ }
      }
      nc.value = null
    }
    
    status.value = 'disconnected'
    rtt.value = null
    reconnectCount.value = 0
  }

  /**
   * Monitor connection status and emit events on state changes
   * 
   * Key events:
   * - 'disconnect': Connection lost, will attempt reconnect
   * - 'reconnect': Connection restored
   * - 'error': Connection error occurred
   * - 'staleConnection': Server hasn't responded to pings
   */
  async function monitorConnection() {
    if (!nc.value) return
    
    // Create abort controller for cleanup
    statusMonitorAbort = new AbortController()
    const connection = nc.value
    
    try {
      for await (const s of connection.status()) {
        // Check if we should stop monitoring
        if (statusMonitorAbort?.signal.aborted) {
          console.log('[NATS] Status monitor aborted')
          break
        }
        
        handleStatusEvent(s)
      }
    } catch (err) {
      // Iterator closed, connection gone
      if (!statusMonitorAbort?.signal.aborted) {
        console.log('[NATS] Status monitor ended unexpectedly')
        status.value = 'disconnected'
      }
    }
  }

  /**
   * Handle individual status events
   */
  function handleStatusEvent(s: Status) {
    console.log(`[NATS] Status event: ${s.type}`, s.data || '')
    
    switch (s.type) {
      case 'disconnect':
        status.value = 'reconnecting'
        lastError.value = 'Connection lost, attempting to reconnect...'
        // Emit event for subscription manager to pause
        window.dispatchEvent(new CustomEvent('nats:disconnected'))
        break
        
      case 'reconnect':
        status.value = 'connected'
        lastError.value = null
        reconnectCount.value++
        console.log(`[NATS] Reconnected (count: ${reconnectCount.value})`)
        // Emit event for subscription manager to refresh
        window.dispatchEvent(new CustomEvent('nats:reconnected'))
        break
        
      case 'error':
        console.error('[NATS] Connection error:', s.data)
        // Don't change status - let disconnect/reconnect handle it
        break
        
      case 'staleConnection':
        console.warn('[NATS] Stale connection detected')
        lastError.value = 'Connection stale - server not responding'
        break
        
      case 'reconnecting':
        status.value = 'reconnecting'
        break

      case 'pingTimer':
        // Ignore ping timer events (noisy)
        break
        
      default:
        console.log(`[NATS] Unhandled status: ${s.type}`)
    }
  }

  function startStatsLoop() {
    statsInterval = setInterval(async () => {
      if (nc.value && !nc.value.isClosed()) {
        try {
          rtt.value = await nc.value.rtt()
        } catch {
          // Connection might be in bad state
          rtt.value = null
        }
      }
    }, 10000) as unknown as number
  }

  /**
   * Attempt auto-connect on app load
   */
  async function tryAutoConnect() {
    loadSettings()
    
    if (!autoConnect.value || serverUrls.value.length === 0) {
      return
    }

    const storedCreds = getStoredCreds()
    if (storedCreds) {
      try {
        await connect(undefined, { credsContent: storedCreds }, !!localStorage.getItem(STORAGE_KEYS.CREDS))
      } catch (err) {
        console.error('[NATS] Auto-connect failed:', err)
      }
    }
  }

  return {
    // State
    nc,
    status,
    lastError,
    serverUrls,
    autoConnect,
    rtt,
    reconnectCount,
    isConnected,
    
    // Actions
    loadSettings,
    saveSettings,
    addUrl,
    removeUrl,
    saveCredsFile,
    getStoredCreds,
    clearStoredCreds,
    connect,
    disconnect,
    tryAutoConnect,
  }
})
