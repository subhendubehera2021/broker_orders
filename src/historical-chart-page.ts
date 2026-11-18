export function renderHistoricalChartPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#10120f">
    <title>Historical Candles · Neo Desk</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #10120f; color: #f3f4ee; --muted: #898e84; --line: #292d26; --green: #c8f169; --red: #f07878; }
      * { box-sizing: border-box; }
      body { min-width: 320px; height: 100vh; height: 100dvh; margin: 0; overflow: hidden; background: #10120f; }
      .shell { display: flex; width: 100%; height: 100%; flex-direction: column; padding: 8px; }
      main { display: flex; min-height: 0; flex: 1; flex-direction: column; }
      input, select, button { width: 100%; min-width: 0; height: 34px; padding: 0 9px; border: 1px solid #34382f; border-radius: 5px; background: #11130f; color: #f3f4ee; font: inherit; font-size: 11px; }
      input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
      button { min-width: 108px; border: 0; background: var(--green); color: #171b11; cursor: pointer; font-weight: 750; }
      button:disabled { cursor: wait; opacity: .65; }
      .message:not([data-kind="error"]) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
      .message { min-height: 0; margin: 4px 8px; color: var(--muted); font-size: 10px; }
      .message[data-kind="error"] { color: #f3a5a0; }
      .message[data-kind="loading"], .message[data-kind="info"] { position: static; width: auto; height: auto; overflow: visible; clip: auto; white-space: normal; }
      .message a { color: var(--green); }
      .chart-panel { display: flex; min-height: 0; flex: 1; flex-direction: column; overflow: hidden; background: #10120f; }
      .chart-heading { display: flex; min-height: 78px; flex: 0 0 auto; flex-direction: column; justify-content: center; gap: 5px; padding: 6px 8px; border-bottom: 1px solid #242820; }
      .chart-toolbar { display: grid; grid-template-columns: minmax(120px, 190px) minmax(0, 1fr) auto; align-items: center; gap: 8px; }
      .chart-symbol-control { height: 30px; }
      .chart-timeframes { display: flex; min-width: 0; align-items: center; gap: 2px; overflow-x: auto; scrollbar-width: none; }
      .chart-timeframes::-webkit-scrollbar { display: none; }
      .chart-timeframe-button { width: auto; min-width: 32px; height: 28px; flex: 0 0 auto; padding: 0 7px; border: 0; background: transparent; color: #a4aa9c; font-size: 10px; }
      .chart-timeframe-button[aria-pressed="true"] { border-radius: 4px; background: #282b30; color: #f3f4ee; }
      .chart-timeframe-button:hover:not(:disabled) { background: #202329; }
      .chart-info { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
      .chart-symbol { flex: 0 0 auto; color: #e8ecdf; font-size: 11px; font-weight: 700; }
      .chart-ohlc { margin-top: 5px; color: #a4aa9c; font-size: 11px; font-variant-numeric: tabular-nums; line-height: 1.6; }
      .chart-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 16px; }
      .chart-tools { display: flex; align-items: center; gap: 5px; }
      .chart-tools button { width: 30px; min-width: 30px; height: 28px; padding: 0; border: 1px solid #34382f; background: #20241c; color: #e4e9dc; font-size: 13px; }
      .chart-tools button:hover:not(:disabled) { background: #2a3023; }
      .chart-tools .fit-button { width: auto; min-width: 44px; padding: 0 8px; color: var(--green); font-size: 10px; }
      .range-count { min-width: 76px; color: var(--muted); font-size: 9px; text-align: right; }
      .chart-container { width: 100%; min-height: 0; flex: 1; }
      .empty { display: grid; min-height: 0; flex: 1; place-items: center; padding: 24px; color: #777d72; font-size: 12px; text-align: center; }
      [hidden] { display: none !important; }
      @media (max-width: 900px) { .chart-toolbar { grid-template-columns: minmax(120px, 180px) minmax(0, 1fr) auto; gap: 6px; } .chart-actions { gap: 8px; } .chart-info { gap: 8px; } .chart-ohlc { max-width: calc(100vw - 230px); overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; } }
      @media (max-width: 620px) { .shell { padding: 5px; } .chart-heading { min-height: 128px; gap: 7px; padding: 6px 3px; } .chart-toolbar { grid-template-columns: minmax(0, 1fr) auto; gap: 5px; } .chart-symbol-control { grid-column: 1 / -1; } .chart-timeframes { grid-column: 1 / -1; } .chart-actions { grid-column: 1 / -1; gap: 2px; } .chart-tools { gap: 3px; } .chart-tools button { width: 26px; min-width: 26px; } .chart-tools .fit-button { width: auto; min-width: 38px; } .range-count { min-width: 58px; font-size: 8px; } .chart-info { gap: 6px; } .chart-symbol { max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .chart-ohlc { max-width: calc(100vw - 120px); margin-top: 0; font-size: 9px; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <main>
        <form id="chart-form" hidden>
          <input id="fromdate" name="fromdate" type="hidden">
          <input id="todate" name="todate" type="hidden">
          <button id="load-button" type="submit" hidden></button>
        </form>
        <section class="chart-panel" aria-label="Candlestick chart">
          <div class="chart-heading">
            <div class="chart-toolbar">
              <input class="chart-symbol-control" id="neosymbol" name="neosymbol" form="chart-form" value="NIFTY" autocomplete="off" aria-label="Symbol" placeholder="Symbol or segment|token" required>
              <input id="interval" name="interval" form="chart-form" type="hidden" value="10min">
              <div class="chart-timeframes" id="chart-timeframes" role="group" aria-label="Chart timeframe">
                <button class="chart-timeframe-button" type="button" data-interval="1min" aria-pressed="false">1m</button>
                <button class="chart-timeframe-button" type="button" data-interval="3min" aria-pressed="false">3m</button>
                <button class="chart-timeframe-button" type="button" data-interval="5min" aria-pressed="false">5m</button>
                <button class="chart-timeframe-button" type="button" data-interval="10min" aria-pressed="false">10m</button>
                <button class="chart-timeframe-button" type="button" data-interval="15min" aria-pressed="false">15m</button>
                <button class="chart-timeframe-button" type="button" data-interval="30min" aria-pressed="false">30m</button>
                <button class="chart-timeframe-button" type="button" data-interval="60min" aria-pressed="false">1h</button>
                <button class="chart-timeframe-button" type="button" data-interval="D" aria-pressed="false">1D</button>
                <button class="chart-timeframe-button" type="button" data-interval="W" aria-pressed="false">1W</button>
              </div>
              <div class="chart-actions">
                <div class="chart-tools" aria-label="Chart navigation">
                  <button id="zoom-out" type="button" aria-label="Zoom out" title="Zoom out">-</button>
                  <button id="zoom-in" type="button" aria-label="Zoom in" title="Zoom in">+</button>
                  <button id="fit-chart" class="fit-button" type="button" title="Show all candles">Fit</button>
                  <span class="range-count" id="range-count" aria-live="polite">0 / 0</span>
                </div>
              </div>
            </div>
            <div class="chart-info">
              <div class="chart-symbol" id="chart-symbol">NIFTY</div>
              <div class="chart-ohlc" id="chart-ohlc">Load candles to see OHLC details.</div>
            </div>
          </div>
          <p class="message" id="message" role="status" aria-live="polite"></p>
          <div class="chart-container" id="chart-container" hidden></div>
          <div class="empty" id="empty">Choose an instrument and load historical candles.</div>
        </section>
      </main>
    </div>
    <script src="/assets/lightweight-charts.js"></script>
    <script>
      const form = document.querySelector("#chart-form");
      const symbolInput = document.querySelector("#neosymbol");
      const fromInput = document.querySelector("#fromdate");
      const toInput = document.querySelector("#todate");
      const intervalInput = document.querySelector("#interval");
      const button = document.querySelector("#load-button");
      const message = document.querySelector("#message");
      const container = document.querySelector("#chart-container");
      const empty = document.querySelector("#empty");
      const title = document.querySelector("#chart-symbol");
      const ohlc = document.querySelector("#chart-ohlc");
      const zoomInButton = document.querySelector("#zoom-in");
      const zoomOutButton = document.querySelector("#zoom-out");
      const fitButton = document.querySelector("#fit-chart");
      const rangeCount = document.querySelector("#range-count");
      const intervalButtons = Array.from(document.querySelectorAll(".chart-timeframe-button"));
      const params = new URLSearchParams(location.search);
      let chart;
      let candleSeries;
      let volumeSeries;
      let currentCandles = [];
      let lastPriceLine;
      let activeNeoSymbol = "";
      let activeInterval = "";
      let historyFromDate = "";
      let loadingOlderCandles = false;
      let olderCandlesExhausted = false;
      let chartPointerDown = false;
      let lastPointerRangeFrom;
      let dataRequestVersion = 0;

      const requestDaysByInterval = {
        "1min": 30,
        "3min": 30,
        "5min": 30,
        "10min": 60,
        "15min": 60,
        "30min": 90,
        "60min": 90,
        D: 180,
        W: 180,
      };
      const intervalLabels = {
        "1min": "1m",
        "3min": "3m",
        "5min": "5m",
        "10min": "10m",
        "15min": "15m",
        "30min": "30m",
        "60min": "1h",
        D: "1D",
        W: "1W",
      };

      function dateInputValue(date) {
        return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
          "-" + String(date.getDate()).padStart(2, "0");
      }

      const today = new Date();
      const defaultFrom = new Date(today);
      defaultFrom.setDate(defaultFrom.getDate() - 2);
      fromInput.value = params.get("fromdate") || dateInputValue(defaultFrom);
      toInput.value = params.get("todate") || dateInputValue(today);
      const initialSymbol = params.get("neosymbol") || params.get("symbol");
      symbolInput.value = initialSymbol
        ? (/^nse_cm\|26000$/i.test(initialSymbol) ? "NIFTY" : initialSymbol)
        : symbolInput.value;
      intervalInput.value = params.get("interval") || intervalInput.value;

      function updateIntervalButtons() {
        intervalButtons.forEach(function (button) {
          button.setAttribute("aria-pressed", String(button.dataset.interval === intervalInput.value));
        });
      }

      updateIntervalButtons();

      function formatPrice(value) {
        return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
      }

      function formatNumber(value) {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
      }

      function formatTime(value, includeDate) {
        const date = new Date(value * 1000);
        return new Intl.DateTimeFormat(undefined, includeDate
          ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
          : { hour: "2-digit", minute: "2-digit" }).format(date);
      }

      function shiftDate(dateValue, dayOffset) {
        const [year, month, day] = dateValue.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
        return date.toISOString().slice(0, 10);
      }

      function parseCandles(rows) {
        const byTime = new Map();
        if (!Array.isArray(rows)) return [];
        rows.forEach(function (row) {
          if (!Array.isArray(row) || row.length < 6) return;
          const timestamp = Date.parse(row[0]);
          const values = row.slice(1, 6).map(Number);
          if (!Number.isFinite(timestamp) || values.some(function (value) { return !Number.isFinite(value); })) return;
          const candle = {
            time: Math.floor(timestamp / 1000),
            open: values[0],
            high: values[1],
            low: values[2],
            close: values[3],
            volume: values[4],
          };
          byTime.set(candle.time, candle);
        });
        return Array.from(byTime.values()).sort(function (a, b) { return a.time - b.time; });
      }

      function setSeriesData(candles) {
        candleSeries.setData(candles.map(function (candle) {
          return {
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          };
        }));
        volumeSeries.setData(candles.map(function (candle) {
          return {
            time: candle.time,
            value: candle.volume,
            color: candle.close >= candle.open ? "rgba(8, 153, 129, 0.32)" : "rgba(242, 54, 69, 0.32)",
          };
        }));
      }

      async function fetchHistoricalCandles(fromDate, toDate, neoSymbol, interval) {
        const query = new URLSearchParams({
          fromdate: fromDate,
          todate: toDate,
          interval: interval,
        });
        query.set(neoSymbol.includes("|") ? "neosymbol" : "symbol", neoSymbol);
        const response = await fetch("/api/market-data/historical?" + query.toString(), {
          headers: { Accept: "application/json" },
        });
        const result = await response.json();
        if (!response.ok) {
          const errorText = result.error || result.message || "Historical data request failed.";
          throw new Error(response.status === 401
            ? "Please sign in on the account page, then load the chart again."
            : errorText);
        }
        return parseCandles(result.data && result.data.candles);
      }

      function showError(error) {
        message.textContent = error instanceof Error ? error.message : "Historical data request failed.";
        message.dataset.kind = "error";
        if (message.textContent.indexOf("sign in") >= 0) {
          message.innerHTML = "";
          const link = document.createElement("a");
          link.href = "/";
          link.textContent = "Sign in";
          message.append(" ", link, " first, then return to this page.");
        }
      }

      function updateOhlc(candle, volume) {
        if (!candle) {
          ohlc.textContent = "Load candles to see OHLC details.";
          return;
        }
        const change = candle.close - candle.open;
        const percent = candle.open ? change / candle.open * 100 : 0;
        ohlc.textContent = formatTime(candle.time, true) + "  O " + formatPrice(candle.open) +
          "  H " + formatPrice(candle.high) + "  L " + formatPrice(candle.low) +
          "  C " + formatPrice(candle.close) + "  " + (change >= 0 ? "+" : "") +
          formatPrice(change) + " (" + (percent >= 0 ? "+" : "") + percent.toFixed(2) +
          "%)  V " + formatNumber(volume || 0);
      }

      function updateRangeCount(range) {
        if (!chart || !currentCandles.length) {
          rangeCount.textContent = "0 / 0";
          return;
        }
        const visibleRange = range || chart.timeScale().getVisibleLogicalRange();
        if (!visibleRange) return;
        const visible = Math.min(
          currentCandles.length,
          Math.max(0, Math.ceil(visibleRange.to) - Math.floor(visibleRange.from) + 1),
        );
        rangeCount.textContent = visible + " / " + currentCandles.length;
      }

      function createChart() {
        if (chart) return;
        const library = window.LightweightCharts;
        if (!library) throw new Error("The chart library could not be loaded. Refresh and try again.");
        chart = library.createChart(container, {
          width: container.clientWidth,
          height: container.clientHeight,
          layout: {
            background: { type: library.ColorType.Solid, color: "#10120f" },
            textColor: "#a4aa9c",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            attributionLogo: true,
          },
          grid: {
            vertLines: { color: "#20241d" },
            horzLines: { color: "#20241d" },
          },
          crosshair: {
            mode: library.CrosshairMode.Normal,
            vertLine: { color: "#737b69", width: 1, style: library.LineStyle.Dashed, labelBackgroundColor: "#353b2d" },
            horzLine: { color: "#737b69", width: 1, style: library.LineStyle.Dashed, labelBackgroundColor: "#353b2d" },
          },
          rightPriceScale: {
            borderColor: "#30342c",
            scaleMargins: { top: 0.08, bottom: 0.22 },
          },
          timeScale: {
            borderColor: "#30342c",
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 8,
            barSpacing: 8,
          },
          handleScroll: {
            mouseWheel: false,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: false,
          },
          handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true,
          },
        });
        candleSeries = chart.addSeries(library.CandlestickSeries, {
          upColor: "#089981",
          downColor: "#f23645",
          borderVisible: false,
          wickUpColor: "#089981",
          wickDownColor: "#f23645",
          priceLineVisible: false,
        });
        volumeSeries = chart.addSeries(library.HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          lastValueVisible: false,
          priceLineVisible: false,
        });
        candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
        chart.priceScale("volume").applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
          visible: false,
        });
        container.addEventListener("pointerdown", function () {
          chartPointerDown = true;
          const range = chart.timeScale().getVisibleLogicalRange();
          lastPointerRangeFrom = range ? range.from : undefined;
        });
        window.addEventListener("pointerup", function () {
          chartPointerDown = false;
          lastPointerRangeFrom = undefined;
        });
        window.addEventListener("pointercancel", function () {
          chartPointerDown = false;
          lastPointerRangeFrom = undefined;
        });
        chart.timeScale().subscribeVisibleLogicalRangeChange(function (range) {
          updateRangeCount(range);
          if (chartPointerDown && range && lastPointerRangeFrom !== undefined) {
            const preloadThreshold = Math.min(20, Math.max(3, currentCandles.length * 0.1));
            const movedTowardHistory = range.from < lastPointerRangeFrom;
            lastPointerRangeFrom = range.from;
            if (movedTowardHistory && range.from < preloadThreshold) {
              loadOlderCandles();
            }
          }
        });
        chart.subscribeCrosshairMove(function (param) {
          if (!param || !param.time) {
            const lastCandle = currentCandles[currentCandles.length - 1];
            updateOhlc(lastCandle, lastCandle && lastCandle.volume);
            return;
          }
          const candle = param.seriesData.get(candleSeries);
          const volume = param.seriesData.get(volumeSeries);
          if (candle && typeof candle.open === "number") {
            updateOhlc(candle, volume && typeof volume.value === "number" ? volume.value : 0);
          }
        });
        new ResizeObserver(function (entries) {
          const size = entries[0] && entries[0].contentRect;
          if (size && size.width > 0 && size.height > 0) {
            chart.applyOptions({ width: size.width, height: size.height });
          }
        }).observe(container);
      }

      async function loadOlderCandles() {
        if (!chart || loadingOlderCandles || olderCandlesExhausted || !historyFromDate || !currentCandles.length) {
          return;
        }
        const requestDays = requestDaysByInterval[activeInterval];
        if (!requestDays) return;
        const requestVersion = dataRequestVersion;
        const toDate = shiftDate(historyFromDate, -1);
        const fromDate = shiftDate(toDate, -(requestDays - 1));
        loadingOlderCandles = true;
        message.textContent = "Loading earlier candles…";
        message.dataset.kind = "loading";
        try {
          const olderCandles = await fetchHistoricalCandles(fromDate, toDate, activeNeoSymbol, activeInterval);
          if (requestVersion !== dataRequestVersion) return;
          if (!olderCandles.length) {
            olderCandlesExhausted = true;
            message.textContent = "No earlier candles available.";
            message.dataset.kind = "info";
            return;
          }
          const previousCount = currentCandles.length;
          const previousRange = chart.timeScale().getVisibleLogicalRange();
          const candlesByTime = new Map();
          olderCandles.concat(currentCandles).forEach(function (candle) {
            candlesByTime.set(candle.time, candle);
          });
          currentCandles = Array.from(candlesByTime.values()).sort(function (a, b) { return a.time - b.time; });
          const addedCount = currentCandles.length - previousCount;
          if (addedCount === 0) {
            olderCandlesExhausted = true;
            message.textContent = "No earlier candles available.";
            message.dataset.kind = "info";
            return;
          }
          historyFromDate = fromDate;
          setSeriesData(currentCandles);
          if (previousRange) {
            chart.timeScale().setVisibleLogicalRange({
              from: previousRange.from + addedCount,
              to: previousRange.to + addedCount,
            });
          }
          updateRangeCount();
          message.textContent = "";
          message.dataset.kind = "";
        } catch (error) {
          if (requestVersion === dataRequestVersion) showError(error);
        } finally {
          if (requestVersion === dataRequestVersion) loadingOlderCandles = false;
        }
      }

      function zoomChart(factor) {
        if (!chart || !currentCandles.length) return;
        const timeScale = chart.timeScale();
        const range = timeScale.getVisibleLogicalRange();
        if (!range) return;
        const total = currentCandles.length;
        const currentWidth = range.to - range.from;
        const nextWidth = Math.max(8, Math.min(total, currentWidth * factor));
        const center = (range.from + range.to) / 2;
        let from = center - nextWidth / 2;
        let to = center + nextWidth / 2;
        if (from < 0) {
          to -= from;
          from = 0;
        }
        if (to > total - 1) {
          from = Math.max(0, from - (to - (total - 1)));
          to = total - 1;
        }
        timeScale.setVisibleLogicalRange({ from: from, to: to });
      }

      zoomInButton.addEventListener("click", function () { zoomChart(0.7); });
      zoomOutButton.addEventListener("click", function () { zoomChart(1.4); });
      fitButton.addEventListener("click", function () {
        if (chart) chart.timeScale().fitContent();
      });
      symbolInput.addEventListener("change", function () { form.requestSubmit(); });
      intervalButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          if (!button.dataset.interval || button.dataset.interval === intervalInput.value) return;
          intervalInput.value = button.dataset.interval;
          updateIntervalButtons();
          form.requestSubmit();
        });
      });

      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const requestVersion = ++dataRequestVersion;
        loadingOlderCandles = false;
        olderCandlesExhausted = false;
        activeNeoSymbol = symbolInput.value.trim();
        activeInterval = intervalInput.value;
        historyFromDate = fromInput.value;
        button.disabled = true;
        message.textContent = "Loading historical candles…";
        message.dataset.kind = "loading";
        empty.hidden = false;
        empty.textContent = "Loading chart data…";
        container.hidden = true;
        try {
          const query = new URLSearchParams({
            fromdate: fromInput.value,
            todate: toInput.value,
            interval: activeInterval,
          });
          query.set(activeNeoSymbol.includes("|") ? "neosymbol" : "symbol", activeNeoSymbol);
          history.replaceState(null, "", location.pathname + "?" + query.toString());
          currentCandles = await fetchHistoricalCandles(
            fromInput.value,
            toInput.value,
            activeNeoSymbol,
            activeInterval,
          );
          if (requestVersion !== dataRequestVersion) return;
          title.textContent = activeNeoSymbol.toUpperCase() + " · " +
            (intervalLabels[activeInterval] || activeInterval);
          if (!currentCandles.length) {
            message.textContent = "No candles were returned for this symbol and date range.";
            message.dataset.kind = "info";
            empty.textContent = "No candle data available for this selection.";
            empty.hidden = false;
            ohlc.textContent = "";
            rangeCount.textContent = "0 / 0";
            return;
          }
          container.hidden = false;
          empty.hidden = true;
          createChart();
          setSeriesData(currentCandles);
          if (lastPriceLine) candleSeries.removePriceLine(lastPriceLine);
          const lastCandle = currentCandles[currentCandles.length - 1];
          lastPriceLine = candleSeries.createPriceLine({
            price: lastCandle.close,
            color: "#089981",
            lineWidth: 1,
            lineStyle: window.LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: "Close",
          });
          chart.timeScale().fitContent();
          if (currentCandles.length > 120) {
            chart.timeScale().setVisibleLogicalRange({
              from: currentCandles.length - 120,
              to: currentCandles.length - 1,
            });
          }
          message.textContent = currentCandles.length + " candles loaded.";
          message.dataset.kind = "";
          updateOhlc(lastCandle, lastCandle.volume);
          updateRangeCount();
        } catch (error) {
          if (requestVersion !== dataRequestVersion) return;
          currentCandles = [];
          showError(error);
          empty.textContent = "No candle data available.";
          empty.hidden = false;
          container.hidden = true;
          ohlc.textContent = "";
          rangeCount.textContent = "0 / 0";
        } finally {
          if (requestVersion === dataRequestVersion) button.disabled = false;
        }
      });

      form.requestSubmit();
    </script>
  </body>
</html>`;
}
