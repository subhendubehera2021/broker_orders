export const marketPriceDashboardStyles = `
      .market-price-panel { min-width: 0; align-self: start; }
      .market-price-header { padding: 25px 24px 18px; }
      .market-price-header h2 { margin: 0; font-size: 21px; font-weight: 650; letter-spacing: -.035em; }
      .market-price-description { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
      .market-price-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: 0 24px 18px; }
      .market-price-form label { grid-column: 1 / -1; margin: 0; }
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
      .market-price-example { grid-column: 1 / -1; margin: -4px 0 0; color: #748198; font-size: 10px; }
      .market-price-submit { min-width: 100px; }
      .market-price-watchlist { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .market-price-watchlist th { padding: 0 12px 10px; color: #748198; font-size: 9px; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: .08em; }
      .market-price-watchlist th:first-child, .market-price-watchlist td:first-child { padding-left: 24px; }
      .market-price-watchlist th:last-child, .market-price-watchlist td:last-child { padding-right: 24px; text-align: right; }
      .market-price-watchlist td { padding: 13px 12px; border-top: 1px solid var(--line); font-size: 11px; vertical-align: middle; }
      .market-price-instrument { display: block; overflow: hidden; color: #e8edf7; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .market-price-token { display: block; overflow: hidden; margin-top: 4px; color: #748198; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
      .market-price-row-value { color: #e8edf7; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .market-price-row-value[data-direction="up"] { color: var(--connected); }
      .market-price-row-value[data-direction="down"] { color: #ff9a9a; }
      .market-price-row-change { display: block; margin-top: 4px; color: var(--muted); font-size: 9px; font-variant-numeric: tabular-nums; }
      .market-price-row-change[data-direction="up"] { color: var(--connected); }
      .market-price-row-change[data-direction="down"] { color: #ff9a9a; }
      .market-price-row-state { color: var(--muted); font-size: 9px; text-transform: capitalize; }
      .market-price-row-state[data-state="live"] { color: var(--connected); }
      .market-price-remove { min-height: 30px; padding: 0 9px; border-color: var(--line); color: #b7c3d5; background: transparent; font-size: 10px; }
      .market-price-remove:hover:not(:disabled) { border-color: rgba(255, 154, 154, .4); color: #ff9a9a; }
      .market-price-remove:disabled, button:disabled { cursor: wait; opacity: .55; }
      .market-price-empty { padding: 20px 24px; color: #748198; font-size: 11px; text-align: center; }
      .market-price-message { min-height: 18px; margin: 0 24px 18px; color: #b7c5d8; font-size: 11px; }
      .market-price-message[data-error="true"] { color: #ff9a9a; }
      @media (max-width: 560px) {
        .market-price-form { grid-template-columns: 1fr; }
        .market-price-submit { width: 100%; }
        .market-price-watchlist th, .market-price-watchlist td { padding-right: 7px; padding-left: 7px; }
        .market-price-watchlist th:first-child, .market-price-watchlist td:first-child { padding-left: 14px; }
        .market-price-watchlist th:last-child, .market-price-watchlist td:last-child { padding-right: 14px; }
        .market-price-remove { padding: 0 6px; }
      }
`;

export const marketPricePanelMarkup = `
        <aside class="panel market-price-panel" aria-labelledby="market-price-title">
          <header class="market-price-header">
            <p class="eyebrow">Market data</p>
            <h2 id="market-price-title">Live stock prices</h2>
            <p class="market-price-description">Watch subscribed instruments and their live prices. Nifty 50 remains subscribed by default.</p>
          </header>
          <form class="market-price-form" id="market-price-form">
            <label for="market-instrument">Add an instrument</label>
            <input class="market-price-input" id="market-instrument" type="text" autocomplete="off" spellcheck="false" placeholder="nse_cm|1333" required>
            <button class="primary market-price-submit" type="submit">Add</button>
            <p class="market-price-example">Format: exchange|instrument, e.g. nse_fo|45402</p>
          </form>
          <table class="market-price-watchlist">
            <thead>
              <tr><th scope="col">Instrument</th><th scope="col">Live price</th><th scope="col">State</th><th scope="col">Action</th></tr>
            </thead>
            <tbody id="market-price-rows">
              <tr><td class="market-price-empty" colspan="4">Enter the Worker control token to load subscribed instruments.</td></tr>
            </tbody>
          </table>
          <p class="market-price-message" id="market-price-message" role="status" aria-live="polite"></p>
        </aside>
`;

