export const marketPriceDashboardStyles = `
      .market-price-panel { min-width: 0; align-self: start; }
      .market-price-header { padding: 25px 24px 18px; }
      .market-price-header h2 { margin: 0; font-size: 21px; font-weight: 650; letter-spacing: -.035em; }
      .market-price-description { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
      .market-price-form { padding: 0 24px 18px; }
      .market-price-input {
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
      .market-price-input:focus { border-color: rgba(242, 140, 40, .75); box-shadow: 0 0 0 3px rgba(242, 140, 40, .12); }
      .market-price-example { margin: 7px 0 0; color: #748198; font-size: 10px; }
      .market-price-submit { width: 100%; margin-top: 12px; }
      .market-quote {
        margin: 0 14px 14px;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 13px;
        background: rgba(7, 13, 22, .44);
      }
      .market-quote-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .market-quote-symbol { overflow: hidden; color: #b7c3d5; font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .market-quote-state { flex: 0 0 auto; padding: 5px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
      .market-quote-state[data-state="live"] { color: var(--connected); border-color: rgba(101, 214, 165, .3); }
      .market-quote-state[data-state="error"] { color: #ff9a9a; border-color: rgba(255, 154, 154, .3); }
      .market-quote-price { display: block; margin-top: 14px; color: #f5f7fb; font-size: clamp(32px, 4vw, 46px); font-weight: 650; letter-spacing: -.05em; font-variant-numeric: tabular-nums; }
      .market-quote-price[data-direction="up"] { color: var(--connected); }
      .market-quote-price[data-direction="down"] { color: #ff9a9a; }
      .market-quote-change { display: block; min-height: 18px; margin-top: 5px; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
      .market-quote-change[data-direction="up"] { color: var(--connected); }
      .market-quote-change[data-direction="down"] { color: #ff9a9a; }
      .market-price-updated { margin: 14px 0 0; color: #748198; font-size: 10px; }
      .market-price-message { min-height: 18px; margin: 0 24px 18px; color: #b7c5d8; font-size: 11px; }
      .market-price-message[data-error="true"] { color: #ff9a9a; }
      @media (max-width: 980px) {
        .market-price-panel { width: min(100%, 720px); justify-self: center; }
      }
`;

export const marketPricePanelMarkup = `
        <aside class="panel market-price-panel" aria-labelledby="market-price-title">
          <header class="market-price-header">
            <p class="eyebrow">Market data</p>
            <h2 id="market-price-title">Live stock price</h2>
            <p class="market-price-description">Enter a Kotak instrument to subscribe to its live price feed.</p>
          </header>
          <form class="market-price-form" id="market-price-form">
            <label for="market-instrument">Instrument</label>
            <input class="market-price-input" id="market-instrument" type="text" autocomplete="off" spellcheck="false" value="nse_cm|Nifty 50" required>
            <p class="market-price-example">Format: exchange|instrument, e.g. nse_cm|1333</p>
            <button class="primary market-price-submit" type="submit">Watch live price</button>
          </form>
          <section class="market-quote" aria-label="Live quote" aria-live="polite">
            <div class="market-quote-top">
              <span class="market-quote-symbol" id="market-price-symbol">No instrument selected</span>
              <span class="market-quote-state" id="market-price-state" data-state="offline">Offline</span>
            </div>
            <strong class="market-quote-price" id="market-price-value">--</strong>
            <span class="market-quote-change" id="market-price-change" data-direction="">Waiting for price</span>
            <p class="market-price-updated" id="market-price-updated">No market tick received</p>
          </section>
          <p class="market-price-message" id="market-price-message" role="status" aria-live="polite"></p>
        </aside>
`;

