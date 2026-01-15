# NATS Dashboard 🪨

A high-performance, real-time dashboard for NATS messaging systems. Built with **Vue 3**, **TypeScript**, and a "client-side only" architecture that connects directly to your NATS server via WebSockets.

**Zero Backend.** No API server required. No database required. Just your browser and NATS.

## 🚀 Core Philosophy

*   **Direct Connection:** Connects via WebSockets (`ws://` or `wss://`) directly to NATS.
*   **Infrastructure-Less:** Host the static files anywhere (S3, Nginx, GitHub Pages) or run locally.
*   **Grug Brained:** Simple, robust architecture. No complex middleware.
*   **High Performance:** Optimized message buffering (Ring Buffers) and `requestAnimationFrame` rendering to handle high-throughput streams without freezing the browser.

---

## 🛠️ Quick Start

### 1. Configure NATS Server
The dashboard requires a NATS server with **WebSockets** enabled. For Shared Dashboards and KV widgets to work, **JetStream** must be enabled.

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

Open `http://localhost:5173`.

### 3. Connect
1.  Navigate to **Settings**.
2.  Enter your NATS WebSocket URL (e.g., `ws://localhost:9222`).
3.  (Optional) Upload a `.creds` file, token, or username/password.
4.  Click **Connect**.

---

## 📊 Widgets

### Visualization
*   **Status Indicator:** Traffic-light style indicator.
    *   *Watchdog:* Detects "stale" data (dead air) and changes color if no message is received within a threshold.
    *   *Mappings:* Map specific values (or wildcards `*`) to colors and pulse animations.
*   **Chart Widget:** Real-time Line charts. Supports JetStream history replay.
*   **Text Widget:** Display raw values. Supports JSONPath extraction (e.g., `$.sensors[0].temp`) and conditional coloring.
*   **Stat Card:** KPI display with sparklines and trend indicators (e.g., "↑ 5% vs last 10 messages").
*   **Gauge Widget:** Circular meter with configurable color zones.
*   **Console:** Real-time log stream.
    *   *Multi-Subject:* Subscribe to `logs.error`, `logs.warn`, and `app.>` simultaneously.
    *   *Features:* Filtering, pausing, and JSON expansion.

### Control & Input
*   **Button:** Publish pre-configured payloads. Supports "Fire & Forget" or "Request/Reply" patterns.
*   **Switch:** Toggle control.
    *   *KV Mode:* Directly modifies a value in a NATS Key-Value bucket.
    *   *Core Mode:* Publishes `on`/`off` payloads to a subject.
*   **Slider:** Range control for continuous values. Supports "Digital Twin" syncing via KV or Pub/Sub.
*   **Publisher:** Ad-hoc message sender with history and request/reply support.

### Advanced / Context
*   **Markdown Widget:** Render rich text, tables, and images.
    *   *Static Mode:* Documentation, links, runbooks.
    *   *Dynamic Mode:* Bind to a NATS Subject or KV Key. Incoming JSON is flattened and exposed as variables (e.g., `{{firmware_version}}`) inside the markdown.
*   **Map Widget (Leaflet):** Real-time geospatial tracking.
    *   *Live Markers:* Update positions via NATS.
    *   *Interactive Popups:* Embed buttons, switches, or live data displays *inside* marker popups.

---

## 🌊 JetStream & KV Support

### JetStream History
Most visualization widgets support JetStream. In the **Data Source** config:
1.  Check **Use JetStream**.
2.  Select **Deliver Policy**:
    *   `Last Per Subject`: Great for "Current State" of many devices.
    *   `By Time Window`: Load last `10m`, `1h`, `24h` of data.

### KV Store Integration
*   **KV Widget:** View raw or JSON formatted data from any KV bucket.
*   **Shared Dashboards:** Save your dashboard layouts directly to a NATS KV bucket (`dashboards`). This allows your entire team to see the same views without a centralized database.

---

## 🧩 Variables & Templating

Create a single dashboard layout that works across multiple contexts (e.g., switching between `prod` and `dev`, or `truck-1` and `truck-2`).

1.  Click the **{ }** button in the toolbar.
2.  Define variables (e.g., Name: `device_id`, Default: `sensor-01`).
3.  Use the variable in widget configuration: `telemetry.{{device_id}}.temp`.

**Supported Fields:**
*   ✅ NATS Subjects
*   ✅ KV Buckets/Keys
*   ✅ Payloads (JSON)
*   ✅ Markdown Content

---

## 📱 Responsive Layout

The dashboard uses a "Squishy Grid" system that adapts to your screen size.

*   **Desktop/Tablet:** 12-column grid (configurable). Widgets scale horizontally but maintain relative positions.
*   **Mobile (<768px):** Automatically switches to a vertical **Card View**. Controls become touch-friendly, and charts simplify.

**Custom Grid Size:** In the toolbar, you can force the column count (e.g., 4, 8, 16) to optimize for ultra-wide screens or vertical tablet mount displays.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| **S** | Save Dashboard (Local or KV) |
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
*   Ensure `websocket` block is present in `nats.conf`.
*   Check protocol: Use `ws://` for insecure (localhost) and `wss://` for secure connections.
*   If using self-signed certs with `wss://`, visit the NATS port in your browser once to accept the certificate.

**"JetStream/KV widgets not working"**
*   Ensure JetStream is enabled in `nats.conf`.
*   Verify the Stream or Bucket actually exists.

**"Markdown variables not resolving"**
*   Global variables (from the toolbar) work everywhere.
*   Data variables (from a subscription/KV) only work inside the Markdown body content, not in the subject/key configuration.

---

## License

MIT