export const marketPriceDashboardScript = String.raw`
(() => {
  const form = document.querySelector("#market-price-form");
  const instrumentInput = document.querySelector("#market-instrument");
  const controlTokenInput = document.querySelector("#token");
  const rowsOutput = document.querySelector("#market-price-rows");
  const messageOutput = document.querySelector("#market-price-message");
  const submitButton = form.querySelector("button[type=submit]");
  const instruments = new Map();
  const removedInstruments = new Set();
  const rowsByToken = new Map();
  let emptyRow = null;
  let streamController = null;
  let activeToken = "";

  function setMessage(message = "", isError = false) {
    messageOutput.textContent = message;
    messageOutput.dataset.error = isError ? "true" : "false";
  }

  function createRow(instrument) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const name = document.createElement("span");
    name.className = "market-price-instrument";
    const token = document.createElement("span");
    token.className = "market-price-token";
    nameCell.append(name, token);

    const priceCell = document.createElement("td");
    const value = document.createElement("span");
    value.className = "market-price-row-value";
    const changeLabel = document.createElement("span");
    changeLabel.className = "market-price-row-change";
    priceCell.append(value, changeLabel);

    const stateCell = document.createElement("td");
    const state = document.createElement("span");
    state.className = "market-price-row-state";
    stateCell.append(state);

    const actionCell = document.createElement("td");
    let remove = null;
    if (instrument.isDefault) {
      actionCell.textContent = "Default";
      actionCell.className = "market-price-token";
    } else {
      remove = document.createElement("button");
      remove.className = "market-price-remove";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Unsubscribe " + (instrument.symbol || instrument.inputToken));
      remove.addEventListener("click", () => void removeInstrument(instrument.inputToken, remove));
      actionCell.append(remove);
    }

    row.append(nameCell, priceCell, stateCell, actionCell);
    return { element: row, name, token, value, changeLabel, state, remove };
  }

  function updateRow(instrument, row) {
    row.name.textContent = instrument.symbol || instrument.instrument;
    row.token.textContent = instrument.inputToken;
    const tick = instrument.price;
    if (tick && Number.isFinite(Number(tick.ltp))) {
      const precision = Number.isInteger(tick.precision)
        ? Math.max(0, Math.min(tick.precision, 8))
        : 2;
      row.value.textContent = Number(tick.ltp).toFixed(precision);
      const change = Number(tick.change);
      row.value.dataset.direction = change > 0 ? "up" : change < 0 ? "down" : "";
      if (Number.isFinite(change)) {
        const percent = Number(tick.changePercent);
        row.changeLabel.textContent =
          (change > 0 ? "+" : "") + change.toFixed(precision) +
          (Number.isFinite(percent)
            ? " (" + (percent > 0 ? "+" : "") + percent.toFixed(2) + "%)"
            : "");
        row.changeLabel.dataset.direction = change > 0 ? "up" : change < 0 ? "down" : "";
      } else {
        row.changeLabel.textContent = "Live";
        row.changeLabel.dataset.direction = "";
      }
    } else {
      row.value.textContent = "--";
      row.value.dataset.direction = "";
      row.changeLabel.textContent = "";
      row.changeLabel.dataset.direction = "";
    }
    row.state.textContent = tick ? "Live" : instrument.state || "connecting";
    row.state.dataset.state = tick ? "live" : String(instrument.state || "").toLowerCase();
    row.remove?.setAttribute(
      "aria-label",
      "Unsubscribe " + (instrument.symbol || instrument.inputToken),
    );
  }

  function renderRows() {
    const list = [...instruments.values()];
    if (!list.length) {
      rowsByToken.clear();
      if (!emptyRow) {
        emptyRow = document.createElement("tr");
        const cell = document.createElement("td");
        cell.className = "market-price-empty";
        cell.colSpan = 4;
        cell.textContent = "No subscribed instruments.";
        emptyRow.append(cell);
      }
      rowsOutput.replaceChildren(emptyRow);
      return;
    }
    emptyRow = null;

    for (const instrument of list) {
      let row = rowsByToken.get(instrument.inputToken);
      if (!row) {
        row = createRow(instrument);
        rowsByToken.set(instrument.inputToken, row);
      }
      updateRow(instrument, row);
      rowsOutput.append(row.element);
    }

    for (const [inputToken, row] of rowsByToken) {
      if (instruments.has(inputToken)) continue;
      row.element.remove();
      rowsByToken.delete(inputToken);
    }
  }

  async function requestJson(path, token, method = "GET") {
    const response = await fetch(path, {
      method,
      cache: "no-store",
      headers: { Authorization: "Bearer " + token }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "Market stream request failed: " + response.status);
    }
    return result;
  }

  function updateInstruments(items) {
    if (!Array.isArray(items)) return;
    instruments.clear();
    for (const item of items) {
      if (
        item &&
        typeof item.inputToken === "string" &&
        !removedInstruments.has(item.inputToken)
      ) {
        instruments.set(item.inputToken, item);
      }
    }
    renderRows();
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
      for (const item of instruments.values()) {
        if (!item.price) {
          item.state = data.state || "connecting";
          const row = rowsByToken.get(item.inputToken);
          if (row) updateRow(item, row);
        }
      }
      if (data.error) setMessage(data.error, true);
    }
    if (name === "instruments") updateInstruments(data);
    if (name === "price" && data?.inputToken) {
      if (removedInstruments.has(data.inputToken)) return;
      const item = instruments.get(data.inputToken) || {
        inputToken: data.inputToken,
        instrument: data.instrument,
        symbol: data.symbol,
        state: "live"
      };
      item.price = data;
      item.symbol = data.symbol || item.symbol;
      item.state = "live";
      instruments.set(data.inputToken, item);
      const row = rowsByToken.get(data.inputToken);
      if (row) updateRow(item, row);
      else renderRows();
    }
    if (name === "instrument-removed" && data?.inputToken) {
      removedInstruments.add(data.inputToken);
      instruments.delete(data.inputToken);
      renderRows();
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

  async function followPriceStream(token, signal) {
    let retryDelay = 1000;
    while (!signal.aborted) {
      try {
        const response = await fetch("/internal/market-price/events", {
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
        setMessage(error.message, true);
      }
      await delay(retryDelay, signal);
      retryDelay = Math.min(retryDelay * 2, 15000);
    }
  }

  async function startMonitor(token) {
    if (!token || activeToken === token && streamController) return;
    streamController?.abort();
    const controller = new AbortController();
    streamController = controller;
    activeToken = token;
    try {
      const result = await requestJson("/internal/market-price/instruments", token);
      if (controller.signal.aborted) return;
      updateInstruments(result.instruments);
      setMessage("");
      void followPriceStream(token, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessage(error.message, true);
      if (streamController === controller) {
        streamController = null;
        activeToken = "";
      }
    }
  }

  async function removeInstrument(inputToken, button) {
    const token = controlTokenInput.value.trim();
    button.disabled = true;
    try {
      const result = await requestJson(
        "/internal/market-price/unsubscribe?instrument=" + encodeURIComponent(inputToken),
        token,
        "POST"
      );
      if (
        !Array.isArray(result.instruments) ||
        result.instruments.some((instrument) => instrument.inputToken === inputToken)
      ) {
        throw new Error("The server still reports this instrument as subscribed.");
      }
      removedInstruments.add(inputToken);
      updateInstruments(result.instruments);
      setMessage("Unsubscribed " + inputToken + ".");
    } catch (error) {
      setMessage(error.message, true);
      button.disabled = false;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const inputToken = instrumentInput.value.trim();
    const token = controlTokenInput.value.trim();
    if (!token) {
      setMessage("Enter the Worker control token first.", true);
      return;
    }
    if (!/^[a-z0-9_]+\|[^|,]+$/i.test(inputToken)) {
      setMessage("Use Kotak format exchange|instrument.", true);
      return;
    }
    submitButton.disabled = true;
    try {
      const result = await requestJson(
        "/internal/market-price/subscribe?instrument=" + encodeURIComponent(inputToken),
        token,
        "POST"
      );
      removedInstruments.delete(inputToken);
      updateInstruments(result.instruments);
      instrumentInput.value = "";
      setMessage("Subscribed to " + inputToken + ".");
      await startMonitor(token);
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });

  controlTokenInput.addEventListener("change", () => {
    const token = controlTokenInput.value.trim();
    if (!token) {
      streamController?.abort();
      streamController = null;
      activeToken = "";
      return;
    }
    void startMonitor(token);
  });
  if (controlTokenInput.value.trim()) void startMonitor(controlTokenInput.value.trim());
})();
`;
