import { findLiquiditySwings } from "/trading-view/liquidity-swings.js";
import { formatIndiaAxisTick, formatIndiaTime } from "/trading-view/time-format.js";

const { CrosshairMode, LineStyle, TickMarkType, createChart } = window.LightweightCharts;
const chartColors = {
  background: "#131722",
  text: "#787b86",
  grid: "#1e222d",
  border: "#2a2e39",
  up: "#089981",
  down: "#f23645",
  upVolume: "rgba(8, 153, 129, 0.35)",
  downVolume: "rgba(242, 54, 69, 0.35)",
  drawing: "#2962ff",
};
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
const axisTickKinds = {
  [TickMarkType.Year]: "year",
  [TickMarkType.Month]: "month",
  [TickMarkType.DayOfMonth]: "day",
  [TickMarkType.Time]: "time",
  [TickMarkType.TimeWithSeconds]: "timeWithSeconds",
};

const chart = createChart(chartElement, {
  autoSize: true,
  layout: {
    background: { type: "solid", color: chartColors.background },
    textColor: chartColors.text,
    fontFamily: "Inter, system-ui, sans-serif",
  },
  grid: {
    vertLines: { color: chartColors.grid },
    horzLines: { color: chartColors.grid },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: {
    borderColor: chartColors.border,
    minimumWidth: 72,
    scaleMargins: { top: 0.1, bottom: 0.22 },
  },
  timeScale: {
    borderColor: chartColors.border,
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 8,
    barSpacing: 8,
    tickMarkFormatter: (time, tickMarkType) =>
      formatIndiaAxisTick(time, axisTickKinds[tickMarkType] ?? "time"),
  },
  localization: {
    timeFormatter: (time) => formatIndiaTime(time, true),
  },
});

const candleSeries = chart.addCandlestickSeries({
  upColor: chartColors.up,
  downColor: chartColors.down,
  borderVisible: false,
  wickUpColor: chartColors.up,
  wickDownColor: chartColors.down,
  priceLineVisible: true,
});
const barSeries = chart.addBarSeries({
  upColor: chartColors.up,
  downColor: chartColors.down,
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
let countdownTimer;
let quoteInFlight = false;
let liveSocket;
let socketConnected = false;
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
      color: isHigh ? chartColors.down : chartColors.up,
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
      color: isHigh ? chartColors.down : chartColors.up,
      shape: isHigh ? "arrowDown" : "arrowUp",
      text: isHigh ? "SH" : "SL",
      size: 1,
    });
  }
  activePriceSeries().setMarkers(markers);
}

function clearLiveTimer() {
  stopQuotePolling();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = undefined;
  document.querySelector("#live-countdown").hidden = true;
  const socket = liveSocket;
  liveSocket = undefined;
  socketConnected = false;
  if (typeof socket?.close === "function") socket.close();
}

function stopQuotePolling() {
  if (quoteTimer) clearInterval(quoteTimer);
  quoteTimer = undefined;
}

function startQuotePolling(sequence, symbol) {
  if (sequence !== loadSequence || quoteTimer) return;
  quoteTimer = setInterval(() => void pollQuote(sequence, symbol), 5000);
  void pollQuote(sequence, symbol);
}

