# NATS Dashboard 🪨

A high-performance, real-time dashboard for NATS messaging systems. Built with Vue 3, TypeScript, and a "client-side only" architecture that connects directly to your NATS server via WebSockets.

## 🚀 Features

### Core Architecture
*   **Zero Backend:** Runs entirely in the browser. No intermediate API server required.
*   **Direct Connection:** Connects to NATS via WebSockets (`ws://` or `wss://`).
*   **High Performance:** Optimized message buffering and frame-based rendering (RAF) to handle high-throughput streams without freezing the UI.
*   **Auto-Reconnect:** Robust connection handling that preserves data visualizations during network blips.

### 📊 Visualization Widgets
*   **Chart Widget:** Real-time Line charts. Supports **JetStream** history.
*   **Text Widget:** Display raw values or JSON fields. Supports conditional coloring (thresholds).
*   **Stat Card:** KPI display with sparklines and trend indicators (e.g., "↑ 5% vs last 10 messages").
*   **Gauge Widget:** Circular meter with configurable color zones (Success/Warning/Error).

### 🎛️ Control Widgets
*   **Button:** Publish pre-configured payloads to subjects. Supports "Fire & Forget" or "Request/Reply" patterns.
*   **Switch:** Toggle control.
    *   *KV Mode:* Directly modifies a value in a NATS Key-Value bucket.
    *   *Core Mode:* Publishes `on`/`off` payloads to a subject.
*   **Slider:** Range control for continuous values. Supports "Digital Twin" syncing via KV or Pub/Sub.

### 🗺️ Advanced Widgets
*   **Map Widget (Leaflet):** Real-time geospatial visualization.
    *   Place markers at static coords or dynamic variables.
    *   **Popup Actions:** Add buttons, switches, or live data displays inside marker popups.
*   **KV Explorer:** View and watch raw values in a JetStream Key-Value bucket. Supports JSON path extraction.

### 💾 Storage & Templating
*   **Hybrid Storage:**
    *   *Local:* Dashboards saved to browser `localStorage`.
    *   *Shared:* Store dashboards in a NATS KV bucket to share with your team.
*   **Variables:** Define templates (e.g., `{{device_id}}`) to switch contexts instantly (e.g., switch from `truck-1` to `truck-2`).

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
    *   **New:** Only listen for new messages.
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
