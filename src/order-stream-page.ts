export function renderOrderStreamPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0b0f14">
    <title>Live Activity · Neo Desk</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0f14; color: #e6edf3; --muted: #8d9aaa; --accent: #70d6bd; }
      * { box-sizing: border-box; }
      body { min-width: 320px; min-height: 100vh; margin: 0; background: radial-gradient(ellipse at 18% 0%, rgb(112 214 189 / 6%), transparent 34rem), #0b0f14; }
      .shell { max-width: 1440px; min-height: 100vh; margin: auto; padding: 24px 4vw; }
      header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; }
      .brand { display: inline-flex; gap: 12px; align-items: center; color: inherit; text-decoration: none; }
      .brand-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; background: var(--accent); color: #0d1715; font-size: 15px; font-weight: 850; }
      .brand-name { font-size: 14px; font-weight: 700; }
      .brand-caption { margin-top: 2px; color: var(--muted); font-size: 10px; letter-spacing: .13em; text-transform: uppercase; }
      nav { display: flex; flex-wrap: wrap; gap: 16px; }
      nav a { color: #aab6c3; font-size: 12px; text-decoration: none; }
      nav a:hover { color: var(--accent); }
      main { padding: clamp(36px, 7vh, 68px) 0 24px; }
      h1 { margin: 0; font-size: clamp(28px, 5vw, 42px); letter-spacing: -.04em; }
      h2 { margin: 0 0 14px; font-size: 17px; }
      .intro { margin: 8px 0 18px; color: var(--muted); font-size: 12px; }
      .status { min-height: 22px; margin: 0 0 16px; color: var(--muted); font-size: 12px; }
      .status[data-state="connected"] { color: #9ce0cb; }
      .status[data-state="error"] { color: #f0a3a3; }
      .panel { margin-top: 16px; padding: 18px; border: 1px solid #26313d; border-radius: 14px; background: linear-gradient(145deg, #131a22, #10161d 80%); box-shadow: 0 18px 48px rgb(0 0 0 / 18%); }
      .table-wrap { overflow: auto; border: 1px solid #293541; border-radius: 10px; background: #0d131a; }
      table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
      th, td { padding: 11px 14px; border-bottom: 1px solid #222d38; text-align: left; }
      th { position: sticky; top: 0; background: #171f27; color: #9baaba; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
      td { color: #d7e0e9; font-variant-numeric: tabular-nums; }
      tbody tr:last-child td { border-bottom: 0; }
      .empty { padding: 24px 12px; color: var(--muted); text-align: center; }
      [hidden] { display: none !important; }
      @media (max-width: 600px) { .shell { padding: 18px 14px; } .panel { padding: 12px; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <a class="brand" href="/" aria-label="Neo Desk home">
          <span class="brand-mark" aria-hidden="true">N.</span>
          <span><span class="brand-name">Neo Desk</span><br><span class="brand-caption">Trading API</span></span>
        </a>
        <nav aria-label="Main navigation"><a href="/option-chain">NIFTY option chain</a><a href="/orders">Orders</a><a href="/margin">Margin calculator</a><a href="/">Sign in</a></nav>
      </header>
      <main>
        <h1>Live activity</h1>
        <p class="intro">Real-time order lifecycle and position updates from Kotak Neo.</p>
        <p class="status" id="stream-status" data-state="connecting" role="status" aria-live="polite">Checking your Kotak Neo session…</p>
        <section class="panel" aria-label="Live order updates">
          <h2>Order updates</h2>
          <div class="table-wrap">
            <table><thead><tr><th>Order ID</th><th>Symbol</th><th>Side</th><th>Quantity</th><th>Filled</th><th>Average price</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody id="order-updates"><tr><td class="empty" colspan="8">Waiting for order updates…</td></tr></tbody>
            </table>
          </div>
        </section>
        <section class="panel" aria-label="Live position updates">
          <h2>Position updates</h2>
          <div class="table-wrap">
            <table><thead><tr><th>Account</th><th>Symbol</th><th>Exchange</th><th>Product</th><th>Buy qty</th><th>Sell qty</th><th>Buy amount</th><th>Sell amount</th><th>Updated</th></tr></thead>
              <tbody id="position-updates"><tr><td class="empty" colspan="9">Waiting for position updates…</td></tr></tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
    <script>
      const statusLabel = document.querySelector("#stream-status");
      const orderBody = document.querySelector("#order-updates");
      const positionBody = document.querySelector("#position-updates");
      const orderUpdates = new Map();
      const positionUpdates = new Map();
      const seenOrderEvents = new Set();
      let eventSource;

      function value(record, key, fallback = "—") {
        const item = record[key];
        return item === undefined || item === null || item === "" ? fallback : String(item);
      }

      function drawRows(body, records, fields, emptyMessage) {
        body.replaceChildren();
        if (records.length === 0) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.className = "empty";
          cell.colSpan = fields.length;
          cell.textContent = emptyMessage;
          row.append(cell);
          body.append(row);
          return;
        }
        for (const record of records) {
          const row = document.createElement("tr");
          for (const field of fields) {
            const cell = document.createElement("td");
            cell.textContent = value(record, field);
            row.append(cell);
          }
          body.append(row);
        }
      }

      function handleOrder(data) {
        const orderNumber = value(data, "nOrdNo", "");
        if (!orderNumber) return;
        const receivedAt = value(data, "updRecvTm", "");
        if (receivedAt) {
          const eventKey = orderNumber + ":" + receivedAt;
          if (seenOrderEvents.has(eventKey)) return;
          seenOrderEvents.add(eventKey);
          if (seenOrderEvents.size > 2000) {
            const oldest = seenOrderEvents.values().next().value;
            if (oldest) seenOrderEvents.delete(oldest);
          }
        }
        const previous = orderUpdates.get(orderNumber) || {};
        orderUpdates.set(orderNumber, { ...previous, ...data });
        drawRows(
          orderBody,
          [...orderUpdates.values()],
          ["nOrdNo", "trdSym", "trnsTp", "qty", "fldQty", "avgPrc", "ordSt", "ordDtTm"],
          "Waiting for order updates…",
        );
      }

      function handlePosition(data) {
        const key = [
          value(data, "actId", ""),
          value(data, "sym", ""),
          value(data, "exSeg", ""),
          value(data, "prod", ""),
        ].join("|");
        if (key === "|||") return;
        const previous = positionUpdates.get(key) || {};
        positionUpdates.set(key, { ...previous, ...data });
        drawRows(
          positionBody,
          [...positionUpdates.values()],
          ["actId", "sym", "exSeg", "prod", "flBuyQty", "flSellQty", "buyAmt", "sellAmt", "hsUpTm"],
          "Waiting for position updates…",
        );
      }

      async function connect() {
        try {
          const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error("Could not check the Kotak Neo session.");
          const session = await response.json();
          if (session.authenticated !== true) {
            statusLabel.textContent = "Sign in to Kotak Neo before opening the live activity stream.";
            statusLabel.dataset.state = "error";
            return;
          }
          eventSource = new EventSource("/api/orders/stream");
          eventSource.addEventListener("connection", (event) => {
            const message = JSON.parse(event.data);
            statusLabel.textContent = message.state === "connected"
              ? "Connected · receiving live updates"
              : message.state === "reconnecting" ? "Reconnecting to Kotak Neo…" : "Connecting to Kotak Neo…";
            statusLabel.dataset.state = message.state === "connected" ? "connected" : "connecting";
          });
          eventSource.addEventListener("order", (event) => handleOrder(JSON.parse(event.data)));
          eventSource.addEventListener("position", (event) => handlePosition(JSON.parse(event.data)));
          eventSource.addEventListener("stream-error", (event) => {
            const message = JSON.parse(event.data);
            statusLabel.textContent = message.error || "Kotak Neo stream reported an error.";
            statusLabel.dataset.state = "error";
          });
          eventSource.onerror = () => {
            statusLabel.textContent = "Connection interrupted; reconnecting…";
            statusLabel.dataset.state = "connecting";
          };
        } catch (error) {
          statusLabel.textContent = error instanceof Error ? error.message : "Could not open live activity.";
          statusLabel.dataset.state = "error";
        }
      }

      window.addEventListener("beforeunload", () => eventSource?.close());
      void connect();
    </script>
  </body>
</html>`;
}
