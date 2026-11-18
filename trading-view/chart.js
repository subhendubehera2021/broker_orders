import { findLiquiditySwings } from "/trading-view/liquidity-swings.js";

const { CrosshairMode, LineStyle, createChart } = window.LightweightCharts;
const chartElement = document.querySelector("#chart");
const chartMessage = document.querySelector("#chart-message");
const chartMessageText = document.querySelector("#chart-message-text");
const chartLogin = document.querySelector("#chart-login");
const symbolInput = document.querySelector("#symbol");
const rangeSelect = document.querySelector("#range");
const swingToggle = document.querySelector("#swing-toggle");
const lookbackSelect = document.querySelector("#lookback");
const connectionStatus = document.querySelector("#connection-status");
const feedStatus = document.querySelector("#feed-status");
const intervalSeconds = { "1": 60, "5": 300, "15": 900, "60": 3600, D: 86400 };

const chart = createChart(chartElement, {
  autoSize: true,
  layout: {
    background: { type: "solid", color: "#151a15" },
    textColor: "#899487",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  grid: {
    vertLines: { color: "#222a22" },
    horzLines: { color: "#222a22" },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: "#303830", scaleMargins: { top: 0.1, bottom: 0.22 } },
  timeScale: {
    borderColor: "#303830",
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 8,
    barSpacing: 8,
  },
  localization: {
    timeFormatter: (time) => formatIndiaTime(time, true),
  },
});

const candleSeries = chart.addCandlestickSeries({
  upColor: "#26a986",
  downColor: "#ef5964",
  borderVisible: false,
  wickUpColor: "#26a986",
  wickDownColor: "#ef5964",
  priceLineVisible: true,
});
const barSeries = chart.addBarSeries({
  upColor: "#26a986",
  downColor: "#ef5964",
  priceLineVisible: true,
  visible: false,
});
const volumeSeries = chart.addHistogramSeries({
  priceFormat: { type: "volume" },
  priceScaleId: "",
  lastValueVisible: false,
  priceLineVisible: false,
});
chart.priceScale("").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

let candles = [];
let currentResolution = "5";
let chartType = "candles";
let activeTool = "cursor";
let pendingTrendStart;
let drawings = [];
let swingSeries = [];
let quoteTimer;
let quoteInFlight = false;
let lastQuoteVolume;
let loadSequence = 0;

function activePriceSeries() {
  return chartType === "candles" ? candleSeries : barSeries;
}

function showMessage(message, { loading = false, login = false } = {}) {
  chartMessage.hidden = false;
  chartMessageText.textContent = message;
  chartMessage.querySelector(".spinner").hidden = !loading;
  chartLogin.hidden = !login;
}

function hideMessage() {
  chartMessage.hidden = true;
}

function setConnectionStatus(message, kind = "") {
  connectionStatus.textContent = message;
  connectionStatus.className = `connection-status${kind ? ` ${kind}` : ""}`;
}

function indiaDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

function rangeDates(days) {
  const to = indiaDate(new Date());
  const from = new Date(`${to}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - Number(days) + 1);
  return { from: from.toISOString().slice(0, 10), to };
}

function formatIndiaTime(value, includeDate = false) {
  if (typeof value !== "number") return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    ...(includeDate ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value * 1000));
}

function formatPrice(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)
    : "—";
}

function formatVolume(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-IN", { notation: "compact" }).format(value) : "—";
}

function updateOhlc(bar) {
  if (!bar) return;
  document.querySelector("#open-value").textContent = formatPrice(bar.open);
  document.querySelector("#high-value").textContent = formatPrice(bar.high);
  document.querySelector("#low-value").textContent = formatPrice(bar.low);
  document.querySelector("#close-value").textContent = formatPrice(bar.close);
  document.querySelector("#volume-value").textContent = formatVolume(bar.volume);
}

function clearDrawings() {
  for (const drawing of drawings) {
    if (drawing.type === "price") drawing.series.removePriceLine(drawing.line);
    else chart.removeSeries(drawing.series);
  }
  drawings = [];
  pendingTrendStart = undefined;
  document.querySelector("#draw-hint").textContent = "";
}

function clearSwings() {
  for (const series of swingSeries) chart.removeSeries(series);
  swingSeries = [];
  candleSeries.setMarkers([]);
  barSeries.setMarkers([]);
}

function renderSwings() {
  clearSwings();
  if (!swingToggle.checked || candles.length < Number(lookbackSelect.value) * 2 + 1) return;
  const markers = [];
  for (const swing of findLiquiditySwings(candles, Number(lookbackSelect.value))) {
    const isHigh = swing.side === "high";
    const series = chart.addLineSeries({
      color: isHigh ? "#ec6570" : "#31b68c",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    series.setData([
      { time: swing.startTime, value: swing.level },
      { time: swing.endTime, value: swing.level },
    ]);
    swingSeries.push(series);
    markers.push({
      time: swing.startTime,
      position: isHigh ? "aboveBar" : "belowBar",
      color: isHigh ? "#ec6570" : "#31b68c",
      shape: isHigh ? "arrowDown" : "arrowUp",
      text: isHigh ? "SH" : "SL",
      size: 1,
    });
  }
  activePriceSeries().setMarkers(markers);
}

function clearLiveTimer() {
  if (quoteTimer) clearInterval(quoteTimer);
  quoteTimer = undefined;
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadChart() {
  clearLiveTimer();
  const sequence = ++loadSequence;
  const symbol = symbolInput.value.trim().toUpperCase();
  if (!symbol) {
    showMessage("Enter a Fyers symbol to load the chart.");
    symbolInput.focus();
    return;
  }

  clearDrawings();
  clearSwings();
  candleSeries.setData([]);
  barSeries.setData([]);
  volumeSeries.setData([]);
  showMessage("Loading historical candles…", { loading: true });
  setConnectionStatus("Loading", "");
  const { from, to } = rangeDates(rangeSelect.value);
  const query = new URLSearchParams({
    symbol,
    resolution: currentResolution,
    from,
    to,
  });

  try {
    const result = await fetchJson(`/api/fyers/candles?${query}`);
    if (sequence !== loadSequence) return;
    candles = result.candles;
    if (!candles.length) throw new Error("No candles returned for this symbol and date range.");
    candleSeries.setData(candles);
    barSeries.setData(candles);
    volumeSeries.setData(candles.map((bar) => ({
      time: bar.time,
      value: bar.volume,
      color: bar.close >= bar.open ? "#266a58" : "#743d43",
    })));
    chart.timeScale().fitContent();
    document.querySelector("#instrument-name").textContent = symbol;
    document.querySelector("#chart-subtitle").textContent =
      `Fyers market data · ${intervalLabel(currentResolution)} · ${from} to ${to}`;
    document.querySelector("#last-price").textContent = formatPrice(candles.at(-1).close);
    document.querySelector("#price-change").textContent = "Last traded price";
    updateOhlc(candles.at(-1));
    renderSwings();
    hideMessage();
    setConnectionStatus("Fyers connected", "connected");
    feedStatus.textContent = "Live quote polling every 5 seconds";
    lastQuoteVolume = undefined;
    quoteTimer = setInterval(() => void pollQuote(sequence, symbol), 5000);
  } catch (error) {
    if (sequence !== loadSequence) return;
    candles = [];
    showMessage(error.message, { login: error.status === 401 });
    setConnectionStatus(error.status === 401 ? "Login required" : "Data unavailable", "error");
    feedStatus.textContent = error.status === 401
      ? "Your Fyers session is missing or expired"
      : "Could not load market data";
  }
}

function intervalLabel(resolution) {
  return resolution === "60" ? "1 hour" : resolution === "D" ? "1 day" : `${resolution} minute`;
}

function timeBucket(time, resolution) {
  const date = indiaDate(new Date(time * 1000));
  if (resolution === "D") return date;
  const seconds = intervalSeconds[resolution];
  const firstBarOfDay = candles.find((bar) => indiaDate(new Date(bar.time * 1000)) === date);
  const anchor = firstBarOfDay?.time ?? time;
  return anchor + Math.floor((time - anchor) / seconds) * seconds;
}

async function pollQuote(sequence, symbol) {
  if (quoteInFlight) return;
  quoteInFlight = true;
  try {
    const result = await fetchJson(`/api/fyers/quote?${new URLSearchParams({ symbol })}`);
    if (sequence !== loadSequence || symbol !== symbolInput.value.trim().toUpperCase()) return;
    const previous = candles.at(-1);
    if (!previous || result.time < previous.time) return;

    const isNewBar = currentResolution === "D"
      ? timeBucket(previous.time, currentResolution) !== timeBucket(result.time, currentResolution)
      : timeBucket(result.time, currentResolution) > previous.time;
    const volumeDelta = lastQuoteVolume === undefined
      ? 0
      : Math.max(0, result.volume - lastQuoteVolume);
    lastQuoteVolume = result.volume;

    const next = isNewBar
      ? {
          time: currentResolution === "D" ? result.time : timeBucket(result.time, currentResolution),
          open: result.price,
          high: result.price,
          low: result.price,
          close: result.price,
          volume: volumeDelta,
        }
      : {
          ...previous,
          high: Math.max(previous.high, result.price),
          low: Math.min(previous.low, result.price),
          close: result.price,
          volume: previous.volume + volumeDelta,
        };
    if (isNewBar) candles.push(next);
    else candles[candles.length - 1] = next;
    candleSeries.update(next);
    barSeries.update(next);
    volumeSeries.update({
      time: next.time,
      value: next.volume,
      color: next.close >= next.open ? "#266a58" : "#743d43",
    });
    document.querySelector("#last-price").textContent = formatPrice(result.price);
    updateOhlc(next);
    setConnectionStatus("Fyers connected", "connected");
    feedStatus.textContent = `Quote updated ${formatIndiaTime(result.time)} IST`;
    if (isNewBar) renderSwings();
  } catch (error) {
    if (sequence !== loadSequence) return;
    if (error.status === 401) {
      clearLiveTimer();
      showMessage(error.message, { login: true });
      setConnectionStatus("Login required", "error");
      feedStatus.textContent = "Your Fyers session is missing or expired";
    } else {
      feedStatus.textContent = error.message;
    }
  } finally {
    quoteInFlight = false;
  }
}

function selectTool(tool) {
  activeTool = tool;
  pendingTrendStart = undefined;
  for (const button of document.querySelectorAll("[data-tool]")) {
    const selected = button.dataset.tool === tool;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  document.querySelector("#draw-hint").textContent =
    tool === "horizontal" ? "Click the chart to place a horizontal level" :
      tool === "trend" ? "Click two chart points to draw a trend line" : "";
}

chart.subscribeClick((param) => {
  if (activeTool === "cursor" || !param.point || param.time === undefined) return;
  const price = activePriceSeries().coordinateToPrice(param.point.y);
  if (!Number.isFinite(price)) return;

  if (activeTool === "horizontal") {
    const line = activePriceSeries().createPriceLine({
      price,
      color: "#e5bd63",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Level",
    });
    drawings.push({ type: "price", series: activePriceSeries(), line });
    selectTool("cursor");
    return;
  }

  if (!pendingTrendStart) {
    pendingTrendStart = { time: param.time, price };
    document.querySelector("#draw-hint").textContent = "Choose the second point";
    return;
  }

  const series = chart.addLineSeries({
    color: "#e5bd63",
    lineWidth: 2,
    lastValueVisible: false,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  });
  series.setData([
    { time: pendingTrendStart.time, value: pendingTrendStart.price },
    { time: param.time, value: price },
  ].sort((left, right) => left.time - right.time));
  drawings.push({ type: "trend", series });
  selectTool("cursor");
});

chart.subscribeCrosshairMove((param) => {
  if (!param.time) return;
  const bar = param.seriesData.get(activePriceSeries());
  const volume = param.seriesData.get(volumeSeries);
  if (bar) {
    updateOhlc({
      ...bar,
      volume: volume?.value ?? 0,
    });
  }
});

document.querySelector("#intervals").addEventListener("click", (event) => {
  const button = event.target.closest("[data-resolution]");
  if (!button || button.dataset.resolution === currentResolution) return;
  currentResolution = button.dataset.resolution;
  document.querySelectorAll("#intervals [data-resolution]").forEach((item) => {
    item.classList.toggle("selected", item === button);
  });
  loadChart();
});

document.querySelector("#load-chart").addEventListener("click", () => void loadChart());
symbolInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void loadChart();
});
rangeSelect.addEventListener("change", () => void loadChart());
swingToggle.addEventListener("change", renderSwings);
lookbackSelect.addEventListener("change", renderSwings);

document.querySelector("#candles-type").addEventListener("click", () => {
  chartType = "candles";
  candleSeries.applyOptions({ visible: true });
  barSeries.applyOptions({ visible: false });
  document.querySelector("#candles-type").classList.add("selected");
  document.querySelector("#bars-type").classList.remove("selected");
  clearDrawings();
  renderSwings();
});

document.querySelector("#bars-type").addEventListener("click", () => {
  chartType = "bars";
  candleSeries.applyOptions({ visible: false });
  barSeries.applyOptions({ visible: true });
  document.querySelector("#bars-type").classList.add("selected");
  document.querySelector("#candles-type").classList.remove("selected");
  clearDrawings();
  renderSwings();
});

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => selectTool(button.dataset.tool));
});
document.querySelector("#clear-drawings").addEventListener("click", clearDrawings);

try {
  const session = await fetchJson("/api/fyers/session");
  if (!session.authenticated) {
    setConnectionStatus(session.configured ? "Login required" : "Fyers not configured", "error");
    showMessage(
      session.configured ? "Log in with Fyers to load chart data." : "Configure Fyers on the server first.",
      { login: session.configured },
    );
  } else {
    await loadChart();
  }
} catch (error) {
  setConnectionStatus("Unable to check Fyers login", "error");
  showMessage(error.message);
}