function updateLiveCountdown() {
  const timer = document.querySelector("#live-countdown");
  const latest = candles.at(-1);
  const duration = intervalSeconds[currentResolution];
  if (!latest || currentResolution === "D" || !duration) {
    timer.hidden = true;
    return;
  }

  const now = Date.now() / 1000;
  const today = indiaDate(new Date());
  if (indiaDate(new Date(latest.time * 1000)) !== today) {
    timer.hidden = true;
    return;
  }

  const remaining = Math.ceil(latest.time + duration - now);
  const y = activePriceSeries().priceToCoordinate(latest.close);
  if (remaining <= 0 || !Number.isFinite(y) || y < 0 || y + 28 > chartElement.clientHeight) {
    timer.hidden = true;
    return;
  }

  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");
  timer.textContent = `${minutes}:${seconds}`;
  timer.dataset.direction = latest.close >= latest.open ? "up" : "down";
  timer.style.top = `${Math.round(y + 10)}px`;
  timer.hidden = false;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function updateFromSocket(sequence, symbol, message) {
  const updates = Array.isArray(message) ? message : [message];
  const quotes = [];
  for (const update of updates) {
    if (update?.symbol !== symbol || !Number.isFinite(Number(update.ltp))) continue;
    const time = Number(update.exch_feed_time ?? update.last_traded_time);
    if (!Number.isFinite(time)) continue;
    const volume = Number(update.vol_traded_today);
    quotes.push({
      price: Number(update.ltp),
      volume: Number.isFinite(volume) ? volume : lastQuoteVolume ?? 0,
      time,
    });
  }
  if (!quotes.length) return;

  socketConnected = true;
  stopQuotePolling();
  for (const quote of quotes) applyLiveQuote(sequence, symbol, quote);
}

async function connectLiveSocket(sequence, symbol) {
  if (typeof window.fyersDataSocket !== "function") {
    feedStatus.textContent = "Fyers WebSocket SDK unavailable; using REST quote fallback";
    setConnectionStatus("Starting fallback");
    startQuotePolling(sequence, symbol);
    return;
  }

  try {
    const credentials = await fetchJson("/api/fyers/ws-token", { method: "POST" });
    if (sequence !== loadSequence) return;

    const token = `${credentials.appId}:${credentials.accessToken}`;
    const Socket = window.fyersDataSocket;
    const socket = typeof Socket.getInstance === "function"
      ? Socket.getInstance(token, "", true)
      : new Socket(token, "", true);
    liveSocket = socket;
    socketConnected = false;
    socket.on("connect", () => {
      if (sequence !== loadSequence || liveSocket !== socket) return;
      try {
        if (typeof socket.mode === "function" && socket.FullMode !== undefined) {
          socket.mode(socket.FullMode);
        }
        socket.subscribe([symbol]);
        setConnectionStatus("Fyers connected");
        feedStatus.textContent = "Waiting for first Fyers price update; REST fallback is active";
      } catch (error) {
        socketConnected = false;
        setConnectionStatus("Fyers reconnecting");
        feedStatus.textContent = `WebSocket subscription failed: ${error.message}`;
        startQuotePolling(sequence, symbol);
      }
    });
    socket.on("message", (message) => {
      if (sequence === loadSequence && liveSocket === socket) updateFromSocket(sequence, symbol, message);
    });
    socket.on("error", () => {
      if (sequence !== loadSequence || liveSocket !== socket) return;
      socketConnected = false;
      setConnectionStatus("Fyers reconnecting");
      feedStatus.textContent = "WebSocket interrupted; using REST quote fallback";
      startQuotePolling(sequence, symbol);
    });
    socket.on("close", () => {
      if (sequence !== loadSequence || liveSocket !== socket) return;
      socketConnected = false;
      setConnectionStatus("Fyers reconnecting");
      feedStatus.textContent = "WebSocket disconnected; using REST quote fallback";
      startQuotePolling(sequence, symbol);
    });
    if (typeof socket.autoreconnect === "function") socket.autoreconnect(10);
    else if (typeof socket.autoReconnect === "function") socket.autoReconnect(10);
    socket.connect();
  } catch (error) {
    if (sequence !== loadSequence) return;
    const failedSocket = liveSocket;
    liveSocket = undefined;
    socketConnected = false;
    if (typeof failedSocket?.close === "function") failedSocket.close();
    if (error.status === 401) {
      clearLiveTimer();
      showMessage(error.message, { login: true });
      setConnectionStatus("Login required", "error");
      feedStatus.textContent = "Your Fyers session is missing or expired";
      return;
    }
    feedStatus.textContent = `Fyers WebSocket unavailable: ${error.message}`;
    setConnectionStatus("Starting fallback");
    startQuotePolling(sequence, symbol);
  }
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
      color: bar.close >= bar.open ? chartColors.upVolume : chartColors.downVolume,
    })));
    chart.timeScale().fitContent();
    document.querySelector("#instrument-name").textContent = symbol;
    document.querySelector("#chart-subtitle").textContent =
      `Fyers market data · ${intervalLabel(currentResolution)} · ${from} to ${to}`;
    document.querySelector("#last-price").textContent = formatPrice(candles.at(-1).close);
    document.querySelector("#price-change").textContent = "Last traded price";
    updateOhlc(candles.at(-1));
    renderSwings();
    updateLiveCountdown();
    hideMessage();
    setConnectionStatus("Connecting", "");
    feedStatus.textContent = "Connecting to Fyers market-data WebSocket";
    lastQuoteVolume = undefined;
    startQuotePolling(sequence, symbol);
    void connectLiveSocket(sequence, symbol);
    countdownTimer = setInterval(updateLiveCountdown, 1000);
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
  if (quoteInFlight || socketConnected) return;
  quoteInFlight = true;
  try {
    const result = await fetchJson(`/api/fyers/quote?${new URLSearchParams({ symbol })}`);
    if (sequence !== loadSequence || symbol !== symbolInput.value.trim().toUpperCase() || socketConnected) return;
    applyLiveQuote(sequence, symbol, result);
  } catch (error) {
    if (sequence !== loadSequence) return;
    if (error.status === 401) {
      clearLiveTimer();
      showMessage(error.message, { login: true });
      setConnectionStatus("Login required", "error");
      feedStatus.textContent = "Your Fyers session is missing or expired";
    } else {
      feedStatus.textContent = error.message;
      setConnectionStatus("Fyers polling error", "error");
    }
  } finally {
    quoteInFlight = false;
  }
}

