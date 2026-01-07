# NATS Dashboard 🪨

A high-performance, real-time dashboard for NATS messaging systems. Built with Vue 3, TypeScript, and a "client-side only" architecture that connects directly to your NATS server via WebSockets.

## Features

*   **Zero Backend** - Runs entirely in the browser. Connects directly to NATS WebSockets.
*   **Dashboard Variables** - Create templates (e.g., `{{device_id}}`) to switch contexts instantly without duplicating dashboards.
*   **Hybrid Storage** - Store dashboards locally in the browser or share them with your team using NATS JetStream KV.
*   **Real-time Visualization** - Monitor high-frequency data streams without browser freezing (optimized frame-based throttling).
*   **Interactive Controls** - Publish messages, toggle switches, and adjust sliders directly from the UI.
*   **Geospatial Data** - Interactive maps with live markers and actions (Publish/Switch).
*   **Theming** - Built-in Dark and Light modes.

## Quick Start

### 1. Configure NATS Server
The dashboard requires a NATS server with WebSockets enabled. Add this to your `nats.conf`:

```text
websocket {
    port: 9222
    no_tls: true  # Set to false if using SSL/WSS
}

# Required for Shared Dashboards & KV Widgets
jetstream {
    store_dir: './data'
}
```

### 2. Run the Dashboard

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### 3. Connect
1.  Navigate to the **Settings** page.
2.  Enter your NATS WebSocket URL (e.g., `ws://localhost:9222`).
3.  (Optional) Upload a `.creds` file, token, or username/password.
4.  Click **Connect**.

## Dashboard Variables (Templating)

Variables allow you to create a single dashboard layout that works across multiple contexts (e.g., `prod`/`dev` environments or `truck-1`/`truck-2` devices).

1.  Click the **{ }** button in the toolbar to open the Variable Bar.
2.  Click **Edit** (pencil icon) to define variables (e.g., Name: `device_id`, Default: `sensor-1`).
3.  Use the variable in your widget configuration using double curly braces: `{{device_id}}`.

**Where Variables Work:**
*   ✅ **NATS Subjects:** `telemetry.{{device_id}}.temp`
*   ✅ **KV Buckets/Keys:** Bucket: `config-{{env}}`, Key: `{{device_id}}`
*   ✅ **Button Payloads:** `{"id": "{{device_id}}", "action": "reset"}`
*   ✅ **Map Actions:** Publish subjects and payloads.

**Where Variables Do NOT Work (Yet):**
*   ❌ Visual Labels (Widget Titles, Switch Labels).
*   ❌ JSONPath expressions.

## Widget Types

### Visualization
*   **Text Widget**: Displays the latest value from a subject. Supports JSONPath extraction and conditional coloring (thresholds).
*   **Chart Widget**: Real-time line, bar, pie, or gauge charts using ECharts.
*   **Stat Card**: Large KPI display with trend indicators (e.g., "↑ 5% vs last 10 messages") and sparklines.
*   **Gauge**: Circular meter with configurable color zones (Success/Warning/Error).

### Control
*   **Button**: Publishes a pre-configured payload to a subject when clicked.
*   **Switch**: Toggle control with two modes:
    *   *KV Mode*: Directly modifies a value in a KV bucket.
    *   *CORE Mode*: Publishes `on`/`off` payloads to a subject.
*   **Slider**: Range control for continuous values. Supports "Digital Twin" syncing via KV or Pub/Sub.

### Advanced
*   **Map Widget**: Leaflet-based map. Place markers at specific coordinates. Markers can have actions (Publish or Toggle Switch) inside their popups.
*   **KV Explorer**: View and watch raw values in a JetStream Key-Value bucket.

## Storage Modes

### Local Dashboards
By default, dashboards are stored in your browser's `localStorage`. These are private to your device and persist across reloads.

### Shared Dashboards (KV)
Enable **Shared Dashboards** in Settings to store layouts directly in a NATS Key-Value bucket (default: `dashboards`).
*   **Collaboration**: Dashboards created here are visible to anyone connected to the same NATS cluster.
*   **Folders**: Organize dashboards using dot-notation (e.g., `ops.prod.main`).
*   **Live Updates**: If a team member updates a dashboard, you will receive a notification to reload the latest version.

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| **S** | Save Dashboard (if Shared) |
| **N** | Add New Widget |
| **T** | Create New (Local) Dashboard |
| **B** | Toggle Sidebar |
| **V** | Toggle Variable Bar |
| **L** | Lock Dashboard |
| **U** | Unlock Dashboard |
| **Esc** | Close Modals / Exit Full Screen |
| **?** | Show Shortcuts Help |

## Troubleshooting

**"Cannot reach NATS server"**
*   Ensure your NATS server config has `websocket` enabled.
*   Check that you are using the correct protocol (`ws://` vs `wss://`).
*   If using `wss://` (Secure) with a self-signed certificate, ensure your browser trusts it.

**"Authentication Failed"**
*   If using a `.creds` file, ensure it contains the JWT and Seed.
*   Check that the user has permissions to subscribe to the requested subjects and access the `dashboards` KV bucket.

**"Shared Dashboards not loading"**
*   Ensure JetStream is enabled on your NATS server.
*   Verify the KV bucket exists (default: `dashboards`) or that your user has permission to create it.

## License

MIT
