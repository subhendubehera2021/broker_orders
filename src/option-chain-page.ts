export function renderOptionChainPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0b0f14">
    <title>NIFTY Option Chain · Neo Desk</title>
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
      .nav { display: flex; gap: 18px; align-items: center; }
      .nav a { color: #aab6c3; font-size: 12px; text-decoration: none; }
      .nav a:hover { color: var(--accent); }
      main { padding: clamp(36px, 7vh, 68px) 0 24px; }
      .panel { padding: 20px; border: 1px solid #26313d; border-radius: 14px; background: linear-gradient(145deg, #131a22, #10161d 80%); box-shadow: 0 18px 48px rgb(0 0 0 / 18%); }
      .controls { display: flex; min-height: 44px; flex-wrap: wrap; align-items: center; gap: 12px; }
      .feed-status { display: inline-flex; min-height: 32px; align-items: center; gap: 8px; padding: 0 11px; border: 1px solid #303d4b; border-radius: 999px; background: #0e141b; color: #9aa8b7; font-size: 11px; font-weight: 750; letter-spacing: .08em; }
      .feed-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: #8290a0; }
      .feed-status[data-state="connecting"] .feed-dot, .feed-status[data-state="reconnecting"] .feed-dot { background: #e6b65c; }
      .feed-status[data-state="live"] { border-color: #315e53; color: #9ce0cb; }
      .feed-status[data-state="live"] .feed-dot { background: #55d6a5; box-shadow: 0 0 0 3px rgb(85 214 165 / 14%); animation: live-pulse 1.8s ease-out infinite; }
      .feed-status[data-state="disconnected"] { border-color: #67434a; color: #f0a3a3; }
      .feed-status[data-state="disconnected"] .feed-dot { background: #e36d78; }
      @keyframes live-pulse { 50% { box-shadow: 0 0 0 5px rgb(85 214 165 / 4%); } }
      @media (prefers-reduced-motion: reduce) { .feed-status[data-state="live"] .feed-dot { animation: none; } }
      label { color: #a9b6c4; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      select, button { height: 40px; padding: 0 12px; border: 1px solid #303d4b; border-radius: 7px; background: #0e141b; color: #e3eaf1; font: inherit; font-size: 12px; }
      select { min-width: 170px; }
      button { background: #1a2530; cursor: pointer; }
      button:hover:not(:disabled) { border-color: #579887; color: var(--accent); }
      button:disabled, select:disabled { cursor: default; opacity: .5; }
      select:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .status { min-height: 18px; margin: 14px 0 12px; color: #a0adba; font-size: 11px; letter-spacing: .04em; }
      .status[data-kind="error"] { color: #f0a3a3; }
      .status a { color: var(--accent); }
      .table-wrap { max-height: 72vh; overflow: auto; border: 1px solid #293541; border-radius: 10px; background: #0d131a; }
      table { width: 100%; min-width: 760px; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 13px; white-space: nowrap; }
      th, td { overflow: hidden; padding: 13px 16px; border-right: 1px solid #242e38; border-bottom: 1px solid #222d38; text-overflow: ellipsis; }
      th:last-child, td:last-child { border-right: 0; }
      th { position: sticky; z-index: 1; color: #9baaba; font-size: 10px; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
      .group-head th { top: 0; height: 36px; background: #171f27; }
      .column-head th { top: 36px; height: 38px; background: #111820; color: #aab7c5; font-size: 10px; }
      th.call-subhead { background: #172126; }
      th.put-subhead { background: #11191d; }
      th.instrument-head { text-align: left; }
      th.price-head { text-align: right; }
      th.strike-head { color: var(--accent); text-align: center; }
      td { color: #d7e0e9; font-variant-numeric: tabular-nums; }
      tbody tr.option-row { height: 54px; transition: background .12s ease; }
      tbody tr.option-row:hover td { filter: brightness(1.16); }
      tbody tr:not(.spot-row):last-child td { border-bottom: 0; }
      th.call-head { color: #a9ddd0 !important; text-align: center; }
      th.put-head { color: #b6c2ce !important; text-align: center; }
      td.call-instrument, td.call-price { background: #171f24; }
      td.put-price, td.put-instrument { background: #12191e; }
      td.call-instrument, td.put-instrument { position: relative; }
      td.call-price, td.strike-cell, td.put-price { font-size: 15px; font-weight: 650; }
      td.call-price { color: #e2e9ed; text-align: right; }
      td.strike-cell { background: #0d1217; color: #f0f3f6; font-size: 16px; font-weight: 750; text-align: center; }
      td.put-price { color: #e2e9ed; text-align: left; }
      td.put-instrument { text-align: right; }
      .instrument-name { display: block; overflow: hidden; color: #cbd6df; font-size: 11px; font-weight: 550; text-overflow: ellipsis; }
      .buy-button { position: absolute; top: 50%; right: 8px; height: 26px; padding: 0 10px; transform: translateY(-50%); border: 1px solid #416b60; border-radius: 6px; background: #1b302a; color: #9ce0cb; font-size: 10px; font-weight: 800; letter-spacing: .06em; opacity: 0; pointer-events: none; transition: opacity .12s ease; }
      tr:hover .buy-button { opacity: .9; }
      .buy-button:disabled { cursor: default; opacity: 0; }
      tr:hover .buy-button:disabled { opacity: .9; }
      tr.spot-row td { height: 58px; padding: 0; border-top: 1px solid #168dd0; border-bottom: 1px solid #168dd0; background: #101419; }
      .spot-marker { position: relative; display: flex; min-height: 58px; align-items: center; justify-content: center; }
      .spot-marker::before { position: absolute; right: 0; left: 0; height: 1px; background: #168dd0; content: ""; }
      .spot-pill { position: relative; z-index: 1; display: flex; min-height: 44px; align-items: center; justify-content: center; gap: 10px; padding: 0 28px; border: 1px solid #168dd0; border-radius: 999px; background: #11171d; box-shadow: 0 0 20px rgb(22 141 208 / 12%); }
      .spot-label { color: #39aef0; font-size: 13px; font-weight: 650; }
      .spot-price { color: #39aef0; font-size: 15px; font-variant-numeric: tabular-nums; font-weight: 750; }
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
        <section class="panel" aria-label="NIFTY option chain">
          <div class="controls">
            <label for="expiry">Expiry</label>
            <select id="expiry" disabled><option value="">Loading expiries…</option></select>
            <button id="refresh-price" type="button">Reconnect</button>
            <span class="feed-status" id="price-status" data-state="idle" role="status" aria-live="polite"><span class="feed-dot" aria-hidden="true"></span><span class="feed-label">Sign in for live price</span></span>
          </div>
          <p class="status" id="status" role="status" aria-live="polite">Loading local NIFTY expiries…</p>
          <div class="table-wrap" id="table-wrap" hidden>
            <table>
              <colgroup>
                <col style="width:23%"><col style="width:17%"><col style="width:20%"><col style="width:17%"><col style="width:23%">
              </colgroup>
              <thead><tr class="group-head">
                <th class="call-head" colspan="2">CALLS</th>
                <th class="strike-head">STRIKE</th>
                <th class="put-head" colspan="2">PUTS</th>
              </tr><tr class="column-head">
                <th class="call-subhead instrument-head">Instrument</th>
                <th class="call-subhead price-head">LTP</th>
                <th class="strike-head">Strike</th>
                <th class="put-subhead price-head">LTP</th>
                <th class="put-subhead instrument-head">Instrument</th>
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
      const optionPrices = new Map();

      function setStatus(text, kind = "") {
        status.textContent = text;
        status.dataset.kind = kind;
      }

      function setFeedStatus(state, text) {
        priceStatus.dataset.state = state;
        priceStatus.querySelector(".feed-label").textContent = text;
      }

      function makeInstrumentCell(row, contract, side) {
        const cell = document.createElement("td");
        cell.className = side + "-instrument";
        const name = document.createElement("span");
        name.className = "instrument-name";
        name.textContent = contract?.tradingSymbol ?? "—";
        cell.append(name);
        if (contract) {
          const button = document.createElement("button");
          button.className = "buy-button";
          button.type = "button";
          button.disabled = true;
          button.textContent = "BUY";
          button.title = "Order placement is not enabled";
          button.setAttribute("aria-label", "Buy " + contract.tradingSymbol + " (not enabled)");
          cell.append(button);
        }
        row.append(cell);
      }

      function makePriceCell(row, contract, side) {
        const cell = document.createElement("td");
        cell.className = side + "-price";
        const price = document.createElement("span");
        price.className = "option-price";
        price.dataset.symbol = contract.tradingSymbol;
        price.textContent = optionPrices.has(contract.tradingSymbol)
          ? "₹" + numberFormat.format(optionPrices.get(contract.tradingSymbol))
          : "—";
        cell.append(price);
        row.append(cell);
      }

      function connectNiftyPriceStream(expiry) {
        marketFeed?.close();
        setFeedStatus("connecting", "Connecting");
        const source = new EventSource(
          "/api/market/nifty/stream?expiry=" + encodeURIComponent(expiry),
        );
        marketFeed = source;
        source.onopen = () => setFeedStatus("connecting", "Connecting");
        source.addEventListener("feed-connected", () => setFeedStatus("live", "Live"));
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
            setFeedStatus("live", "Live");
            renderChain();
          } catch {
            setFeedStatus("disconnected", "Invalid index update");
          }
        });
        source.addEventListener("option-price", (event) => {
          if (!(event instanceof MessageEvent)) return;
          try {
            const tick = JSON.parse(event.data);
            if (
              typeof tick.tradingSymbol !== "string" ||
              !Number.isFinite(tick.price) ||
              tick.price <= 0
            ) {
              throw new Error("Kotak returned an invalid option price");
            }
            optionPrices.set(tick.tradingSymbol, tick.price);
            setFeedStatus("live", "Live");
            for (const price of document.querySelectorAll(".option-price")) {
              if (price.dataset.symbol === tick.tradingSymbol) {
                price.textContent = "LTP ₹" + numberFormat.format(tick.price);
              }
            }
          } catch {
            setFeedStatus("disconnected", "Invalid option update");
          }
        });
        source.addEventListener("market-error", (event) => {
          if (!(event instanceof MessageEvent)) return;
          try {
            const data = JSON.parse(event.data);
            setFeedStatus("disconnected", data.error || "Feed disconnected");
          } catch {
            setFeedStatus("disconnected", "Feed disconnected");
          }
        });
        source.onerror = () => {
          setFeedStatus("reconnecting", "Reconnecting");
          void fetch("/api/auth/session", { headers: { Accept: "application/json" } })
            .then((response) => response.json())
            .then((data) => {
              if (data.authenticated !== true) {
                source.close();
                setFeedStatus("idle", "Sign in for live price");
              }
            })
            .catch(() => {
              setFeedStatus("disconnected", "Session check failed");
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
        const selectedSymbols = new Set(
          sorted.flatMap((strike) => [
            strikes.get(strike).CE.tradingSymbol,
            strikes.get(strike).PE.tradingSymbol,
          ]),
        );
        for (const symbol of optionPrices.keys()) {
          if (!selectedSymbols.has(symbol)) optionPrices.delete(symbol);
        }
        const strikesKey = sorted.join(",") || "none";
        if (strikesKey === displayedStrikesKey) return;
        displayedStrikesKey = strikesKey;

        tableBody.replaceChildren();
        const spotRow = document.createElement("tr");
        spotRow.className = "spot-row";
        const spotCell = document.createElement("td");
        spotCell.colSpan = 5;
        const spotMarker = document.createElement("div");
        spotMarker.className = "spot-marker";
        const spotPill = document.createElement("div");
        spotPill.className = "spot-pill";
        const spotLabel = document.createElement("span");
        spotLabel.className = "spot-label";
        spotLabel.textContent = "Spot price";
        const spotPrice = document.createElement("span");
        spotPrice.className = "spot-price";
        spotPrice.id = "nifty-spot-price";
        spotPrice.setAttribute("aria-label", "Live NIFTY 50 spot price");
        spotPrice.textContent = "₹" + numberFormat.format(liveSpotPrice);
        spotPill.append(spotLabel, spotPrice);
        spotMarker.append(spotPill);
        spotCell.append(spotMarker);
        spotRow.append(spotCell);

        for (const [index, strike] of sorted.entries()) {
          if (index === aboveStrikes.length) tableBody.append(spotRow);
          const pair = strikes.get(strike);
          const row = document.createElement("tr");
          row.className = "option-row";
          const call = pair.CE;
          const put = pair.PE;
          makeInstrumentCell(row, call, "call");
          makePriceCell(row, call, "call");
          const strikeCell = document.createElement("td");
          strikeCell.className = "strike-cell";
          strikeCell.textContent = numberFormat.format(strike);
          row.append(strikeCell);
          makePriceCell(row, put, "put");
          makeInstrumentCell(row, put, "put");
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
        optionPrices.clear();
        marketFeed?.close();
        setStatus("Loading local option contracts…");
        try {
          const response = await fetch("/api/options/nifty/chain?expiry=" + encodeURIComponent(expiry), {
            headers: { Accept: "application/json" },
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not load the option chain.");
          loadedContracts = data.contracts;
          renderChain();
          await initializeLivePrice(expiry);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not load the option chain.", "error");
        } finally {
          expirySelect.disabled = false;
        }
      }

      async function initialize() {
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

      async function initializeLivePrice(expiry = expirySelect.value) {
        if (!expiry) return;
        try {
          const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error("Could not check your Kotak Neo session.");
          const session = await response.json();
          if (session.authenticated !== true) {
            setFeedStatus("idle", "Sign in for live price");
            return;
          }
          connectNiftyPriceStream(expiry);
        } catch (error) {
          setFeedStatus("disconnected", error instanceof Error ? error.message : "Could not load live NIFTY price.");
        }
      }

      expirySelect.addEventListener("change", loadChain);
      refreshPriceButton.addEventListener("click", () => {
        void initializeLivePrice(expirySelect.value);
      });
      initialize();
    </script>
  </body>
</html>`;
}
