import {
  marketPriceDashboardScript,
  marketPriceDashboardStyles,
  marketPricePanelMarkup,
} from "./market-price/market-price-dashboard.js";

export const orderWebSocketDashboard = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <title>Kotak Order Stream</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #e8edf7;
        background: #080e18;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        --muted: #8290a5;
        --line: rgba(165, 187, 217, .12);
        --panel: rgba(17, 26, 40, .9);
        --accent: #f28c28;
        --accent-hover: #ffa94d;
        --connected: #65d6a5;
      }

      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        min-height: 100dvh;
        margin: 0;
        padding: 28px 18px;
        display: grid;
        place-items: center;
        background:
          radial-gradient(ellipse at 50% 0%, rgba(52, 104, 151, .2), transparent 54%),
          radial-gradient(ellipse at 100% 100%, rgba(242, 140, 40, .09), transparent 42%),
          #080e18;
      }

      .dashboard { width: min(100%, 1500px); }
      .dashboard-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.8fr) minmax(330px, .8fr);
        align-items: start;
        gap: 18px;
      }
      .order-panel { min-width: 0; }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0 0 22px 2px;
        color: #b7c3d5;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .13em;
        text-transform: uppercase;
      }
      .brand-mark {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(242, 140, 40, .3);
        border-radius: 9px;
        color: var(--accent);
        background: rgba(242, 140, 40, .09);
        font-size: 12px;
        letter-spacing: -.05em;
      }

      .panel {
        overflow: hidden;
        border: 1px solid rgba(160, 181, 210, .16);
        border-radius: 18px;
        background: linear-gradient(145deg, rgba(20, 31, 47, .98), var(--panel));
        box-shadow: 0 24px 80px rgba(0, 0, 0, .38), inset 0 1px rgba(255, 255, 255, .035);
      }
      .panel-header { padding: 25px 26px 19px; }
      .eyebrow {
        margin: 0 0 8px;
        color: var(--accent);
        font-size: 10px;
        font-weight: 750;
        letter-spacing: .15em;
        text-transform: uppercase;
      }
      h1 { margin: 0; font-size: 24px; font-weight: 650; letter-spacing: -.04em; }
      .description { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }

      .connection {
        margin: 0 14px;
        padding: 17px 16px;
        border: 1px solid var(--line);
        border-radius: 13px;
        background: rgba(7, 13, 22, .44);
      }
      .connection-top { display: flex; align-items: center; gap: 12px; }
      .indicator {
        position: relative;
        width: 11px;
        height: 11px;
        flex: 0 0 11px;
        border-radius: 50%;
        background: #758298;
      }
      .indicator::after {
        position: absolute;
        inset: -5px;
        border: 1px solid transparent;
        border-radius: inherit;
        content: "";
      }
      .indicator[data-state="connected"] { background: var(--connected); box-shadow: 0 0 15px rgba(101, 214, 165, .5); }
      .indicator[data-state="connected"]::after { border-color: rgba(101, 214, 165, .35); animation: pulse 2s ease-out infinite; }
      .indicator[data-state="connecting"], .indicator[data-state="reconnecting"] { background: var(--accent-hover); animation: blink 1.1s ease-in-out infinite; }
      .indicator[data-state="disconnected"], .indicator[data-state="unknown"] { background: #768398; }
      .state-copy { min-width: 0; }
      .state-label { margin-bottom: 3px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      #state { font-size: 15px; font-weight: 650; text-transform: capitalize; }
      .live-label {
        margin-left: auto;
        padding: 5px 8px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: #aab8ca;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .08em;
      }

      .metrics {
        display: grid;
        grid-template-columns: .8fr .9fr 1.5fr;
        gap: 10px;
        margin: 15px 14px 0;
      }
      .metric {
        min-width: 0;
        padding: 12px 11px;
        border: 1px solid var(--line);
        border-radius: 11px;
        background: rgba(7, 13, 22, .3);
      }
      .metric-label { display: block; margin-bottom: 6px; color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
      .metric-value { display: block; overflow: hidden; color: #dce5f2; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }

      .controls { padding: 23px 26px 25px; }
      label { display: block; margin-bottom: 8px; color: #b8c5d7; font-size: 11px; font-weight: 650; }
      .token-input {
        width: 100%;
        height: 42px;
        padding: 0 12px;
        border: 1px solid rgba(160, 181, 210, .19);
        border-radius: 9px;
        outline: none;
        color: #e8edf7;
        background: rgba(5, 10, 17, .55);
        font: inherit;
        font-size: 13px;
        transition: border-color .18s ease, box-shadow .18s ease;
      }
      .token-input::placeholder { color: #647187; }
      .token-input:focus { border-color: rgba(242, 140, 40, .75); box-shadow: 0 0 0 3px rgba(242, 140, 40, .12); }
      .actions { display: flex; gap: 9px; margin-top: 13px; }
      button {
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 14px;
        border: 1px solid transparent;
        border-radius: 9px;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: transform .16s ease, background .16s ease, border-color .16s ease;
      }
      button:hover:not(:disabled) { transform: translateY(-1px); }
      button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
      button:disabled { cursor: wait; opacity: .7; }
      .primary { flex: 1; color: #211306; background: var(--accent); }
      .primary:hover:not(:disabled) { background: var(--accent-hover); }
      .secondary { color: #d5deeb; border-color: var(--line); background: rgba(255, 255, 255, .035); }
      .secondary:hover:not(:disabled) { background: rgba(255, 255, 255, .08); }
      .button-spinner {
        width: 13px;
        height: 13px;
        display: none;
        border: 2px solid rgba(33, 19, 6, .25);
        border-top-color: #211306;
        border-radius: 50%;
        animation: spin .7s linear infinite;
      }
      .primary[aria-busy="true"] .button-spinner { display: inline-block; }
      .primary[aria-busy="true"] .button-icon { display: none; }
      #message { min-height: 18px; margin: 12px 0 0; color: #b7c5d8; font-size: 11px; }
      #message[data-error="true"] { color: #ff9a9a; }
      .footnote { margin: 0; padding: 0 26px 20px; color: #748198; font-size: 10px; }
      .stream { padding: 0 14px 18px; }
      .stream-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 2px 9px; }
      .stream-title { margin: 0; font-size: 12px; font-weight: 700; }
      .stream-status, .stream-count, .table-updated-at { color: var(--muted); font-size: 10px; }
      .message-tables { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
      .data-card { min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 11px; background: rgba(7, 13, 22, .3); }
      .data-card.table-updated { animation: table-flash 1s ease-out; }
      .data-card-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 12px; border-bottom: 1px solid var(--line); }
      .data-card-title { margin: 0; color: #dce5f2; font-size: 11px; font-weight: 700; }
      .data-table-scroll { max-height: 360px; overflow: auto; scrollbar-color: #3b4658 transparent; scrollbar-width: thin; }
      .data-table { width: max-content; min-width: 100%; border-collapse: collapse; }
      .data-table th { position: sticky; top: 0; z-index: 1; padding: 8px 10px; color: var(--muted); background: #111a28; font-size: 9px; font-weight: 700; letter-spacing: .09em; text-align: left; text-transform: uppercase; white-space: nowrap; }
      .data-table td { max-width: 240px; padding: 7px 10px; border-top: 1px solid rgba(165, 187, 217, .08); color: #c6d2e2; font-size: 10px; vertical-align: top; overflow-wrap: anywhere; }
      .data-table th:first-child { left: 0; z-index: 2; }
      .data-table td:first-child { position: sticky; left: 0; z-index: 1; color: #9eacc0; background: #111a28; font-weight: 650; white-space: nowrap; }
      .data-table tr.record-latest td { background: rgba(242, 140, 40, .12); }
      .data-table tr.record-latest td:first-child { background: rgba(242, 140, 40, .22); }
      .data-table tr.record-new td { animation: value-flash 1.1s ease-out; }
      .table-empty { padding: 18px 10px !important; color: var(--muted) !important; text-align: center; }
      @keyframes table-flash { 0% { border-color: rgba(242, 140, 40, .9); box-shadow: 0 0 0 3px rgba(242, 140, 40, .15); } 100% { border-color: var(--line); box-shadow: none; } }
      @keyframes value-flash { 0% { background: rgba(242, 140, 40, .28); } 100% { background: transparent; } }

      @keyframes pulse { 0% { transform: scale(.65); opacity: .8; } 100% { transform: scale(1.7); opacity: 0; } }
      @keyframes blink { 50% { opacity: .38; } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (max-width: 480px) {
        body { padding: 18px 12px; }
        .panel-header, .controls { padding-right: 19px; padding-left: 19px; }
        .footnote { padding-right: 19px; padding-left: 19px; }
        .metrics { grid-template-columns: 1fr 1fr; }
        .metric:last-child { grid-column: 1 / -1; }
      }
      @media (max-width: 980px) {
        .dashboard-grid { grid-template-columns: minmax(0, 1fr); }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
      }
      ${marketPriceDashboardStyles}
    </style>
  </head>
  <body>
    <main class="dashboard">
      <div class="brand"><span class="brand-mark" aria-hidden="true">KO</span><span>Market operations</span></div>
      <div class="dashboard-grid">
      <section class="panel order-panel" aria-labelledby="page-title">
        <header class="panel-header">
          <p class="eyebrow">Real-time monitoring</p>
          <h1 id="page-title">Order stream</h1>
          <p class="description">Manage and monitor your Kotak order and position connection.</p>
        </header>
        <section class="connection" aria-label="Connection status">
          <div class="connection-top">
            <span class="indicator" id="indicator" data-state="unknown" aria-hidden="true"></span>
            <div class="state-copy">
              <div class="state-label">Broker connection</div>
              <div id="state" aria-live="polite">Unknown</div>
            </div>
            <span class="live-label">KOTAK NEO</span>
          </div>
        </section>
        <section class="metrics" aria-label="Stream details">
          <div class="metric"><span class="metric-label">Authenticated</span><span class="metric-value" id="authenticated">Unknown</span></div>
          <div class="metric"><span class="metric-label">Last event</span><span class="metric-value" id="last-type">None</span></div>
          <div class="metric"><span class="metric-label">Received</span><span class="metric-value" id="last-message">No events yet</span></div>
        </section>
        <section class="controls" aria-label="Connection controls">
          <label for="token">Worker control token</label>
          <input class="token-input" id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Enter your control token">
          <div class="actions">
            <button class="primary" id="connect" type="button" aria-busy="false">
              <svg class="button-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8h9m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span class="button-spinner" aria-hidden="true"></span>
              <span>Connect</span>
            </button>
            <button class="secondary" id="refresh" type="button">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 5.5V2.8m0 2.7h-2.7M13 5.5A5.5 5.5 0 1 0 13.3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>Refresh status</span>
            </button>
          </div>
          <p id="message" role="status" aria-live="polite"></p>
        </section>
        <section class="stream" aria-labelledby="stream-title">
          <div class="stream-heading">
            <h2 class="stream-title" id="stream-title">Live stream tables</h2>
            <span class="stream-status" id="stream-status">Offline</span>
            <span class="stream-count" id="event-count">0 frames</span>
          </div>
          <div class="message-tables">
            <section class="data-card" id="order-card" aria-labelledby="order-table-title">
              <header class="data-card-header">
                <h3 class="data-card-title" id="order-table-title">Order update</h3>
                <time class="table-updated-at" id="order-updated-at">Waiting for order data</time>
              </header>
              <div class="data-table-scroll">
                <table class="data-table" aria-label="Latest order update fields">
                  <thead id="order-table-head"><tr><th scope="col">Received</th></tr></thead>
                  <tbody id="order-table-body"><tr><td class="table-empty" colspan="1">No order updates yet</td></tr></tbody>
                </table>
              </div>
            </section>
            <section class="data-card" id="connection-card" aria-labelledby="connection-table-title">
              <header class="data-card-header">
                <h3 class="data-card-title" id="connection-table-title">Connection acknowledgement</h3>
                <time class="table-updated-at" id="connection-updated-at">Waiting for acknowledgement</time>
              </header>
              <div class="data-table-scroll">
                <table class="data-table" aria-label="Latest connection acknowledgement fields">
                  <thead id="connection-table-head"><tr><th scope="col">Received</th></tr></thead>
                  <tbody id="connection-table-body"><tr><td class="table-empty" colspan="1">No acknowledgement yet</td></tr></tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
        <p class="footnote">Each order or connection message appears as one row. New rows highlight briefly. Refresh status makes a one-time request. Your token stays in this tab and is not saved.</p>
      </section>
      ${marketPricePanelMarkup}
      </div>
    </main>
    <script>
      const tokenInput = document.querySelector("#token");
      const stateOutput = document.querySelector("#state");
      const indicator = document.querySelector("#indicator");
      const messageOutput = document.querySelector("#message");
      const connectButton = document.querySelector("#connect");
      const eventCount = document.querySelector("#event-count");
      const streamStatus = document.querySelector("#stream-status");
      const seenEventIds = new Set();
      const eventIdOrder = [];
      let receivedFrameCount = 0;
      let streamController = null;
      let streamToken = null;
      const tables = {
        order: {
          head: document.querySelector("#order-table-head"),
          body: document.querySelector("#order-table-body"),
          card: document.querySelector("#order-card"),
          updatedAt: document.querySelector("#order-updated-at"),
          columns: [],
          records: []
        },
        connection: {
          head: document.querySelector("#connection-table-head"),
          body: document.querySelector("#connection-table-body"),
          card: document.querySelector("#connection-card"),
          updatedAt: document.querySelector("#connection-updated-at"),
          columns: [],
          records: []
        }
      };

      async function request(path, method = "GET") {
        const token = tokenInput.value.trim();
        if (!token) throw new Error("Enter the Worker control token first.");
        const response = await fetch(path, {
          method,
          headers: { Authorization: "Bearer " + token }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Request failed: " + response.status);
        return result;
      }

      function formatTimestamp(value) {
        if (!value) return "No events yet";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
      }

      function renderStatus(status) {
        const state = status.state || "unknown";
        stateOutput.textContent = state;
        stateOutput.dataset.state = state;
        indicator.dataset.state = state;
        document.querySelector("#authenticated").textContent = status.authenticated ? "Yes" : "No";
        document.querySelector("#last-type").textContent = status.lastMessageType || "None";
        document.querySelector("#last-message").textContent = formatTimestamp(status.lastMessageAt);
      }

      function renderStreamEvent(event) {
        const eventId = event.id || event.receivedAt + ":" + event.type;
        if (seenEventIds.has(eventId)) return;
        seenEventIds.add(eventId);
        eventIdOrder.push(eventId);
        if (eventIdOrder.length > 100) seenEventIds.delete(eventIdOrder.shift());
        receivedFrameCount += 1;
        eventCount.textContent = receivedFrameCount + (receivedFrameCount === 1 ? " frame" : " frames");

        let frame;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!frame || typeof frame !== "object" || Array.isArray(frame)) return;

        if (event.type === "order" && frame.data && typeof frame.data === "object" && !Array.isArray(frame.data)) {
          appendRecord(tables.order, frame.data, event.receivedAt, eventId);
        } else if (event.type === "cn") {
          appendRecord(tables.connection, frame, event.receivedAt, eventId);
        }
      }

      function displayValue(value) {
        if (value === null) return "null";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
      }

      function appendRecord(table, values, receivedAt, eventId) {
        for (const field of Object.keys(values)) {
          if (!table.columns.includes(field)) table.columns.push(field);
        }
        table.records.unshift({ eventId, receivedAt, values });
        if (table.records.length > 50) table.records.pop();

        const header = document.createElement("tr");
        const timeHeader = document.createElement("th");
        timeHeader.scope = "col";
        timeHeader.textContent = "Received";
        header.append(timeHeader);
        for (const field of table.columns) {
          const cell = document.createElement("th");
          cell.scope = "col";
          cell.textContent = field;
          header.append(cell);
        }
        table.head.replaceChildren(header);

        const fragment = document.createDocumentFragment();
        table.records.forEach((record, index) => {
          const row = document.createElement("tr");
          row.className = index === 0 ? "record-latest" : "";
          if (record.eventId === eventId) row.classList.add("record-new");
          const time = document.createElement("td");
          time.textContent = formatTimestamp(record.receivedAt);
          row.append(time);
          for (const field of table.columns) {
            const cell = document.createElement("td");
            cell.textContent = Object.prototype.hasOwnProperty.call(record.values, field)
              ? displayValue(record.values[field])
              : "";
            row.append(cell);
          }
          fragment.append(row);
        });
        table.body.replaceChildren(fragment);
        table.updatedAt.dateTime = receivedAt || "";
        table.updatedAt.textContent = formatTimestamp(receivedAt);
        table.card.classList.remove("table-updated");
        void table.card.offsetWidth;
        table.card.classList.add("table-updated");
      }

      function dispatchSseFrame(frame) {
        let name = "message";
        const dataLines = [];
        for (const line of frame.split(/\\r?\\n/)) {
          if (!line || line.startsWith(":")) continue;
          const separator = line.indexOf(":");
          const field = separator < 0 ? line : line.slice(0, separator);
          let value = separator < 0 ? "" : line.slice(separator + 1);
          if (value.startsWith(" ")) value = value.slice(1);
          if (field === "event") name = value;
          if (field === "data") dataLines.push(value);
        }
        if (!dataLines.length) return;
        let data;
        try {
          data = JSON.parse(dataLines.join("\\n"));
        } catch {
          return;
        }
        if (name === "status") renderStatus(data);
        if (name === "stream") renderStreamEvent(data);
      }

      async function readEventStream(body, signal) {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (!signal.aborted) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            let boundary = buffer.indexOf("\\n\\n");
            while (boundary !== -1) {
              dispatchSseFrame(buffer.slice(0, boundary));
              buffer = buffer.slice(boundary + 2);
              boundary = buffer.indexOf("\\n\\n");
            }
            if (done) break;
          }
        } finally {
          reader.releaseLock();
        }
      }

      function retryDelay(milliseconds, signal) {
        return new Promise((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", finish);
            resolve();
          };
          const timer = setTimeout(finish, milliseconds);
          signal.addEventListener("abort", finish, { once: true });
        });
      }

      async function runEventStream(token, signal) {
        let delay = 1000;
        while (!signal.aborted) {
          try {
            const response = await fetch("/internal/order-stream/events", {
              headers: { Authorization: "Bearer " + token },
              signal
            });
            if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.error || "Live stream request failed: " + response.status);
            }
            if (!response.body) throw new Error("Streaming response is unavailable.");
            streamStatus.textContent = "Live";
            messageOutput.textContent = "";
            messageOutput.dataset.error = "false";
            await readEventStream(response.body, signal);
            if (!signal.aborted) throw new Error("Live stream ended.");
          } catch (error) {
            if (signal.aborted) return;
            streamStatus.textContent = "Reconnecting";
            messageOutput.textContent = "Live updates reconnecting: " + error.message;
            messageOutput.dataset.error = "false";
          }
          await retryDelay(delay, signal);
          delay = Math.min(delay * 2, 15000);
        }
      }

      function startEventStream() {
        const token = tokenInput.value.trim();
        if (!token) throw new Error("Enter the Worker control token first.");
        if (streamController && streamToken === token) return;
        streamController?.abort();
        const controller = new AbortController();
        streamController = controller;
        streamToken = token;
        streamStatus.textContent = "Connecting";
        void runEventStream(token, controller.signal).finally(() => {
          if (streamController !== controller) return;
          streamController = null;
          streamToken = null;
          streamStatus.textContent = "Offline";
        });
      }

      async function checkStatus() {
        renderStatus(await request("/internal/order-stream/status"));
        messageOutput.textContent = "";
        messageOutput.dataset.error = "false";
      }

      function showError(error) {
        messageOutput.textContent = error.message;
        messageOutput.dataset.error = "true";
        stateOutput.textContent = "Status unavailable";
        stateOutput.dataset.state = "unknown";
        indicator.dataset.state = "unknown";
      }

      connectButton.addEventListener("click", async () => {
        connectButton.disabled = true;
        connectButton.setAttribute("aria-busy", "true");
        messageOutput.textContent = "Requesting connection...";
        messageOutput.dataset.error = "false";
        try {
          await request("/internal/order-stream/start", "POST");
          startEventStream();
          messageOutput.textContent = "Connection requested. Waiting for live updates.";
        } catch (error) {
          showError(error);
        } finally {
          connectButton.disabled = false;
          connectButton.setAttribute("aria-busy", "false");
        }
      });

      document.querySelector("#refresh").addEventListener("click", async () => {
        try {
          await checkStatus();
          startEventStream();
        } catch (error) {
          showError(error);
        }
      });

      tokenInput.addEventListener("change", () => {
        if (streamToken && streamToken !== tokenInput.value.trim()) {
          streamController?.abort();
          streamStatus.textContent = "Offline";
        }
      });

    </script>
    <script>${marketPriceDashboardScript}</script>
  </body>
</html>`;
