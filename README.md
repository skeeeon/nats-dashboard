# NATS Dashboard 🪨

A real-time customizable dashboard for NATS messaging, built with Vue 3 and TypeScript.

## Features

- **Real-time Data Visualization** - Monitor NATS messages with customizable widgets
- **Subscription Sharing** - Efficient subscription management (one NATS subscription shared by multiple widgets)
- **Drag & Drop Layout** - Arrange widgets with intuitive drag and drop
- **Multiple Widget Types** - Text displays, charts (coming in Phase 2), buttons, KV store viewers
- **JSONPath Extraction** - Extract specific data from complex JSON messages
- **Message Buffering** - Configurable count-based message history per widget
- **Dashboard Persistence** - Save and load dashboard configurations via localStorage
- **WebSocket Support** - Connect to NATS servers via ws:// or wss://
- **Multiple Auth Methods** - Credentials files (.creds), tokens, or username/password

## Architecture

### Key Design Patterns

**Subscription Manager (The Smart Part)**

Instead of creating N NATS subscriptions for N widgets watching the same subject, we create 1 shared subscription:

```
Widget A ────┐
Widget B ────┼──→ Subscription Manager ──→ NATS Subject
Widget C ────┘
```

This prevents connection bloat and improves performance.

**Store Separation**

- `stores/nats.ts` - Connection management
- `stores/dashboard.ts` - Widget configurations (blueprints)
- `stores/widgetData.ts` - Real-time message buffers (actual data)

Think: Recipe book vs. actual food in kitchen

## Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Quick Start

### 1. Start NATS Server with WebSocket

Create `nats.conf`:
```
websocket {
    port: 9222
    no_tls: true
}

jetstream {
    store_dir: './data'
}
```

Start server:
```bash
nats-server -c nats.conf
```

### 2. Launch Dashboard

```bash
npm run dev
```

Open browser to `http://localhost:5173`

### 3. Connect to NATS

1. Click "Settings" (or will auto-redirect if not connected)
2. Enter server URL: `ws://localhost:9222`
3. (Optional) Upload `.creds` file or enter credentials
4. Click "Connect"

### 4. Add Test Widget

For Phase 1 testing, use the "Add Test Widget" button which creates a text widget subscribed to `test.subject`.

Publish test messages:
```bash
nats pub test.subject '{"value": 42, "unit": "°C"}'
nats pub test.subject '{"value": 43, "unit": "°C"}'
```

You should see values appear in the widget!

## Project Structure

```
src/
├── main.ts                          # App entry point
├── App.vue                          # Root component
├── router/
│   └── index.ts                     # Route configuration
├── stores/
│   ├── nats.ts                      # NATS connection (simplified)
│   ├── dashboard.ts                 # Dashboard configs
│   └── widgetData.ts                # Real-time data buffers
├── composables/
│   └── useSubscriptionManager.ts    # Shared subscription logic
├── components/
│   ├── dashboard/
│   │   ├── DashboardGrid.vue        # Grid layout container
│   │   └── WidgetContainer.vue      # Widget wrapper
│   └── widgets/
│       └── TextWidget.vue           # Display latest value
├── views/
│   ├── DashboardView.vue            # Main dashboard page
│   └── SettingsView.vue             # NATS connection settings
└── types/
    └── dashboard.ts                 # TypeScript definitions
```

## Configuration

### Widget Configuration

Widgets are configured via `WidgetConfig` objects:

```typescript
{
  id: string                 // Unique identifier
  type: 'text' | 'chart' | 'button' | 'kv'
  title: string              // Display name
  x, y, w, h: number         // Grid position
  
  dataSource: {
    type: 'subscription' | 'consumer' | 'kv'
    subject?: string         // NATS subject pattern
    stream?: string          // JetStream stream
    kvBucket?: string        // KV bucket name
    kvKey?: string           // KV key
  }
  
  jsonPath?: string          // Extract data (e.g., "$.temperature")
  buffer: {
    maxCount: number         // Keep last N messages
  }
  
  // Widget-specific config
  textConfig?: { ... }
  chartConfig?: { ... }
  buttonConfig?: { ... }
  kvConfig?: { ... }
}
```

### JSONPath Examples

Extract specific data from nested messages:

```javascript
// Message: {"sensors": [{"temp": 25}]}
// Path: "$.sensors[0].temp"
// Result: 25

// Message: {"data": {"value": 42}}
// Path: "$.data.value"
// Result: 42

// Message: {"values": [1, 2, 3]}
// Path: "$.values[1]"
// Result: 2
```

## Dependencies

Kept minimal:

| Dependency | Purpose | Why? |
|------------|---------|------|
| **Vue 3** | UI Framework | Reactive, composition API |
| **Pinia** | State Management | Simple stores |
| **Vue Router** | Routing | Page navigation |
| **@nats-io/nats-core** | NATS Client | Connect to NATS |
| **@nats-io/jetstream** | JetStream | Stream/consumer support |
| **@nats-io/kv** | KV Store | Key-value operations |
| **vue-echarts** | Charts | Data visualization |
| **echarts** | Chart Engine | Powerful charting library |
| **jsonpath-plus** | JSON Extraction | Extract nested data |
| **grid-layout-plus** | Drag & Drop Grid | Widget layout |

## Development

### Running Tests

Currently no test suite (future enhancement). Manual testing workflow:

1. Start NATS server with WebSocket
2. Launch dev server: `npm run dev`
3. Connect to NATS via settings page
4. Add test widget
5. Publish test messages
6. Verify widget updates

### Debugging

Enable verbose logging:
```javascript
// In browser console
localStorage.setItem('debug', 'nats:*')
```

View subscription stats:
```javascript
// In browser console
const subMgr = window.__SUB_MGR__  // Exposed for debugging
console.log(subMgr.getStats())
```

## Troubleshooting

### "Cannot reach NATS server"
- Ensure NATS server is running
- Verify WebSocket is enabled in config
- Check URL is correct (default: `ws://localhost:9222`)

### "Authentication failed"
- Verify credentials file is valid
- Check token is correct
- Ensure username/password match server config

### Widgets not updating
- Check NATS connection status (top toolbar)
- Verify subject exists and has messages
- Check JSONPath is valid (open browser console)
- Review subscription manager stats

## Contributing

1. Keep it simple (grug brain!)
2. Comment your code
3. Test manually before committing
4. Follow existing patterns
5. Update README when adding features

## License

MIT
