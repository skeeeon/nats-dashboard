# NATS Dashboard 🪨

A high-performance, real-time dashboard for NATS messaging systems. Built with Vue 3, TypeScript, and a "client-side only" architecture that connects directly to your NATS server via WebSockets.

## Features

-   **Zero Backend** - Runs entirely in the browser. Connects directly to NATS WebSockets.
-   **Real-time Visualization** - Monitor high-frequency data streams without browser freezing (optimized throttling).
-   **Interactive Controls** - Publish messages, toggle switches, and adjust sliders directly from the UI.
-   **KV Store Integration** - View, watch, and modify JetStream Key-Value buckets.
-   **Multi-Dashboard** - Create, save, and switch between multiple dashboard layouts.
-   **Drag & Drop** - Fully customizable grid layout.
-   **Theming** - Built-in Dark and Light modes.
-   **Keyboard Shortcuts** - Vim-style single-key shortcuts for power users.

## Quick Start

### 1. Configure NATS Server
The dashboard requires a NATS server with WebSockets enabled. Add this to your `nats.conf`:

```text
websocket {
    port: 9222
    no_tls: true  # Set to false if using SSL/WSS
}

# Optional: Enable JetStream for KV and Stream features
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

## Widget Types

### Visualization Widgets
*   **Text Widget**: Displays the latest value from a subject. Supports JSONPath extraction and conditional coloring (thresholds).
*   **Chart Widget**: Real-time line, bar, pie, or gauge charts using ECharts.
*   **Stat Card**: Large KPI display with trend indicators (e.g., "↑ 5% vs last 10 messages") and sparklines.
*   **Gauge**: Circular meter with configurable color zones (Success/Warning/Error).

### Control Widgets
*   **Button**: Publishes a pre-configured payload to a subject when clicked. Supports custom colors.
*   **Switch**: Toggle control with two modes:
    *   *KV Mode*: Directly modifies a value in a KV bucket.
    *   *CORE Mode*: Publishes `on`/`off` payloads to a subject.
*   **Slider**: Range control for continuous values.
    *   *Sync*: Updates in real-time if the value changes remotely (Digital Twin).
    *   *Templates*: Configurable payload format (e.g., `{"brightness": {{value}}}`).

### Data Widgets
*   **KV Explorer**: View and watch values in a JetStream Key-Value bucket. Supports JSON formatting and syntax highlighting.

## Architecture

### Client-Side Architecture
This application follows a "thick client" approach. There is no intermediate API server. The browser establishes a WebSocket connection directly to NATS.

### Performance & Throttling
To handle high-throughput subjects (1000+ msgs/sec) without freezing the UI, the application implements a **Frame-Based Throttling** mechanism:
1.  **Ingest**: Incoming messages are pushed to a raw, non-reactive queue.
2.  **Batch**: A `requestAnimationFrame` loop flushes the queue once per frame (~16ms).
3.  **Render**: Vue updates the DOM in a single pass, ensuring smooth 60fps performance regardless of message volume.

### Subscription Multiplexing
The `SubscriptionManager` ensures efficient network usage. If 10 widgets listen to `sensors.temperature`, the dashboard creates only **one** NATS subscription and dispatches data internally to the 10 widgets.

## Keyboard Shortcuts

The dashboard supports single-key shortcuts for rapid navigation. Press `?` at any time to view the help menu.

| Key | Action |
| :--- | :--- |
| **S** | Save Dashboard |
| **N** | Add New Widget |
| **T** | Create New Dashboard |
| **B** | Toggle Sidebar |
| **Esc** | Close Modals / Exit Full Screen |
| **?** | Show Shortcuts Help |

## Configuration Guide

### JSONPath
Most widgets support JSONPath to extract specific data from complex JSON messages.

*   **Message**: `{"sensors": {"temp": 24.5, "id": "A1"}}`
*   **Path**: `$.sensors.temp`
*   **Result**: `24.5`

### Thresholds
Text and Stat widgets support conditional formatting rules. Rules are evaluated in order; the first match determines the color.
*   `> 80` → Red
*   `> 50` → Orange
*   `default` → Green

## Project Structure

```text
src/
├── components/
│   ├── common/          # Generic UI (Modals, Loading, Debug)
│   ├── dashboard/       # Grid layout, Sidebar, Config forms
│   └── widgets/         # Individual widget implementations
├── composables/         # Shared logic (NATS, Theme, Shortcuts)
├── stores/              # Pinia state management
│   ├── nats.ts          # Connection & Auth
│   ├── dashboard.ts     # Layout & Config persistence
│   └── widgetData.ts    # High-frequency data buffers
├── styles/              # CSS Variables & Design Tokens
└── types/               # TypeScript interfaces
```

## Troubleshooting

**"Cannot reach NATS server"**
*   Ensure your NATS server config has `websocket` enabled.
*   Check that you are using the correct protocol (`ws://` vs `wss://`).
*   If using `wss://` (Secure), ensure your browser trusts the certificate.

**"Authentication Failed"**
*   If using a `.creds` file, ensure it contains the JWT and Seed.
*   Check that the user has permissions to subscribe to the requested subjects.

**"High Memory Usage Warning"**
*   The dashboard automatically monitors memory pressure.
*   If message buffers grow too large (>10k messages), old data is automatically pruned to prevent browser crashes.

## License

MIT
