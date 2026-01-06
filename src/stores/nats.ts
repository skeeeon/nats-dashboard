import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { 
  wsconnect, 
  credsAuthenticator, 
  type NatsConnection
} from '@nats-io/nats-core'

/**
 * NATS Connection Store
 * 
 * Manages connection to NATS server with WebSocket support
 * Stores connection settings in localStorage/sessionStorage
 * Handles authentication via .creds file, token, or user/pass
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
  let statsInterval: number | null = null

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
    CREDS: 'nats_dashboard_creds', // Store last creds file content
  }

  function loadSettings() {
    // Load URLs
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

    // Load auto-connect preference
    const savedAuto = localStorage.getItem(STORAGE_KEYS.AUTO_CONNECT)
    autoConnect.value = savedAuto === 'true'
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.URLS, JSON.stringify(serverUrls.value))
    localStorage.setItem(STORAGE_KEYS.AUTO_CONNECT, String(autoConnect.value))
  }

  /**
   * Save credentials to storage
   * @param content The .creds file content
   * @param remember If true, save to localStorage (persistent). If false, sessionStorage (session only).
   */
  function saveCredsFile(content: string, remember: boolean) {
    // Clear old entries to prevent duplicates/confusion
    localStorage.removeItem(STORAGE_KEYS.CREDS)
    sessionStorage.removeItem(STORAGE_KEYS.CREDS)

    if (remember) {
      localStorage.setItem(STORAGE_KEYS.CREDS, content)
    } else {
      sessionStorage.setItem(STORAGE_KEYS.CREDS, content)
    }
  }

  function getStoredCreds(): string | null {
    // Check session first (safer), then local
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
   * 
   * @param specificUrl - Optional specific URL to connect to
   * @param authOptions - Authentication options
   * @param rememberCreds - If true, persist credentials to localStorage
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

    // Validation
    const url = specificUrl || serverUrls.value[0]
    if (!url) {
      throw new Error('No NATS URL configured')
    }

    status.value = 'connecting'
    lastError.value = null

    try {
      const opts: any = { 
        servers: [url],
        name: 'nats-dashboard',
      }

      // Setup authentication
      if (authOptions?.credsContent) {
        // Process .creds file content
        let rawText = authOptions.credsContent
        
        // Check if JWT section exists and strip any content before it
        const jwtIndex = rawText.indexOf("-----BEGIN NATS USER JWT-----")
        if (jwtIndex > 0) {
          rawText = rawText.substring(jwtIndex)
        } else if (jwtIndex === -1) {
          throw new Error("Invalid .creds file: JWT section not found")
        }
        
        // Normalize line endings
        rawText = rawText.replace(/\r\n/g, "\n")
        
        const encoder = new TextEncoder()
        const credsBytes = encoder.encode(rawText)
        opts.authenticator = credsAuthenticator(credsBytes)
        
        // Save creds based on user preference
        saveCredsFile(authOptions.credsContent, rememberCreds)
      } else if (authOptions?.token) {
        opts.token = authOptions.token
      } else if (authOptions?.user) {
        opts.user = authOptions.user
        opts.pass = authOptions.pass || ''
      }

      console.log(`Connecting to NATS at ${url}...`)
      
      nc.value = await wsconnect(opts)
      status.value = 'connected'

      monitorConnection()
      startStatsLoop()

      return nc.value

    } catch (err: any) {
      console.error('NATS Connection Error:', err)
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

  async function disconnect() {
    if (statsInterval) {
      clearInterval(statsInterval)
      statsInterval = null
    }

    if (nc.value) {
      await nc.value.close()
      nc.value = null
    }
    status.value = 'disconnected'
    rtt.value = null
  }

  async function monitorConnection() {
    if (!nc.value) return
    
    try {
      for await (const s of nc.value.status()) {
        switch (s.type) {
          case 'disconnect':
            status.value = 'reconnecting'
            break
          case 'reconnect':
            status.value = 'connected'
            break
          case 'error':
            console.error('NATS Error:', s)
            break
        }
      }
    } catch (err) {
      console.error('Connection monitor error:', err)
    }
  }

  function startStatsLoop() {
    statsInterval = setInterval(async () => {
      if (nc.value && !nc.value.isClosed()) {
        try {
          rtt.value = await nc.value.rtt()
        } catch { }
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
      // If we found creds in storage (session or local), we assume the user wanted them remembered
      // for the duration of that context
      try {
        await connect(undefined, { credsContent: storedCreds }, !!localStorage.getItem(STORAGE_KEYS.CREDS))
      } catch (err) {
        console.error('Auto-connect failed:', err)
      }
    }
  }

  return {
    nc,
    status,
    lastError,
    serverUrls,
    autoConnect,
    rtt,
    isConnected,
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
