<template>
  <div class="settings-view">
    <div class="settings-container">
      <div class="settings-header">
        <h1>NATS Connection Settings</h1>
        <button class="btn-secondary" @click="$router.push('/')">
          ← Back to Dashboard
        </button>
      </div>
      
      <div class="settings-content">
        <!-- Connection Status -->
        <div class="setting-section">
          <h3>Connection Status</h3>
          <div class="status-card" :class="{ connected: natsStore.isConnected }">
            <div class="status-indicator">
              <div class="status-dot"></div>
              <span class="status-text">
                {{ natsStore.status === 'connected' ? 'Connected' : 
                   natsStore.status === 'connecting' ? 'Connecting...' :
                   natsStore.status === 'reconnecting' ? 'Reconnecting...' :
                   'Disconnected' }}
              </span>
              <span v-if="natsStore.rtt" class="rtt">RTT: {{ natsStore.rtt }}ms</span>
            </div>
            <div v-if="natsStore.lastError" class="error-message">
              {{ natsStore.lastError }}
            </div>
          </div>
        </div>
        
        <!-- Server URL -->
        <div class="setting-section">
          <h3>Server URL</h3>
          <input 
            v-model="serverUrl"
            type="text"
            placeholder="ws://localhost:9222"
            :disabled="natsStore.isConnected"
            class="input-field"
          />
          <div class="help-text">
            WebSocket URL (ws:// or wss://). Default: ws://localhost:9222
          </div>
        </div>
        
        <!-- Authentication -->
        <div class="setting-section">
          <h3>Authentication</h3>
          
          <!-- Credentials File -->
          <div class="auth-method">
            <label class="method-label">Credentials File (.creds)</label>
            <input 
              type="file"
              accept=".creds,.txt"
              @change="handleCredsFile"
              :disabled="natsStore.isConnected"
              class="file-input"
            />
            <div v-if="hasStoredCreds" class="stored-creds-indicator">
              ✓ Credentials file stored
            </div>
          </div>
          
          <!-- Token -->
          <div class="auth-method">
            <label class="method-label">Token</label>
            <input 
              v-model="token"
              type="password"
              placeholder="Authentication token"
              :disabled="natsStore.isConnected"
              class="input-field"
            />
          </div>
          
          <!-- Username/Password -->
          <div class="auth-method">
            <label class="method-label">Username & Password</label>
            <div class="input-group">
              <input 
                v-model="username"
                type="text"
                placeholder="Username"
                :disabled="natsStore.isConnected"
                class="input-field"
              />
              <input 
                v-model="password"
                type="password"
                placeholder="Password"
                :disabled="natsStore.isConnected"
                class="input-field"
              />
            </div>
          </div>
          
          <div class="help-text">
            Choose one authentication method. Credentials file recommended for production.
          </div>
        </div>
        
        <!-- Auto-connect -->
        <div class="setting-section">
          <h3>Auto-connect</h3>
          <label class="checkbox-label">
            <input 
              v-model="natsStore.autoConnect"
              type="checkbox"
              @change="natsStore.saveSettings()"
            />
            <span>Automatically connect on app startup</span>
          </label>
        </div>
        
        <!-- Actions -->
        <div class="setting-section">
          <div class="action-buttons">
            <button 
              v-if="!natsStore.isConnected"
              class="btn-primary btn-large"
              :disabled="connecting"
              @click="handleConnect"
            >
              {{ connecting ? 'Connecting...' : 'Connect' }}
            </button>
            <button 
              v-else
              class="btn-danger btn-large"
              @click="handleDisconnect"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNatsStore } from '@/stores/nats'

/**
 * Settings View
 * 
 * Grug say: Configure NATS connection. Simple form.
 * Connect button. Disconnect button. That's it.
 */

const router = useRouter()
const natsStore = useNatsStore()

// Form fields
const serverUrl = ref('')
const token = ref('')
const username = ref('')
const password = ref('')
const credsContent = ref<string | null>(null)

const connecting = ref(false)

// Check if we have stored credentials
const hasStoredCreds = computed(() => {
  return credsContent.value !== null || natsStore.getStoredCreds() !== null
})

/**
 * Handle credentials file upload
 */
async function handleCredsFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  try {
    const text = await file.text()
    credsContent.value = text
    console.log('Credentials file loaded')
  } catch (err) {
    console.error('Failed to read credentials file:', err)
    alert('Failed to read credentials file')
  }
}

/**
 * Connect to NATS
 */
