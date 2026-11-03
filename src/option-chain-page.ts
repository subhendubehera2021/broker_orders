export function renderOptionChainPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#10120f">
    <title>NIFTY Option Chain · Neo Desk</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #10120f; color: #f3f4ee; --muted: #898e84; --line: #292d26; --green: #c8f169; }
      * { box-sizing: border-box; }
      body { min-width: 320px; min-height: 100vh; margin: 0; background: radial-gradient(ellipse at 18% 0%, rgb(200 241 105 / 8%), transparent 34rem), #10120f; }
      .shell { max-width: 1440px; min-height: 100vh; margin: auto; padding: 24px 4vw; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
      .brand { display: inline-flex; gap: 12px; align-items: center; color: inherit; text-decoration: none; }
      .brand-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; background: var(--green); color: #141810; font-size: 15px; font-weight: 850; }
      .brand-name { font-size: 14px; font-weight: 700; }
      .brand-caption { margin-top: 2px; color: var(--muted); font-size: 10px; letter-spacing: .13em; text-transform: uppercase; }
      .nav { display: flex; gap: 18px; align-items: center; }
      .nav a { color: #a9aea3; font-size: 12px; text-decoration: none; }
      .nav a:hover { color: var(--green); }
      main { padding: clamp(36px, 7vh, 68px) 0 24px; }
      .eyebrow { margin: 0 0 10px; color: var(--green); font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(32px, 5vw, 48px); font-weight: 600; letter-spacing: -.055em; }
      .intro { max-width: 680px; margin: 10px 0 26px; color: var(--muted); font-size: 13px; line-height: 1.7; }
      .panel { padding: 18px; border: 1px solid #30342c; border-radius: 14px; background: linear-gradient(145deg, #1a1d18, #151713 80%); }
      .market-card { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 18px; width: fit-content; min-width: 240px; margin-bottom: 16px; padding: 14px 18px; border: 1px solid #30342c; border-radius: 10px; background: #171a15; }
      .market-label { color: #aeb5a2; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
      .market-price { color: var(--green); font-size: 24px; font-variant-numeric: tabular-nums; font-weight: 650; }
      .market-meta { width: 100%; color: var(--muted); font-size: 10px; }
      .market-card button { margin-left: auto; }
      .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
      label { color: #d7dad1; font-size: 11px; font-weight: 600; }
      select, button { height: 40px; padding: 0 12px; border: 1px solid #383d33; border-radius: 7px; background: #11130f; color: #e5e9dd; font: inherit; font-size: 12px; }
      select { min-width: 170px; }
      button { background: #22261f; cursor: pointer; }
      button:hover:not(:disabled) { border-color: #9cbe57; color: var(--green); }
      button:disabled, select:disabled { cursor: default; opacity: .5; }
      .status { min-height: 20px; margin: 14px 0; color: #a9aea3; font-size: 12px; }
      .status[data-kind="error"] { color: #f3a5a0; }
      .status a { color: var(--green); }
      .table-wrap { max-height: 72vh; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
      table { width: 100%; min-width: 900px; border-collapse: collapse; font-size: 11px; white-space: nowrap; }
      th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: right; }
      th { position: sticky; top: 0; z-index: 1; background: #20231d; color: #aeb5a2; font-weight: 700; }
      th:first-child, td:first-child { text-align: center; }
      th.strike-head { color: var(--green); }
      td { color: #d7dad1; }
      tr:last-child td { border-bottom: 0; }
      .call-head { color: #9fc2ff; }
      .put-head { color: #e6a5ff; }
      [hidden] { display: none !important; }
      @media (max-width: 600px) { .shell { padding: 18px 14px; } .panel { padding: 12px; } .nav { gap: 12px; } .nav a { font-size: 11px; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <a class="brand" href="/" aria-label="Neo Desk home">
          <span class="brand-mark" aria-hidden="true">N.</span>
          <span><span class="brand-name">Neo Desk</span><br><span class="brand-caption">Trading API</span></span>
        </a>
        <nav class="nav" aria-label="Main navigation"><a href="/margin">Margin calculator</a><a href="/scrip-master">Scrip Master</a><a href="/">Sign in</a></nav>
      </header>
      <main>
        <p class="eyebrow">Local contract data · NSE F&amp;O</p>
        <h1>NIFTY option chain</h1>
        <p class="intro">The NIFTY index price is fetched live from Kotak Neo. Option contracts and expiries are read from the local NSE F&amp;O CSV; option prices are not loaded.</p>
        <section class="market-card" aria-label="Live NIFTY index price">
          <span class="market-label">NIFTY 50</span>
          <strong class="market-price" id="nifty-price" aria-live="polite">—</strong>
          <button id="refresh-price" type="button">Reconnect feed</button>
          <span class="market-meta" id="price-status" role="status" aria-live="polite">Sign in to connect to the live feed</span>
        </section>
        <section class="panel" aria-label="NIFTY option chain">
          <div class="controls">
            <label for="expiry">Expiry</label>
            <select id="expiry" disabled><option value="">Loading expiries…</option></select>
          </div>
          <p class="status" id="status" role="status" aria-live="polite">Loading local NIFTY expiries…</p>
          <div class="table-wrap" id="table-wrap" hidden>
            <table>
              <thead><tr>
                <th colspan="3" class="call-head">CALLS</th>
                <th class="strike-head">STRIKE</th>
                <th colspan="3" class="put-head">PUTS</th>
              </tr><tr>
                <th>Instrument</th><th>Token</th><th>Lot size</th><th class="strike-head">Price</th>
                <th>Lot size</th><th>Token</th><th>Instrument</th>
              </tr></thead>
              <tbody id="rows"></tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
    <script>
      const expirySelect = document.querySelector("#expiry");
      const status = document.querySelector("#status");
      const tableWrap = document.querySelector("#table-wrap");
      const tableBody = document.querySelector("#rows");
      const niftyPrice = document.querySelector("#nifty-price");
      const priceStatus = document.querySelector("#price-status");
      const refreshPriceButton = document.querySelector("#refresh-price");
      const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
      let expiryValues = [];
      let marketFeed;

      function setStatus(text, kind = "") {
        status.textContent = text;
        status.dataset.kind = kind;
      }

      function makeCell(row, value) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }

      function connectNiftyPriceStream() {
        marketFeed?.close();
        priceStatus.textContent = "Connecting to Kotak live feed…";
        const source = new EventSource("/api/market/nifty/stream");
        marketFeed = source;
        source.onopen = () => {
          priceStatus.textContent = "Connected · waiting for index tick…";
        };
        source.addEventListener("price", (event) => {
          if (!(event instanceof MessageEvent)) return;
          try {
            const tick = JSON.parse(event.data);
            niftyPrice.textContent = "₹" + numberFormat.format(tick.price);
            priceStatus.textContent = "Live · " + new Date(tick.asOf).toLocaleTimeString();
          } catch {
            priceStatus.textContent = "Received an invalid NIFTY price update";
          }
        });
        source.addEventListener("market-error", (event) => {
          if (!(event instanceof MessageEvent)) return;
          try {
            const data = JSON.parse(event.data);
            priceStatus.textContent = data.error || "Kotak live feed disconnected";
          } catch {
            priceStatus.textContent = "Kotak live feed disconnected";
          }
        });
        source.onerror = () => {
          priceStatus.textContent = "Live feed disconnected · reconnecting…";
          void fetch("/api/auth/session", { headers: { Accept: "application/json" } })
            .then((response) => response.json())
            .then((data) => {
              if (data.authenticated !== true) {
                source.close();
                priceStatus.textContent = "Sign in to Kotak Neo to connect to the live feed";
              }
            })
            .catch(() => {
              priceStatus.textContent = "Could not verify the Kotak Neo session";
            });
        };
      }

      function renderChain(data) {
        const strikes = new Map();
        for (const contract of data.contracts) {
          const pair = strikes.get(contract.strike) ?? {};
          pair[contract.optionType] = contract;
          strikes.set(contract.strike, pair);
        }
        const sorted = [...strikes.entries()].sort((left, right) => right[0] - left[0]);
        tableBody.replaceChildren();
        for (const [strike, pair] of sorted) {
          const row = document.createElement("tr");
          const call = pair.CE;
          const put = pair.PE;
          makeCell(row, call?.tradingSymbol ?? "—");
          makeCell(row, call?.instrumentToken ?? "—");
          makeCell(row, call?.lotSize || "—");
          makeCell(row, numberFormat.format(strike));
          makeCell(row, put?.lotSize || "—");
          makeCell(row, put?.instrumentToken ?? "—");
          makeCell(row, put?.tradingSymbol ?? "—");
          tableBody.append(row);
        }
        tableWrap.hidden = false;
        setStatus(sorted.length + " strikes · " + data.contracts.length + " contracts · local CSV data");
      }

      async function loadChain() {
        const expiry = expirySelect.value;
        if (!expiry) return;
        expirySelect.disabled = true;
        tableWrap.hidden = true;
        setStatus("Loading local option contracts…");
        try {
          const response = await fetch("/api/options/nifty/chain?expiry=" + encodeURIComponent(expiry), {
            headers: { Accept: "application/json" },
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not load the option chain.");
          renderChain(data);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not load the option chain.", "error");
        } finally {
          expirySelect.disabled = false;
        }
      }

      async function initialize() {
        void initializeLivePrice();
        try {
          const response = await fetch("/api/options/nifty/expiries", { headers: { Accept: "application/json" } });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not load option expiries.");
          expiryValues = data.expiries;
          expirySelect.replaceChildren();
          for (const expiry of expiryValues) {
            const option = document.createElement("option");
            option.value = expiry;
            option.textContent = expiry;
            expirySelect.append(option);
          }
          if (expiryValues.length === 0) throw new Error("No NIFTY option expiries were found in the Scrip Master.");
          expirySelect.disabled = false;
          await loadChain();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not initialize the option chain.", "error");
        }
      }

      async function initializeLivePrice() {
        try {
          const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error("Could not check your Kotak Neo session.");
          const session = await response.json();
          if (session.authenticated !== true) {
            priceStatus.textContent = "Sign in to Kotak Neo to connect to the live feed";
            return;
          }
          connectNiftyPriceStream();
        } catch (error) {
          priceStatus.textContent = error instanceof Error ? error.message : "Could not load live NIFTY price.";
        }
      }

      expirySelect.addEventListener("change", loadChain);
      refreshPriceButton.addEventListener("click", () => {
        void initializeLivePrice();
      });
      initialize();
    </script>
  </body>
</html>`;
}
