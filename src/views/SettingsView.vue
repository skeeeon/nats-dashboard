<template>
  <div class="settings-view">
    <div class="settings-container">
      <div class="settings-header">
        <h1>NATS Connection Settings</h1>
        <button class="btn-secondary" @click="$router.push('/')">
          ← Back to Dashboard
        </button>
      </div>
      
      <!-- Loading overlay when connecting -->
      <div v-if="connecting" class="loading-overlay">
        <LoadingState 
          message="Connecting to NATS..."
          submessage="Authenticating and establishing connection"
          size="large"
          variant="primary"
        />
      </div>
      
      <div v-else class="settings-content">
        <!-- Connection Status -->
        <div class="setting-section">
          <h3>Connection Status</h3>
          <div class="status-card" :class="statusClass">
            <div class="status-indicator">
              <div class="status-dot"></div>
              <span class="status-text">
                {{ statusText }}
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
              :disabled="connecting || !serverUrl"
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
import LoadingState from '@/components/common/LoadingState.vue'

/**
 * Settings View
 * 
 * Grug say: Configure NATS connection. Simple form.
 * Connect button. Disconnect button. That's it.
 * 
 * NEW: Now with loading states and design token colors!
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
 * Status text based on connection state
 */
const statusText = computed(() => {
  switch (natsStore.status) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting...'
    case 'reconnecting':
      return 'Reconnecting...'
    case 'disconnected':
    default:
      return 'Disconnected'
  }
})

/**
 * CSS class for status card based on connection state
 */
const statusClass = computed(() => {
  switch (natsStore.status) {
    case 'connected':
      return 'status-connected'
    case 'connecting':
    case 'reconnecting':
      return 'status-connecting'
    case 'disconnected':
    default:
      return 'status-disconnected'
  }
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
    console.log('[Settings] Credentials file loaded')
  } catch (err) {
    console.error('[Settings] Failed to read credentials file:', err)
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
    
    // Small delay to show success state
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Navigate to dashboard
    router.push('/')
    
  } catch (err: any) {
    console.error('[Settings] Connection failed:', err)
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
    console.error('[Settings] Disconnect failed:', err)
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
  background: var(--bg);
  color: var(--text);
  padding: 24px;
  overflow-y: auto;
  position: relative;
}

.settings-container {
  max-width: 800px;
  margin: 0 auto;
  position: relative;
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

/* Loading overlay */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Setting Sections */
.setting-section {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
}

.setting-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}

/* Status Card - now using design tokens! */
.status-card {
  padding: 16px;
  border-radius: 6px;
  border: 2px solid;
  transition: all 0.3s ease;
}

.status-card.status-connected {
  background: var(--color-success-bg);
  border-color: var(--color-success-border);
}

.status-card.status-connecting {
  background: var(--color-info-bg);
  border-color: var(--color-info-border);
}

.status-card.status-disconnected {
  background: var(--color-error-bg);
  border-color: var(--color-error-border);
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
  animation: pulse 2s ease-in-out infinite;
}

.status-card.status-connected .status-dot {
  background: var(--color-success);
}

.status-card.status-connecting .status-dot {
  background: var(--color-info);
}

.status-card.status-disconnected .status-dot {
  background: var(--color-error);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.rtt {
  margin-left: auto;
  color: var(--muted);
  font-size: 13px;
}

.error-message {
  margin-top: 12px;
  padding: 12px;
  background: var(--color-error-bg);
  border-radius: 4px;
  color: var(--color-error);
  font-size: 13px;
  line-height: 1.4;
}

/* Form Inputs */
.input-field {
  width: 100%;
  padding: 12px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 14px;
  font-family: var(--mono);
  transition: all 0.2s;
}

.input-field:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-info-bg);
}

.input-field:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-input {
  width: 100%;
  padding: 8px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.file-input:hover:not(:disabled) {
  border-color: var(--color-accent);
}

.file-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.help-text {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
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
  color: var(--text);
}

.input-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stored-creds-indicator {
  margin-top: 8px;
  color: var(--color-success);
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
  accent-color: var(--color-primary);
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
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-danger {
  background: var(--color-error);
  color: white;
}

.btn-danger:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.btn-danger:active {
  transform: translateY(0);
}

.action-buttons {
  display: flex;
  gap: 12px;
}
</style>