async function handleConnect() {
  if (!serverUrl.value) {
    alert('Please enter a server URL')
    return
  }
  
  connecting.value = true
  
  try {
    // Build auth options
    const authOptions: any = {}
    
    if (credsContent.value) {
      authOptions.credsContent = credsContent.value
    } else if (token.value) {
      authOptions.token = token.value
    } else if (username.value) {
      authOptions.user = username.value
      authOptions.pass = password.value
    }
    
    // Connect
    await natsStore.connect(serverUrl.value, authOptions)
    
    // Save URL to history
    natsStore.addUrl(serverUrl.value)
    natsStore.saveSettings()
    
    // Navigate to dashboard
    router.push('/')
    
  } catch (err: any) {
    console.error('Connection failed:', err)
    alert(err.message || 'Connection failed')
  } finally {
    connecting.value = false
  }
}

/**
 * Disconnect from NATS
 */
async function handleDisconnect() {
  try {
    await natsStore.disconnect()
  } catch (err) {
    console.error('Disconnect failed:', err)
  }
}

/**
 * Load settings on mount
 */
onMounted(() => {
  natsStore.loadSettings()
  
  // Load last URL
  if (natsStore.serverUrls.length > 0) {
    serverUrl.value = natsStore.serverUrls[0]
  } else {
    serverUrl.value = 'ws://localhost:9222'
  }
  
  // Load stored credentials if available
  const stored = natsStore.getStoredCreds()
  if (stored) {
    credsContent.value = stored
  }
})

/**
 * Watch server URL changes and save to history
 */
watch(serverUrl, (newUrl) => {
  if (newUrl && !natsStore.isConnected) {
    // Save URL as it's typed (debounced by watch)
    if (natsStore.serverUrls[0] !== newUrl) {
      natsStore.serverUrls[0] = newUrl
      natsStore.saveSettings()
    }
  }
})
</script>

<style scoped>
.settings-view {
  min-height: 100vh;
  height: 100vh;
  background: var(--bg, #0a0a0a);
  color: var(--text, #e0e0e0);
  padding: 24px;
  overflow-y: auto;
}

.settings-container {
  max-width: 800px;
  margin: 0 auto;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.settings-header h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Setting Sections */
.setting-section {
  background: var(--panel, #161616);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  padding: 24px;
}

.setting-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted, #888);
}

/* Status Card */
.status-card {
  padding: 16px;
  border-radius: 6px;
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.3);
}

.status-card.connected {
  background: rgba(63, 185, 80, 0.1);
  border-color: rgba(63, 185, 80, 0.3);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--danger, #f85149);
}

.status-card.connected .status-dot {
  background: var(--primary, #3fb950);
}

.status-text {
  font-size: 16px;
  font-weight: 600;
}

.rtt {
  margin-left: auto;
  color: var(--muted, #888);
  font-size: 13px;
}

.error-message {
  margin-top: 12px;
  padding: 12px;
  background: rgba(248, 81, 73, 0.1);
  border-radius: 4px;
  color: var(--danger, #f85149);
  font-size: 13px;
}

/* Form Inputs */
.input-field {
  width: 100%;
  padding: 12px;
  background: var(--input-bg, #050505);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  color: var(--text, #e0e0e0);
  font-size: 14px;
  font-family: var(--mono, monospace);
  transition: all 0.2s;
}

.input-field:focus {
  outline: none;
  border-color: var(--accent, #58a6ff);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
}

.input-field:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-input {
  width: 100%;
  padding: 8px;
  background: var(--input-bg, #050505);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  color: var(--text, #e0e0e0);
  font-size: 14px;
  cursor: pointer;
}

.help-text {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted, #888);
  line-height: 1.4;
}

/* Auth Methods */
.auth-method {
  margin-bottom: 20px;
}

.auth-method:last-child {
  margin-bottom: 0;
}

.method-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text, #e0e0e0);
}

.input-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stored-creds-indicator {
  margin-top: 8px;
  color: var(--primary, #3fb950);
  font-size: 13px;
  font-weight: 500;
}

/* Checkbox */
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  font-size: 14px;
}

.checkbox-label input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

/* Buttons */
.btn-primary,
.btn-secondary,
.btn-danger {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-large {
  padding: 14px 32px;
  font-size: 16px;
  width: 100%;
}

.btn-primary {
  background: var(--primary, #3fb950);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover, #2ea043);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text, #e0e0e0);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-danger {
  background: var(--danger, #f85149);
  color: white;
}

.btn-danger:hover {
  background: #dc4c41;
}

.action-buttons {
  display: flex;
  gap: 12px;
}
</style>
