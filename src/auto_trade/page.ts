export function renderAutoTradePage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0b0f14">
    <title>Liquidity swings · Neo Desk</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0f14; color: #e6edf3; --muted: #8d9aaa; --line: #26313d; --accent: #70d6bd; }
      * { box-sizing: border-box; }
      body { min-width: 320px; min-height: 100vh; margin: 0; background: radial-gradient(ellipse at 18% 0%, rgb(112 214 189 / 6%), transparent 34rem), #0b0f14; }
      .shell { max-width: 1240px; min-height: 100vh; margin: auto; padding: 24px 4vw; }
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
      h2 { margin: 0; font-size: 17px; }
      .intro { margin: 8px 0 22px; color: var(--muted); font-size: 12px; }
      .panel { margin-top: 16px; padding: 20px; border: 1px solid #26313d; border-radius: 14px; background: linear-gradient(145deg, #131a22, #10161d 80%); box-shadow: 0 18px 48px rgb(0 0 0 / 18%); }
      .controls { display: grid; grid-template-columns: minmax(210px, 1.5fr) repeat(4, minmax(115px, 1fr)) auto; align-items: end; gap: 12px; }
      label { display: grid; gap: 7px; color: #a9b6c4; font-size: 10px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
      input, select, button { width: 100%; height: 42px; padding: 0 12px; border: 1px solid #303d4b; border-radius: 7px; background: #0e141b; color: #e3eaf1; font: inherit; font-size: 12px; }
      button { background: #1a302a; border-color: #416b60; color: #9ce0cb; cursor: pointer; font-weight: 750; }
      button:hover:not(:disabled) { border-color: #70d6bd; }
      button:disabled { cursor: wait; opacity: .5; }
      input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .hint, .status { color: var(--muted); font-size: 11px; }
      .hint { margin: 12px 0 0; }
      .status { min-height: 18px; margin: 0 0 14px; }
      .status[data-kind="error"] { color: #f0a3a3; }
      .results-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .count { color: var(--muted); font-size: 11px; }
      .table-wrap { overflow: auto; border: 1px solid #293541; border-radius: 10px; background: #0d131a; }
      table { width: 100%; min-width: 860px; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
      th, td { padding: 12px 14px; border-bottom: 1px solid #222d38; text-align: left; }
      th { position: sticky; top: 0; background: #171f27; color: #9baaba; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
      td { color: #d7e0e9; font-variant-numeric: tabular-nums; }
      tbody tr:last-child td { border-bottom: 0; }
      .side-high { color: #f0a3a3; }
      .side-low { color: #9ce0cb; }
      .state { color: #aab6c3; }
      .empty { padding: 30px 12px; color: var(--muted); text-align: center; }
      @media (max-width: 980px) { .controls { grid-template-columns: repeat(2, minmax(0, 1fr)); } .controls button { grid-column: 1 / -1; } }
      @media (max-width: 520px) { .shell { padding: 18px 14px; } .panel { padding: 14px; } .controls { grid-template-columns: 1fr; } .controls button { grid-column: auto; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <a class="brand" href="/" aria-label="Neo Desk home">
          <span class="brand-mark" aria-hidden="true">N.</span>
          <span><span class="brand-name">Neo Desk</span><br><span class="brand-caption">Trading API</span></span>
        </a>
        <nav aria-label="Main navigation"><a href="/option-chain">NIFTY option chain</a><a href="/orders">Orders</a><a href="/order-stream">Live activity</a><a href="/margin">Margin calculator</a></nav>
      </header>
      <main>
        <h1>Liquidity swings</h1>
        <p class="intro">Load historical Kotak Neo candles for an instrument and review confirmed swing levels.</p>
        <section class="panel" aria-label="Liquidity swing search">
          <form id="swing-form">
            <div class="controls">
              <label>Instrument<input id="instrument" name="instrument" value="NIFTY26N0925100PE" maxlength="64" required autocomplete="off"></label>
              <label>Interval<select id="interval" name="interval">
                <option value="1min" selected>1 minute</option><option value="3min">3 minutes</option><option value="5min">5 minutes</option>
                <option value="10min">10 minutes</option><option value="15min">15 minutes</option><option value="30min">30 minutes</option>
                <option value="60min">60 minutes</option><option value="D">Daily</option><option value="W">Weekly</option>
              </select></label>
              <label>Pivot lookback<select id="pivot-lookback" name="pivotLookback">
                <option value="3">3 candles</option><option value="5" selected>5 candles</option>
                <option value="10">10 candles</option><option value="14">14 candles</option>
                <option value="20">20 candles</option>
              </select></label>
              <label>Side<select id="swing-side" name="side">
                <option value="high" selected>Swing high</option>
                <option value="low">Swing low</option>
                <option value="both">Both</option>
              </select></label>
              <label>From<input id="from-date" name="fromdate" type="date" required></label>
              <label>To<input id="to-date" name="todate" type="date" required></label>
              <button id="analyze-button" type="submit">Find swings</button>
            </div>
            <p class="hint">Pivot lookback controls how many candles on each side confirm a swing. Historical data is limited by the selected Kotak interval.</p>
          </form>
        </section>
        <section class="panel" aria-label="Liquidity swing results">
          <div class="results-heading"><h2>Detected swings</h2><span class="count" id="result-count"></span></div>
          <p class="status" id="result-status" role="status" aria-live="polite">Enter an instrument and select a date range to analyze.</p>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Side</th><th>Pivot time</th><th>Level</th><th>Zone</th><th>Touches</th><th>Volume</th><th>Status</th></tr></thead>
              <tbody id="swing-results"><tr><td class="empty" colspan="7">No swing results yet.</td></tr></tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
    <script>
      const form = document.querySelector("#swing-form");
      const instrumentInput = document.querySelector("#instrument");
      const intervalInput = document.querySelector("#interval");
      const pivotLookbackInput = document.querySelector("#pivot-lookback");
      const swingSideInput = document.querySelector("#swing-side");
      const fromInput = document.querySelector("#from-date");
      const toInput = document.querySelector("#to-date");
      const statusLabel = document.querySelector("#result-status");
      const countLabel = document.querySelector("#result-count");
      const resultBody = document.querySelector("#swing-results");
      const submitButton = document.querySelector("#analyze-button");
      let allSwings = [];
      const maxDaysByInterval = { "1min": 30, "3min": 30, "5min": 30, "10min": 60, "15min": 60, "30min": 90, "60min": 90, D: 180, W: 180 };
      const priceFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
      const volumeFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

      function indiaToday() {
        const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
        const part = (type) => parts.find((item) => item.type === type).value;
        return part("year") + "-" + part("month") + "-" + part("day");
      }

      function dateBefore(date, days) {
        const value = new Date(date + "T00:00:00Z");
        value.setUTCDate(value.getUTCDate() - days);
        return value.toISOString().slice(0, 10);
      }

      function setStatus(message, kind = "") {
        statusLabel.textContent = message;
        statusLabel.dataset.kind = kind;
      }

      function setEmpty(message) {
        resultBody.replaceChildren();
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.className = "empty";
        cell.colSpan = 7;
        cell.textContent = message;
        row.append(cell);
        resultBody.append(row);
      }

      function formatTime(value) {
        const timestamp = new Date(value);
        return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      }

      function addCell(row, text, className = "") {
        const cell = document.createElement("td");
        cell.textContent = text;
        if (className) cell.className = className;
        row.append(cell);
      }

      function renderSwings() {
        const swings = allSwings.filter((swing) =>
          swingSideInput.value === "both" || swing.side === swingSideInput.value,
        );
        resultBody.replaceChildren();
        countLabel.textContent = swings.length + " swing" + (swings.length === 1 ? "" : "s");
        if (!swings.length) {
          setEmpty("No confirmed " + (swingSideInput.value === "both" ? "" : swingSideInput.value + " ") + "swings in this date range.");
          return;
        }
        for (const swing of swings) {
          const row = document.createElement("tr");
          addCell(row, swing.side === "high" ? "Swing high" : "Swing low", "side-" + swing.side);
          addCell(row, formatTime(swing.pivotTime));
          addCell(row, priceFormat.format(swing.level));
          addCell(row, priceFormat.format(swing.zoneBottom) + " – " + priceFormat.format(swing.zoneTop));
          addCell(row, String(swing.intersectionCount));
          addCell(row, volumeFormat.format(swing.intersectionVolume));
          addCell(row, swing.crossedAt ? "Broken" : swing.qualifiedAt ? "Qualified" : "Tracking", "state");
          resultBody.append(row);
        }
      }

      swingSideInput.addEventListener("change", renderSwings);

      function initializeDates() {
        const today = indiaToday();
        toInput.value = today;
        fromInput.value = dateBefore(today, 30);
      }

      intervalInput.addEventListener("change", () => {
        const maxDays = maxDaysByInterval[intervalInput.value];
        const range = (Date.parse(toInput.value + "T00:00:00Z") - Date.parse(fromInput.value + "T00:00:00Z")) / 86400000;
        if (range > maxDays) fromInput.value = dateBefore(toInput.value, maxDays);
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const range = (Date.parse(toInput.value + "T00:00:00Z") - Date.parse(fromInput.value + "T00:00:00Z")) / 86400000;
        if (range < 0 || range > maxDaysByInterval[intervalInput.value]) {
          setStatus("The selected dates exceed the maximum range for this interval.", "error");
          return;
        }
        submitButton.disabled = true;
        countLabel.textContent = "";
        setStatus("Loading historical candles and analyzing swings…");
        setEmpty("Loading swings…");
        const query = new URLSearchParams({ instrument: instrumentInput.value.trim(), interval: intervalInput.value, pivotLookback: pivotLookbackInput.value, fromdate: fromInput.value, todate: toInput.value });
        try {
          const response = await fetch("/api/auto-trade/liquidity-swings?" + query, { headers: { Accept: "application/json" } });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Could not load liquidity swings.");
          allSwings = payload.swings;
          renderSwings();
          setStatus(payload.candleCount + " candles analyzed for " + payload.instrument + " (" + payload.interval + ").");
        } catch (error) {
          setEmpty("No swing results available.");
          setStatus(error instanceof Error ? error.message : "Could not load liquidity swings.", "error");
        } finally {
          submitButton.disabled = false;
        }
      });

      initializeDates();
    </script>
  </body>
</html>`;
}
