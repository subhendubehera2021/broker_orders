export function renderOrdersPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0b0f14">
    <title>Orders · Neo Desk</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0f14; color: #e6edf3; --muted: #8d9aaa; --line: #26313d; --accent: #70d6bd; }
      * { box-sizing: border-box; }
      body { min-width: 320px; min-height: 100vh; margin: 0; background: radial-gradient(ellipse at 18% 0%, rgb(112 214 189 / 6%), transparent 34rem), #0b0f14; }
      .shell { max-width: 1440px; min-height: 100vh; margin: auto; padding: 24px 4vw; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
      .brand { display: inline-flex; gap: 12px; align-items: center; color: inherit; text-decoration: none; }
      .brand-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; background: var(--accent); color: #0d1715; font-size: 15px; font-weight: 850; }
      .brand-name { font-size: 14px; font-weight: 700; }
      .brand-caption { margin-top: 2px; color: var(--muted); font-size: 10px; letter-spacing: .13em; text-transform: uppercase; }
      nav { display: flex; flex-wrap: wrap; gap: 16px; }
      nav a { color: #aab6c3; font-size: 12px; text-decoration: none; }
      nav a:hover { color: var(--accent); }
      main { padding: clamp(36px, 7vh, 68px) 0 24px; }
      .heading { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 20px; }
      h1 { margin: 0; font-size: clamp(28px, 5vw, 42px); letter-spacing: -.04em; }
      .intro { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
      button, input { min-height: 40px; padding: 0 12px; border: 1px solid #303d4b; border-radius: 7px; background: #0e141b; color: #e3eaf1; font: inherit; font-size: 12px; }
      button { cursor: pointer; }
      button:hover:not(:disabled), button[aria-pressed="true"] { border-color: #579887; color: var(--accent); }
      button:disabled { cursor: wait; opacity: .5; }
      input { width: min(100%, 300px); }
      .panel { padding: 18px; border: 1px solid #26313d; border-radius: 14px; background: linear-gradient(145deg, #131a22, #10161d 80%); box-shadow: 0 18px 48px rgb(0 0 0 / 18%); }
      .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px; }
      .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-right: auto; }
      .table-wrap { overflow: auto; border: 1px solid #293541; border-radius: 10px; background: #0d131a; }
      table { width: 100%; min-width: 980px; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
      th, td { padding: 12px 14px; border-bottom: 1px solid #222d38; text-align: left; }
      th { position: sticky; top: 0; background: #171f27; color: #9baaba; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
      td { color: #d7e0e9; font-variant-numeric: tabular-nums; }
      tbody tr:last-child td { border-bottom: 0; }
      .status { min-height: 22px; margin: 0 0 12px; color: var(--muted); font-size: 12px; }
      .status[data-kind="error"] { color: #f0a3a3; }
      .empty { padding: 30px 12px; color: var(--muted); text-align: center; }
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
        <nav aria-label="Main navigation"><a href="/option-chain">NIFTY option chain</a><a href="/margin">Margin calculator</a><a href="/">Sign in</a></nav>
      </header>
      <main>
        <div class="heading">
          <div><h1>Orders</h1><p class="intro">Order status from your authenticated Kotak Neo session.</p></div>
          <button type="button" id="refresh-orders">Refresh</button>
        </div>
        <section class="panel" aria-label="Kotak Neo orders">
          <p class="status" id="orders-status" role="status">Loading orders…</p>
          <div class="toolbar">
            <div class="tabs" role="group" aria-label="Filter orders">
              <button type="button" data-filter="all" aria-pressed="true">All <span data-count="all">0</span></button>
              <button type="button" data-filter="open" aria-pressed="false">Open <span data-count="open">0</span></button>
              <button type="button" data-filter="closed" aria-pressed="false">Closed <span data-count="closed">0</span></button>
            </div>
            <input id="order-search" type="search" placeholder="Search symbol, order ID, status…" aria-label="Search orders">
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Order ID</th><th>Symbol</th><th>Side</th><th>Quantity</th><th>Price</th><th>Type</th><th>Product</th><th>Status</th><th>Time</th><th>Reason</th></tr></thead>
              <tbody id="orders-body"><tr><td class="empty" colspan="10">Loading orders…</td></tr></tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
    <script>
      const statusLabel = document.querySelector("#orders-status");
      const tableBody = document.querySelector("#orders-body");
      const searchInput = document.querySelector("#order-search");
      let orders = [];
      let selectedFilter = "all";

      function value(order, keys) {
        for (const key of keys) {
          if (order[key] !== undefined && order[key] !== null && order[key] !== "") return String(order[key]);
        }
        return "—";
      }

      function findOrders(payload) {
        if (Array.isArray(payload)) return payload.filter((row) => row && typeof row === "object");
        if (!payload || typeof payload !== "object") return [];
        for (const key of ["data", "orders", "orderBook", "orderbook"]) {
          const result = findOrders(payload[key]);
          if (result.length) return result;
        }
        return [];
      }

      function orderState(order) {
        const status = value(order, ["ordSt", "orderStatus", "status", "stat"]).toLowerCase().replace(/[_-]+/g, " ").trim();
        if (["open", "pending", "trigger pending", "validation pending", "open pending", "partially filled", "partial"].includes(status)) return "open";
        if (["complete", "completed", "traded", "executed", "rejected", "cancelled", "canceled", "expired"].includes(status)) return "closed";
        return "other";
      }

      function setStatus(message, kind = "") {
        statusLabel.textContent = message;
        statusLabel.dataset.kind = kind;
      }

      function renderOrders() {
        const counts = {
          all: orders.length,
          open: orders.filter((order) => orderState(order) === "open").length,
          closed: orders.filter((order) => orderState(order) === "closed").length,
        };
        for (const key of Object.keys(counts)) {
          document.querySelector('[data-count="' + key + '"]').textContent = String(counts[key]);
        }
        const query = searchInput.value.trim().toLowerCase();
        const visible = orders.filter((order) => {
          const state = orderState(order);
          const matchesFilter = selectedFilter === "all" || state === selectedFilter;
          return matchesFilter && JSON.stringify(order).toLowerCase().includes(query);
        });
        tableBody.replaceChildren();
        if (!visible.length) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.className = "empty";
          cell.colSpan = 10;
          cell.textContent = orders.length ? "No orders match this filter." : "No orders returned.";
          row.append(cell);
          tableBody.append(row);
          return;
        }
        for (const order of visible) {
          const fields = [
            value(order, ["nOrdNo", "orderId", "order_id"]),
            value(order, ["trdSym", "tradingSymbol", "trading_symbol", "ts"]),
            value(order, ["trnsTp", "transactionType", "transaction_type", "tt"]),
            value(order, ["qty", "quantity", "qt"]),
            value(order, ["prc", "price", "pr"]),
            value(order, ["prcTp", "orderType", "order_type", "pt"]),
            value(order, ["prod", "product", "pc"]),
            value(order, ["ordSt", "orderStatus", "status", "stat"]),
            value(order, ["ordDtTm", "orderTime", "order_time", "exchOrdTm"]),
            value(order, ["rejRsn", "reason", "message"]),
          ];
          const row = document.createElement("tr");
          for (const field of fields) {
            const cell = document.createElement("td");
            cell.textContent = field;
            row.append(cell);
          }
          tableBody.append(row);
        }
      }

      async function loadOrders() {
        const refreshButton = document.querySelector("#refresh-orders");
        refreshButton.disabled = true;
        setStatus("Loading orders…");
        try {
          const response = await fetch("/api/orders", { headers: { Accept: "application/json" } });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Could not load orders.");
          orders = findOrders(payload);
          renderOrders();
          setStatus("Loaded " + orders.length + " order" + (orders.length === 1 ? "" : "s") + ".");
        } catch (error) {
          orders = [];
          renderOrders();
          setStatus(error instanceof Error ? error.message : "Could not load orders.", "error");
        } finally {
          refreshButton.disabled = false;
        }
      }

      document.querySelector("#refresh-orders").addEventListener("click", loadOrders);
      searchInput.addEventListener("input", renderOrders);
      for (const button of document.querySelectorAll("[data-filter]")) {
        button.addEventListener("click", () => {
          selectedFilter = button.dataset.filter;
          for (const tab of document.querySelectorAll("[data-filter]")) {
            tab.setAttribute("aria-pressed", String(tab === button));
          }
          renderOrders();
        });
      }
      loadOrders();
    </script>
  </body>
</html>`;
}