function applyLiveQuote(sequence, symbol, quote) {
  if (sequence !== loadSequence || symbol !== symbolInput.value.trim().toUpperCase()) return;
  const previous = candles.at(-1);
  if (!previous || quote.time < previous.time) return;

  const isNewBar = currentResolution === "D"
    ? timeBucket(previous.time, currentResolution) !== timeBucket(quote.time, currentResolution)
    : timeBucket(quote.time, currentResolution) > previous.time;
  const volumeDelta = lastQuoteVolume === undefined
    ? 0
    : Math.max(0, quote.volume - lastQuoteVolume);
  lastQuoteVolume = quote.volume;

  const next = isNewBar
    ? {
        time: currentResolution === "D" ? quote.time : timeBucket(quote.time, currentResolution),
        open: quote.price,
        high: quote.price,
        low: quote.price,
        close: quote.price,
        volume: volumeDelta,
      }
    : {
        ...previous,
        high: Math.max(previous.high, quote.price),
        low: Math.min(previous.low, quote.price),
        close: quote.price,
        volume: previous.volume + volumeDelta,
      };
  if (isNewBar) candles.push(next);
  else candles[candles.length - 1] = next;
  candleSeries.update(next);
  barSeries.update(next);
  volumeSeries.update({
    time: next.time,
    value: next.volume,
    color: next.close >= next.open ? chartColors.upVolume : chartColors.downVolume,
  });
  document.querySelector("#last-price").textContent = formatPrice(quote.price);
  updateOhlc(next);
  updateLiveCountdown();
  setConnectionStatus(socketConnected ? "Fyers live" : "Fyers polling", "connected");
  feedStatus.textContent = socketConnected
    ? `Fyers WebSocket update ${formatIndiaTime(quote.time)} IST`
    : `REST quote update ${formatIndiaTime(quote.time)} IST`;
  if (isNewBar) renderSwings();
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
      color: chartColors.drawing,
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
    color: chartColors.drawing,
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
  updateLiveCountdown();
});

document.querySelector("#bars-type").addEventListener("click", () => {
  chartType = "bars";
  candleSeries.applyOptions({ visible: false });
  barSeries.applyOptions({ visible: true });
  document.querySelector("#bars-type").classList.add("selected");
  document.querySelector("#candles-type").classList.remove("selected");
  clearDrawings();
  renderSwings();
  updateLiveCountdown();
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
