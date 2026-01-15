# NATS Dashboard 🪨

A high-performance, real-time dashboard for NATS messaging systems. Built with Vue 3, TypeScript, and a "client-side only" architecture that connects directly to your NATS server via WebSockets.

**Zero Backend.** No API server required. Just your browser and NATS.

## 🚀 Features

### Core Architecture
*   **Direct Connection:** Connects via WebSockets (`ws://` or `wss://`) directly to NATS.
*   **Zero Backend:** Host the static files anywhere (S3, Nginx, GitHub Pages) or run locally.
*   **High Performance:** Optimized message buffering (Ring Buffers) and frame-based rendering to handle high-throughput streams.
*   **Auto-Reconnect:** Robust connection handling preserves data visualizations during network interruptions.

### 📊 Visualization Widgets
*   **Status Indicator:** Traffic-light style indicator.
    *   **Watchdog:** Automatically detects "stale" data (dead air) and changes color if no message is received within a threshold.
    *   **Mappings:** Map values (e.g., "running", "error") or wildcards (`*`) to specific colors and pulse animations.
    *   **Dual Mode:** Works with Pub/Sub streams or KV watchers.
*   **Chart Widget:** Real-time Line charts. Supports **JetStream** history replay.
*   **Text Widget:** Display raw values or JSON fields. Supports conditional coloring (thresholds).
*   **Stat Card:** KPI display with sparklines and trend indicators (e.g., "↑ 5% vs last 10 messages").
*   **Gauge Widget:** Circular meter with configurable color zones (Success/Warning/Error).
*   **Console:** Real-time log stream viewer with filtering, pausing, and JSON expansion.

### 🎛️ Control Widgets
*   **Button:** Publish pre-configured payloads. Supports "Fire & Forget" or "Request/Reply" patterns.
*   **Switch:** Toggle control.
    *   *KV Mode:* Directly modifies a value in a NATS Key-Value bucket.
    *   *Core Mode:* Publishes `on`/`off` payloads to a subject.
*   **Slider:** Range control for continuous values. Supports "Digital Twin" syncing via KV or Pub/Sub.
*   **Publisher:** Ad-hoc message sender with history and request/reply support.

### 🗺️ Geospatial
*   **Map Widget (Leaflet):** Real-time tracking.
    *   **Live Markers:** Update positions via NATS messages.
    *   **Interactive Popups:** Embed buttons, switches, or live data displays *inside* marker popups.

### 💾 Storage & Templating
*   **Hybrid Storage:**
    *   *Local:* Dashboards saved to browser `localStorage`.
    *   *Shared:* Store dashboards in a NATS KV bucket to share with your team without an external DB.
*   **Variables:** Define templates (e.g., `{{device_id}}`) to switch contexts instantly (e.g., switch dashboard from `truck-1` to `truck-2`).

---

## 🛠️ Quick Start

### 1. Configure NATS Server
The dashboard requires a NATS server with **WebSockets** enabled. If you want to use Shared Dashboards or KV widgets, **JetStream** must be enabled.

Add this to your `nats.conf`:

```text
websocket {
    port: 9222
    no_tls: true  # Set to false if using SSL/WSS
}

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

---

## 🌊 JetStream Support

Unlike standard NATS Core (which is fire-and-forget), JetStream allows widgets to load historical data.

1.  Open **Configure Widget**.
2.  In the **Data Source** section, check **Use JetStream**.
3.  Select a **Deliver Policy**:
    *   **All:** Load entire stream history.
    *   **Last:** Load only the last message.
    *   **Last Per Subject:** Load the last message for every subject in the stream (great for "current state" of multiple sensors).
    *   **By Time Window:** Load messages from the last `X` duration (e.g., `10m`, `1h`, `24h`).

---

## 🧩 Dashboard Variables

Variables allow you to create a single dashboard layout that works across multiple contexts.

1.  Click the **{ }** button in the toolbar.
2.  Click **Edit** (pencil icon) to define variables (e.g., Name: `env`, Default: `prod`).
3.  Use the variable in widget configuration: `metrics.{{env}}.cpu`.

**Supported Fields:**
*   ✅ NATS Subjects: `telemetry.{{device_id}}.temp`
*   ✅ KV Buckets/Keys: Bucket `config-{{env}}`
*   ✅ Payloads: `{"id": "{{device_id}}", "action": "reset"}`

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| **S** | Save Dashboard (if Shared) |
| **N** | Add New Widget |
| **T** | Create New Dashboard |
| **B** | Toggle Sidebar |
| **V** | Toggle Variable Bar |
| **L** | Lock Dashboard (View Mode) |
| **U** | Unlock Dashboard (Edit Mode) |
| **Esc** | Close Modals / Exit Full Screen |
| **?** | Show Shortcuts Help |

---

## ⚠️ Troubleshooting

**"Cannot reach NATS server"**
*   Ensure `websocket` is enabled in `nats.conf`.
*   Check protocol: Use `ws://` for insecure (localhost) and `wss://` for secure connections.
*   If using `wss://` with a self-signed cert, you may need to visit the NATS port in your browser once to accept the certificate.

**"JetStream/KV widgets not working"**
*   Ensure JetStream is enabled in `nats.conf`.
*   Verify there is a stream containing the requested subject.

**"Charts are empty on reload"**
*   Standard NATS subscriptions only show *new* data. Enable **JetStream** in the widget config and set policy to `By Time Window` to see historical data.

---

## License

MIT
