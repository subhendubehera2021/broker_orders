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
      h1 { margin: 0 0 20px; font-size: clamp(32px, 5vw, 48px); font-weight: 600; letter-spacing: -.055em; }
      .panel { padding: 18px; border: 1px solid #30342c; border-radius: 14px; background: linear-gradient(145deg, #1a1d18, #151713 80%); }
      .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
      .feed-status { color: var(--muted); font-size: 12px; }
      label { color: #d7dad1; font-size: 11px; font-weight: 600; }
      select, button { height: 40px; padding: 0 12px; border: 1px solid #383d33; border-radius: 7px; background: #11130f; color: #e5e9dd; font: inherit; font-size: 12px; }
      select { min-width: 170px; }
      button { background: #22261f; cursor: pointer; }
      button:hover:not(:disabled) { border-color: #9cbe57; color: var(--green); }
      button:disabled, select:disabled { cursor: default; opacity: .5; }
      .status { min-height: 20px; margin: 14px 0; color: #a9aea3; font-size: 13px; }
      .status[data-kind="error"] { color: #f3a5a0; }
      .status a { color: var(--green); }
      .table-wrap { max-height: 72vh; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
      table { width: 100%; min-width: 600px; table-layout: fixed; border-collapse: collapse; font-size: 14px; white-space: nowrap; }
      th, td { overflow: hidden; padding: 13px 12px; border-bottom: 1px solid var(--line); text-align: right; text-overflow: ellipsis; }
      th { position: sticky; top: 0; z-index: 1; background: #20231d; color: #aeb5a2; font-size: 12px; font-weight: 700; }
      th:first-child, td:first-child { text-align: center; }
      th.strike-head { color: var(--green); }
      td { color: #d7dad1; }
      tr:last-child td { border-bottom: 0; }
      .call-head { color: #9fc2ff; }
      .put-head { color: #e6a5ff; }
      td.instrument-cell { text-align: left; }
      .instrument-content { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; }
      .instrument-name { overflow: hidden; text-overflow: ellipsis; }
      .buy-button { flex: 0 0 auto; height: 28px; padding: 0 11px; border: 1px solid #a1c653; background: #303b20; color: var(--green); font-size: 11px; font-weight: 800; opacity: 0; transition: opacity .12s ease; }
      tr:hover .buy-button { opacity: .6; }
      .buy-button:disabled { cursor: not-allowed; opacity: 0; }
      tr:hover .buy-button:disabled { opacity: .6; }
      tr.spot-row td { padding: 12px; border-top: 1px solid #829d48; border-bottom: 1px solid #829d48; background: #242a1c; }
      td.spot-label { color: #b6c496; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      td.spot-label { text-align: left; }
      td.spot-price { color: var(--green); font-size: 16px; font-variant-numeric: tabular-nums; font-weight: 800; text-align: center; }
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
        <h1>NIFTY option chain</h1>
        <section class="panel" aria-label="NIFTY option chain">
          <div class="controls">
            <label for="expiry">Expiry</label>
            <select id="expiry" disabled><option value="">Loading expiries…</option></select>
            <button id="refresh-price" type="button">Reconnect</button>
            <span class="feed-status" id="price-status" role="status" aria-live="polite">Sign in for live price</span>
          </div>
          <p class="status" id="status" role="status" aria-live="polite">Loading local NIFTY expiries…</p>
          <div class="table-wrap" id="table-wrap" hidden>
            <table>
              <colgroup>
                <col style="width:40%"><col style="width:20%"><col style="width:40%">
              </colgroup>
              <thead><tr>
                <th class="call-head">CALLS</th>
                <th class="strike-head">STRIKE</th>
                <th class="put-head">PUTS</th>
              </tr><tr>
                <th>Instrument</th><th class="strike-head">Price</th><th>Instrument</th>
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
      const priceStatus = document.querySelector("#price-status");
      const refreshPriceButton = document.querySelector("#refresh-price");
      const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
      let expiryValues = [];
      let marketFeed;
      let liveSpotPrice;
      let loadedContracts = [];
      let displayedStrikesKey = "";

      function setStatus(text, kind = "") {
        status.textContent = text;
        status.dataset.kind = kind;
      }

      function makeCell(row, value) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }

      function makeInstrumentCell(row, contract) {
        const cell = document.createElement("td");
        cell.className = "instrument-cell";
        const content = document.createElement("span");
        content.className = "instrument-content";
        const name = document.createElement("span");
        name.className = "instrument-name";
        name.textContent = contract?.tradingSymbol ?? "—";
        content.append(name);
        if (contract) {
          const button = document.createElement("button");
          button.className = "buy-button";
          button.type = "button";
          button.disabled = true;
          button.textContent = "BUY";
          button.title = "Order placement is not enabled";
          button.setAttribute("aria-label", "Buy " + contract.tradingSymbol + " (not enabled)");
          content.append(button);
        }
        cell.append(content);
        row.append(cell);
      }

      function connectNiftyPriceStream() {
        marketFeed?.close();
        priceStatus.textContent = "Connecting…";
        const source = new EventSource("/api/market/nifty/stream");
        marketFeed = source;
        source.onopen = () => {
          priceStatus.textContent = "Connected";
        };
        source.addEventListener("price", (event) => {
          if (!(event instanceof MessageEvent)) return;
          try {
            const tick = JSON.parse(event.data);
            if (!Number.isFinite(tick.price) || tick.price <= 0) {
              throw new Error("Kotak returned an invalid NIFTY price");
            }
            liveSpotPrice = tick.price;
            const niftyPrice = document.querySelector("#nifty-spot-price");
            if (niftyPrice) niftyPrice.textContent = "₹" + numberFormat.format(tick.price);
            priceStatus.textContent = "Live";
            renderChain();
          } catch {
            priceStatus.textContent = "Received an invalid NIFTY price update";
          }
        });
        source.addEventListener("market-error", (event) => {
          if (!(event instanceof MessageEvent)) return;
          try {
            const data = JSON.parse(event.data);
            priceStatus.textContent = data.error || "Feed disconnected";
          } catch {
            priceStatus.textContent = "Feed disconnected";
          }
        });
        source.onerror = () => {
          priceStatus.textContent = "Reconnecting…";
          void fetch("/api/auth/session", { headers: { Accept: "application/json" } })
            .then((response) => response.json())
            .then((data) => {
              if (data.authenticated !== true) {
                source.close();
                priceStatus.textContent = "Sign in for live price";
              }
            })
            .catch(() => {
              priceStatus.textContent = "Could not verify the Kotak Neo session";
            });
        };
      }

      function renderChain() {
        if (liveSpotPrice === undefined) {
          tableWrap.hidden = true;
          if (loadedContracts.length > 0) {
            setStatus("Waiting for live price…");
          }
          return;
        }

        const strikes = new Map();
        for (const contract of loadedContracts) {
          const pair = strikes.get(contract.strike) ?? {};
          pair[contract.optionType] = contract;
          strikes.set(contract.strike, pair);
        }
        const pairedStrikes = [...strikes.entries()]
          .filter(([, pair]) => pair.CE && pair.PE)
          .map(([strike]) => strike);
        const belowStrikes = pairedStrikes
          .filter((strike) => strike < liveSpotPrice)
          .sort((left, right) => right - left)
          .slice(0, 3);
        const aboveStrikes = pairedStrikes
          .filter((strike) => strike > liveSpotPrice)
          .sort((left, right) => left - right)
          .slice(0, 3);
        const sorted = [...belowStrikes, ...aboveStrikes].sort((left, right) => right - left);
        const strikesKey = sorted.join(",") || "none";
        if (strikesKey === displayedStrikesKey) return;
        displayedStrikesKey = strikesKey;

        tableBody.replaceChildren();
        const spotRow = document.createElement("tr");
        spotRow.className = "spot-row";
        const spotLabel = document.createElement("td");
        spotLabel.className = "spot-label";
        spotLabel.textContent = "NIFTY 50";
        const spotPrice = document.createElement("td");
        spotPrice.className = "spot-price";
        spotPrice.id = "nifty-spot-price";
        spotPrice.setAttribute("aria-label", "Live NIFTY 50 spot price");
        spotPrice.textContent = "₹" + numberFormat.format(liveSpotPrice);
        spotRow.append(spotLabel, spotPrice, document.createElement("td"));

        for (const [index, strike] of sorted.entries()) {
          if (index === aboveStrikes.length) tableBody.append(spotRow);
          const pair = strikes.get(strike);
          const row = document.createElement("tr");
          const call = pair.CE;
          const put = pair.PE;
          makeInstrumentCell(row, call);
          makeCell(row, numberFormat.format(strike));
          makeInstrumentCell(row, put);
          tableBody.append(row);
        }
        if (sorted.length === 0) tableBody.prepend(spotRow);
        else if (aboveStrikes.length >= sorted.length) tableBody.append(spotRow);
        if (sorted.length === 0) {
          tableWrap.hidden = true;
          setStatus("No nearby contracts for this expiry.", "error");
          return;
        }
        tableWrap.hidden = false;
        setStatus(sorted.length + " strikes around NIFTY");
      }

      async function loadChain() {
        const expiry = expirySelect.value;
        if (!expiry) return;
        expirySelect.disabled = true;
        tableWrap.hidden = true;
        displayedStrikesKey = "";
        loadedContracts = [];
        setStatus("Loading local option contracts…");
        try {
          const response = await fetch("/api/options/nifty/chain?expiry=" + encodeURIComponent(expiry), {
            headers: { Accept: "application/json" },
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not load the option chain.");
          loadedContracts = data.contracts;
          renderChain();
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
            priceStatus.textContent = "Sign in for live price";
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