export const marketPriceDashboardScript = String.raw`
(() => {
  const form = document.querySelector("#market-price-form");
  const instrumentInput = document.querySelector("#market-instrument");
  const controlTokenInput = document.querySelector("#token");
  const stateOutput = document.querySelector("#market-price-state");
  const symbolOutput = document.querySelector("#market-price-symbol");
  const priceOutput = document.querySelector("#market-price-value");
  const changeOutput = document.querySelector("#market-price-change");
  const updatedOutput = document.querySelector("#market-price-updated");
  const messageOutput = document.querySelector("#market-price-message");
  let streamController = null;
  let lastPrice = null;

  function setStatus(state, message = "") {
    stateOutput.textContent = state;
    stateOutput.dataset.state = state.toLowerCase();
    messageOutput.textContent = message;
    messageOutput.dataset.error = state.toLowerCase() === "error" ? "true" : "false";
  }

  function renderPrice(price) {
    const value = Number(price.ltp);
    if (!Number.isFinite(value)) return;
    const precision = Number.isInteger(price.precision)
      ? Math.max(0, Math.min(price.precision, 8))
      : 2;
    priceOutput.textContent = value.toFixed(precision);
    symbolOutput.textContent = price.symbol || price.inputToken || instrumentInput.value.trim();
    updatedOutput.textContent = "Updated " + new Date(price.receivedAt).toLocaleTimeString();

    const change = Number(price.change);
    const changePercent = Number(price.changePercent);
    if (Number.isFinite(change)) {
      const sign = change > 0 ? "+" : "";
      const percent = Number.isFinite(changePercent)
        ? " (" + (changePercent > 0 ? "+" : "") + changePercent.toFixed(2) + "%)"
        : "";
      changeOutput.textContent = sign + change.toFixed(precision) + percent;
      changeOutput.dataset.direction = change > 0 ? "up" : change < 0 ? "down" : "";
    } else {
      changeOutput.textContent = "Live market price";
      changeOutput.dataset.direction = "";
    }

    if (lastPrice !== null) {
      priceOutput.dataset.direction = value > lastPrice ? "up" : value < lastPrice ? "down" : "";
    }
    lastPrice = value;
  }

  function dispatchFrame(frame) {
    let name = "message";
    const lines = [];
    for (const line of frame.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator < 0 ? line : line.slice(0, separator);
      let value = separator < 0 ? "" : line.slice(separator + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") name = value;
      if (field === "data") lines.push(value);
    }
    if (!lines.length) return;
    let data;
    try {
      data = JSON.parse(lines.join("\n"));
    } catch {
      return;
    }
    if (name === "status") {
      setStatus(data.state || "connecting", data.error || data.message || "");
      if (data.symbol) symbolOutput.textContent = data.symbol;
    }
    if (name === "price") {
      renderPrice(data);
      setStatus("Live");
    }
  }

  async function readEvents(body, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          dispatchFrame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
  }

  function delay(milliseconds, signal) {
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

  async function followPriceStream(instrument, token, signal) {
    let retryDelay = 1000;
    const path = "/internal/market-price/events?instrument=" + encodeURIComponent(instrument);
    while (!signal.aborted) {
      try {
        const response = await fetch(path, {
          cache: "no-store",
          headers: { Authorization: "Bearer " + token },
          signal
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || "Market stream request failed: " + response.status);
        }
        if (!response.body) throw new Error("Market stream response is unavailable.");
        await readEvents(response.body, signal);
        if (!signal.aborted) throw new Error("Market stream ended.");
      } catch (error) {
        if (signal.aborted) return;
        setStatus("Reconnecting", error.message);
      }
      await delay(retryDelay, signal);
      retryDelay = Math.min(retryDelay * 2, 15000);
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const instrument = instrumentInput.value.trim();
    const token = controlTokenInput.value.trim();
    if (!token) {
      setStatus("Error", "Enter the Worker control token on the left first.");
      return;
    }
    if (!/^[a-z0-9_]+\|[^|,]+$/i.test(instrument)) {
      setStatus("Error", "Use Kotak format exchange|instrument.");
      return;
    }

    streamController?.abort();
    lastPrice = null;
    priceOutput.textContent = "--";
    changeOutput.textContent = "Waiting for price";
    changeOutput.dataset.direction = "";
    updatedOutput.textContent = "Waiting for market tick";
    symbolOutput.textContent = instrument;
    const controller = new AbortController();
    streamController = controller;
    setStatus("Connecting");
    void followPriceStream(instrument, token, controller.signal).finally(() => {
      if (streamController !== controller) return;
      streamController = null;
      setStatus("Offline");
    });
  });

  controlTokenInput.addEventListener("change", () => {
    if (!streamController) return;
    streamController.abort();
    streamController = null;
    setStatus("Offline");
  });
})();
`;
