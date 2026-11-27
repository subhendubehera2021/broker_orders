import { calculateOrderBlocks } from "/ui/order-blocks.js";
import {
  DEFAULT_PIVOT_LOOKBACK,
  findLiquiditySwings,
} from "/ui/liquidity-swings-indicator.js";
import { mapFyersCandles } from "/ui/chart-data.js";
import { createLiveCandleAggregator } from "/ui/live-candles.js";

const historyEndpoint = "/api/fyers/market-data/historical-data";
const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const form = document.querySelector("#chart-query-form");
const symbolInput = document.querySelector("#chart-symbol");
const chartResolutionInput = document.querySelector("#chart-resolution");
const quickIntervalButtons = [...document.querySelectorAll(".chart-interval-button")];
const fromDateInput = document.querySelector("#chart-from-date");
const toDateInput = document.querySelector("#chart-to-date");
const loadButton = document.querySelector("#chart-load");
const internalOrderBlocksEnabled = document.querySelector("#internal-ob-enabled");
const internalOrderBlocksCount = document.querySelector("#internal-ob-count");
const swingOrderBlocksEnabled = document.querySelector("#swing-ob-enabled");
const swingOrderBlocksCount = document.querySelector("#swing-ob-count");
const liquiditySwingEnabled = document.querySelector("#liquidity-swing-enabled");
const liquiditySwingPivot = document.querySelector("#liquidity-swing-pivot");
const volumeEnabled = document.querySelector("#volume-enabled");
const replayPickStart = document.querySelector("#replay-pick-start");
const chartContainer = document.querySelector("#chart-container");
const chartStatus = document.querySelector("#chart-status");
const chartLiveStatus = document.querySelector("#chart-live-status");
const chartCandleCountdown = document.querySelector("#chart-candle-countdown");
const chartTitleSymbol = document.querySelector("#chart-title-symbol");
const chartTitleInterval = document.querySelector("#chart-title-interval");
const chartCandleCount = document.querySelector("#chart-candle-count");
const liquiditySwingStatus = document.querySelector("#liquidity-swing-status");
const replayStatus = document.querySelector("#replay-status");
const replayStart = document.querySelector("#replay-start");
const replayPrevious = document.querySelector("#replay-previous");
const replayNext = document.querySelector("#replay-next");
const replayPlay = document.querySelector("#replay-play");
const replaySpeed = document.querySelector("#replay-speed");
const replayExit = document.querySelector("#replay-exit");
const stats = {
  open: document.querySelector("#chart-open"),
  high: document.querySelector("#chart-high"),
  low: document.querySelector("#chart-low"),
  close: document.querySelector("#chart-close"),
  volume: document.querySelector("#chart-volume"),
};

function getMinuteIntervalLabel() {
  return `${chartResolutionInput.value}-minute`;
}

function getChartIntervalLabel() {
  return `${chartResolutionInput.value}m`;
}

function updateQuickIntervalButtons() {
  for (const button of quickIntervalButtons) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.resolution === chartResolutionInput.value),
    );
  }
  loadButton.textContent = `Load ${getChartIntervalLabel()} chart`;
}

function formatLocalChartTime(time, locale, options) {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: localTimeZone,
  }).format(new Date(Number(time) * 1000));
}

const chart = LightweightCharts.createChart(chartContainer, {
  autoSize: true,
  layout: {
    background: { type: LightweightCharts.ColorType.Solid, color: "#131722" },
    textColor: "#b2b5be",
    attributionLogo: true,
  },
  grid: {
    vertLines: { color: "#1e222d" },
    horzLines: { color: "#1e222d" },
  },
  crosshair: {
    mode: LightweightCharts.CrosshairMode.Normal,
    vertLine: { color: "#758696", labelBackgroundColor: "#363a45" },
    horzLine: { color: "#758696", labelBackgroundColor: "#363a45" },
  },
  rightPriceScale: { borderColor: "#363a45" },
  timeScale: {
    borderColor: "#363a45",
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 4,
    tickMarkFormatter: (time, tickMarkType, locale) => {
      const formats = {
        [LightweightCharts.TickMarkType.Year]: { year: "numeric" },
        [LightweightCharts.TickMarkType.Month]: { month: "short", year: "2-digit" },
        [LightweightCharts.TickMarkType.DayOfMonth]: { day: "2-digit", month: "short" },
        [LightweightCharts.TickMarkType.Time]: {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        },
        [LightweightCharts.TickMarkType.TimeWithSeconds]: {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        },
      };
      return formatLocalChartTime(time, locale, formats[tickMarkType]);
    },
  },
  localization: {
    locale: navigator.language,
    timeFormatter: (time) => formatLocalChartTime(time, navigator.language, {
      dateStyle: "short",
      timeStyle: "medium",
      hourCycle: "h23",
    }),
  },
});

const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
  upColor: "#089981",
  downColor: "#f23645",
  borderUpColor: "#089981",
  borderDownColor: "#f23645",
  wickUpColor: "#089981",
  wickDownColor: "#f23645",
});
const volumeSeries = chart.addSeries(
  LightweightCharts.HistogramSeries,
  {
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
    lastValueVisible: false,
    priceLineVisible: false,
  },
  1,
);
chart.panes()[1].setHeight(105);

function setVolumeVisible(visible) {
  if (visible) {
    volumeSeries.moveToPane(1);
    chart.panes()[1].setHeight(105);
    volumeSeries.applyOptions({ priceScaleId: "volume", visible: true });
  } else {
    volumeSeries.applyOptions({ priceScaleId: "right", visible: false });
    volumeSeries.moveToPane(0);
  }
  scheduleOrderBlockOverlayRender();
}

const orderBlockCanvas = document.createElement("canvas");
orderBlockCanvas.className = "order-block-overlay";
chartContainer.append(orderBlockCanvas);
const orderBlockContext = orderBlockCanvas.getContext("2d");
if (!orderBlockContext) {
  throw new Error("Could not initialize the order-block chart overlay.");
}

let candleData = [];
let volumeData = [];
let chartQuery = "";
let indicatorCandles = [];
let currentOrderBlocks = { internal: [], swing: [] };
let currentLiquiditySwings = { highs: [], lows: [] };
let replayIndex = -1;
let replayStartIndex = 0;
let replayTimer;
let loadRequestId = 0;
let liveSocket;
let liveCandleAggregator;
let orderBlockRenderFrame;
let chartPointerDown = false;
let isPickingReplayStart = false;
let isDraggingReplayStart = false;

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDefaultDates() {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 7);
  fromDateInput.value = localDateValue(fromDate);
  toDateInput.value = localDateValue(toDate);
}

function currentQueryKey() {
  return JSON.stringify([
    symbolInput.value.trim(),
    chartResolutionInput.value,
    fromDateInput.value,
    toDateInput.value,
  ]);
}

function hasCurrentChartData() {
  return candleData.length > 0 && chartQuery === currentQueryKey();
}

function formatNumber(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat(navigator.language, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(value)
    : "—";
}

function showCandleStats(candle, volume) {
  stats.open.textContent = formatNumber(candle?.open);
  stats.high.textContent = formatNumber(candle?.high);
  stats.low.textContent = formatNumber(candle?.low);
  stats.close.textContent = formatNumber(candle?.close);
  stats.volume.textContent = Number.isFinite(volume)
    ? new Intl.NumberFormat(navigator.language, {
      maximumFractionDigits: 0,
    }).format(volume)
    : "—";
}

function getVolumeColor(candle) {
  return candle.close >= candle.open
    ? "rgba(8, 153, 129, 0.45)"
    : "rgba(242, 54, 69, 0.45)";
}

function toCandlePoint(candle) {
  return {
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function toVolumePoint(candle) {
  return {
    time: candle.time,
    value: candle.volume,
    color: getVolumeColor(candle),
  };
}

function getOrderBlockCount(input) {
  const parsedCount = Number.parseInt(input.value, 10);
  return Number.isInteger(parsedCount)
    ? Math.min(20, Math.max(1, parsedCount))
    : 7;
}

function getLiquiditySwingPivotLookback() {
  const parsedLookback = Number.parseInt(liquiditySwingPivot.value, 10);
  return Number.isInteger(parsedLookback)
    ? Math.min(100, Math.max(1, parsedLookback))
    : DEFAULT_PIVOT_LOOKBACK;
}

function updateLiquiditySwingStatus() {
  if (!liquiditySwingEnabled.checked) {
    liquiditySwingStatus.textContent = "Liquidity swings: off";
  } else if (indicatorCandles.length === 0) {
    liquiditySwingStatus.textContent = "Liquidity swings: waiting for data";
  } else if (currentLiquiditySwings.highs.length === 0 && currentLiquiditySwings.lows.length === 0) {
    liquiditySwingStatus.textContent = "Liquidity swings: no confirmed pivots";
  } else {
    liquiditySwingStatus.textContent = `Liquidity swings: ${currentLiquiditySwings.highs.length} highs · ${
      currentLiquiditySwings.lows.length
    } lows · pivot ${getLiquiditySwingPivotLookback()}`;
  }
}

function updateReplayStartFromPointer(event) {
  const canvasBounds = orderBlockCanvas.getBoundingClientRect();
  const logicalIndex = chart.timeScale().coordinateToLogical(
    event.clientX - canvasBounds.left,
  );
  if (logicalIndex === null || candleData.length === 0) {
    return;
  }

  const index = Math.max(
    0,
    Math.min(candleData.length - 1, Math.round(logicalIndex)),
  );
  if (index !== replayStartIndex) {
    replayStartIndex = index;
    scheduleOrderBlockOverlayRender();
    updateReplayStatus();
  }
}

function setReplayStartPicking(enabled) {
  isPickingReplayStart = enabled && hasCurrentChartData() && replayIndex < 0;
  isDraggingReplayStart = false;
  orderBlockCanvas.classList.toggle(
    "is-picking-replay-start",
    isPickingReplayStart,
  );
  replayPickStart.textContent = isPickingReplayStart ? "Done" : "Pick start";
  replayPickStart.title = isPickingReplayStart
    ? "Finish choosing the replay start"
    : "Choose replay start by dragging on the chart";
  scheduleOrderBlockOverlayRender();
  updateReplayStatus();
  updateReplayControls();
}

function drawLiquiditySwings(plotWidth, paneHeight, timeScale, visibleRange) {
  const swings = [...currentLiquiditySwings.highs, ...currentLiquiditySwings.lows]
    .sort((left, right) => left.pivotTime - right.pivotTime);
  for (let index = 0; index < swings.length; index += 1) {
    const swing = swings[index];
    let start = timeScale.timeToCoordinate(swing.pivotTime);
    if (start === null) {
      if (visibleRange && swing.pivotTime < visibleRange.from) {
        start = 0;
      } else {
        continue;
      }
    }

    let end = plotWidth;
    let nextSwing;
    for (let nextIndex = index + 1; nextIndex < swings.length; nextIndex += 1) {
      if (swings[nextIndex].side === swing.side) {
        nextSwing = swings[nextIndex];
        break;
      }
    }
    if (nextSwing) {
      const nextStart = timeScale.timeToCoordinate(nextSwing.pivotTime);
      if (nextStart === null) {
        if (visibleRange && nextSwing.pivotTime < visibleRange.from) {
          continue;
        }
      } else {
        end = Math.min(end, nextStart);
      }
    }
    start = Math.max(0, Math.min(plotWidth, start));
    if (end <= start) {
      continue;
    }

    const level = candleSeries.priceToCoordinate(swing.level);
    const zoneTop = candleSeries.priceToCoordinate(swing.zoneTop);
    const zoneBottom = candleSeries.priceToCoordinate(swing.zoneBottom);
    if (level === null || zoneTop === null || zoneBottom === null) {
      continue;
    }

    const color = swing.side === "high" ? "#f23645" : "#089981";
    const boxTop = Math.max(0, Math.min(zoneTop, zoneBottom));
    const boxBottom = Math.min(paneHeight, Math.max(zoneTop, zoneBottom));
    const boxEnd = Math.min(end, start + 22);
    if (boxBottom > boxTop && boxEnd > start) {
      orderBlockContext.fillStyle = swing.side === "high"
        ? "rgba(242, 54, 69, 0.12)"
        : "rgba(8, 153, 129, 0.12)";
      orderBlockContext.fillRect(start, boxTop, boxEnd - start, boxBottom - boxTop);
    }

    if (level >= 0 && level <= paneHeight) {
      orderBlockContext.beginPath();
      orderBlockContext.setLineDash(swing.status === "broken" ? [4, 3] : []);
      orderBlockContext.strokeStyle = color;
      orderBlockContext.lineWidth = 1.2;
      orderBlockContext.moveTo(start, level);
      orderBlockContext.lineTo(end, level);
      orderBlockContext.stroke();
      orderBlockContext.setLineDash([]);

      const volume = swing.intersectionVolume || swing.pivotVolume;
      const volumeLabel = new Intl.NumberFormat(navigator.language, {
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(volume);
      orderBlockContext.fillStyle = color;
      orderBlockContext.font = "10px sans-serif";
      orderBlockContext.fillText(
        volumeLabel,
        Math.min(start + 3, plotWidth - 48),
        Math.max(10, Math.min(paneHeight - 3, level + (swing.side === "high" ? -5 : 12))),
      );
    }
  }
}

function renderOrderBlockOverlay() {
  const plotWidth = Math.floor(chart.timeScale().width());
  const paneHeight = Math.floor(chart.panes()[0].getHeight());
  if (plotWidth <= 0 || paneHeight <= 0) {
    return;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  const canvasWidth = Math.floor(plotWidth * pixelRatio);
  const canvasHeight = Math.floor(paneHeight * pixelRatio);
  if (orderBlockCanvas.width !== canvasWidth) {
    orderBlockCanvas.width = canvasWidth;
  }
  if (orderBlockCanvas.height !== canvasHeight) {
    orderBlockCanvas.height = canvasHeight;
  }
  if (orderBlockCanvas.style.width !== `${plotWidth}px`) {
    orderBlockCanvas.style.width = `${plotWidth}px`;
  }
  if (orderBlockCanvas.style.height !== `${paneHeight}px`) {
    orderBlockCanvas.style.height = `${paneHeight}px`;
  }
  orderBlockContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  orderBlockContext.clearRect(0, 0, plotWidth, paneHeight);

  const timeScale = chart.timeScale();
  const visibleRange = timeScale.getVisibleRange();
  const palettes = {
    internal: {
      bullish: { fill: "rgba(49, 121, 245, 0.18)", line: "rgba(49, 121, 245, 0.65)" },
      bearish: { fill: "rgba(247, 124, 128, 0.18)", line: "rgba(247, 124, 128, 0.65)" },
    },
    swing: {
      bullish: { fill: "rgba(24, 72, 204, 0.20)", line: "rgba(24, 72, 204, 0.75)" },
      bearish: { fill: "rgba(178, 40, 51, 0.20)", line: "rgba(178, 40, 51, 0.75)" },
    },
  };

  if (liquiditySwingEnabled.checked) {
    drawLiquiditySwings(plotWidth, paneHeight, timeScale, visibleRange);
  }

  const zones = [...currentOrderBlocks.swing, ...currentOrderBlocks.internal].reverse();
  for (const zone of zones) {
    let left = timeScale.timeToCoordinate(zone.time);
    if (left === null) {
      if (visibleRange && zone.time < visibleRange.from) {
        left = 0;
      } else {
        continue;
      }
    }

    const topCoordinate = candleSeries.priceToCoordinate(zone.top);
    const bottomCoordinate = candleSeries.priceToCoordinate(zone.bottom);
    if (topCoordinate === null || bottomCoordinate === null) {
      continue;
    }

    const top = Math.max(0, Math.min(topCoordinate, bottomCoordinate));
    const bottom = Math.min(paneHeight, Math.max(topCoordinate, bottomCoordinate));
    const right = Math.min(plotWidth, Math.max(0, left));
    if (bottom <= top || right >= plotWidth) {
      continue;
    }

    const palette = palettes[zone.kind][zone.bias === 1 ? "bullish" : "bearish"];
    orderBlockContext.fillStyle = palette.fill;
    orderBlockContext.fillRect(right, top, plotWidth - right, bottom - top);
    if (zone.kind === "swing") {
      orderBlockContext.strokeStyle = palette.line;
      orderBlockContext.strokeRect(right, top, plotWidth - right, bottom - top);
    }
  }

  if (replayIndex < 0 && hasCurrentChartData()) {
    const startCandle = candleData[replayStartIndex];
    const startX = startCandle
      ? timeScale.timeToCoordinate(startCandle.time)
      : null;
    if (startX !== null && startX >= 0 && startX <= plotWidth) {
      orderBlockContext.beginPath();
      orderBlockContext.setLineDash([5, 4]);
      orderBlockContext.strokeStyle = "#f5c542";
      orderBlockContext.lineWidth = 1.5;
      orderBlockContext.moveTo(startX, 0);
      orderBlockContext.lineTo(startX, paneHeight);
      orderBlockContext.stroke();
      orderBlockContext.setLineDash([]);
      orderBlockContext.fillStyle = "#f5c542";
      orderBlockContext.font = "11px sans-serif";
      orderBlockContext.fillText("REPLAY START", Math.min(startX + 6, plotWidth - 86), 16);
    }
  }
}

function scheduleOrderBlockOverlayRender() {
  if (orderBlockRenderFrame !== undefined) {
    return;
  }

  orderBlockRenderFrame = requestAnimationFrame(() => {
    orderBlockRenderFrame = undefined;
    renderOrderBlockOverlay();
  });
}

function refreshOrderBlocks(candles = indicatorCandles) {
  indicatorCandles = candles.map((candle, index) => {
    const volume = volumeData[index]?.value;
    if (!Number.isFinite(volume)) {
      throw new Error(`Missing volume for chart candle ${index + 1}.`);
    }
    return { ...candle, volume };
  });
  currentOrderBlocks = calculateOrderBlocks(indicatorCandles, {
    internalEnabled: internalOrderBlocksEnabled.checked,
    swingEnabled: swingOrderBlocksEnabled.checked,
    internalCount: getOrderBlockCount(internalOrderBlocksCount),
    swingCount: getOrderBlockCount(swingOrderBlocksCount),
  });
  currentLiquiditySwings = liquiditySwingEnabled.checked
    ? findLiquiditySwings(indicatorCandles, getLiquiditySwingPivotLookback())
    : { highs: [], lows: [] };
  updateLiquiditySwingStatus();
  scheduleOrderBlockOverlayRender();
}

async function fetchFyersCandles() {
  const params = new URLSearchParams({
    symbol: symbolInput.value.trim(),
    resolution: chartResolutionInput.value,
    date_format: "1",
    range_from: fromDateInput.value,
    range_to: toDateInput.value,
  });
  const response = await fetch(`${historyEndpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? `Fyers request failed with HTTP ${response.status}.`);
  }
  if (body.s !== "ok") {
    throw new Error(body.message ?? "Fyers did not return historical candles for this range.");
  }
  return mapFyersCandles(body.candles);
}

function setChartData(candles, volumes) {
  candleSeries.setData(candles);
  volumeSeries.setData(volumes);
  chart.timeScale().fitContent();
  refreshOrderBlocks(candles);
  showCandleStats(candles.at(-1), volumes.at(-1)?.value);
}

function setChartStatus(message, state = "") {
  chartStatus.textContent = message;
  chartStatus.dataset.state = state;
}

function setLiveStatus(message, state = "") {
  chartLiveStatus.textContent = message;
  chartLiveStatus.dataset.state = state;
  updateCandleCountdown();
}

function updateCandleCountdown() {
  let timeRemaining = "--:--";
  if (
    hasCurrentChartData() &&
    replayIndex < 0 &&
    chartLiveStatus.dataset.state === "live"
  ) {
    const intervalSeconds = Number(chartResolutionInput.value) * 60;
    const secondsIntoCandle = Math.floor(Date.now() / 1000) % intervalSeconds;
    const remainingSeconds = intervalSeconds - secondsIntoCandle;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    timeRemaining = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  chartCandleCountdown.textContent = `Candle closes in ${timeRemaining}`;
}

function disconnectLiveFeed(status = "Live feed off") {
  const socket = liveSocket;
  liveSocket = undefined;
  liveCandleAggregator = undefined;
  if (socket && socket.readyState < WebSocket.CLOSING) {
    socket.close();
  }
  setLiveStatus(status);
}

function getCurrentDayHistoricalVolume() {
  const today = localDateValue(new Date());
  return candleData.reduce((total, candle, index) => (
    localDateValue(new Date(candle.time * 1000)) === today
      ? total + (volumeData[index]?.value ?? 0)
      : total
  ), 0);
}

function applyLiveTick(tick) {
  if (
    !liveCandleAggregator ||
    replayIndex >= 0 ||
    !hasCurrentChartData() ||
    tick.symbol !== symbolInput.value.trim()
  ) {
    return;
  }

  const update = liveCandleAggregator.update(tick);
  if (!update) {
    return;
  }

  const candleIndex = candleData.length - 1;
  if (update.isNewBar) {
    candleData.push(update.candle);
    volumeData.push(toVolumePoint(update.candle));
  } else {
    candleData[candleIndex] = update.candle;
    volumeData[candleIndex] = toVolumePoint(update.candle);
  }

  candleSeries.update(toCandlePoint(update.candle));
  volumeSeries.update(volumeData.at(-1));
  showCandleStats(update.candle, update.candle.volume);
  if (update.isNewBar) {
    chartCandleCount.textContent = `${candleData.length.toLocaleString()} ${getMinuteIntervalLabel()} candles`;
    refreshOrderBlocks(candleData);
  }
  setLiveStatus("Live feed active", "live");
}

function connectLiveFeed() {
  disconnectLiveFeed("Connecting to live feed…");
  if (!hasCurrentChartData()) {
    return;
  }
  if (toDateInput.value !== localDateValue(new Date())) {
    setLiveStatus("Set To to today for live candles");
    return;
  }

  liveCandleAggregator = createLiveCandleAggregator(
    chartResolutionInput.value,
    {
      ...candleData.at(-1),
      volume: volumeData.at(-1)?.value ?? 0,
    },
    getCurrentDayHistoricalVolume(),
  );
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  let socket;
  try {
    socket = new WebSocket(`${protocol}//${location.host}/api/live-chart`);
  } catch {
    setLiveStatus("Could not start live feed connection", "error");
    return;
  }
  liveSocket = socket;
  let feedErrorReceived = false;

  socket.addEventListener("open", () => {
    if (liveSocket !== socket) {
      return;
    }
    socket.send(JSON.stringify({
      type: "subscribe",
      symbol: symbolInput.value.trim(),
      resolution: chartResolutionInput.value,
    }));
  });
  socket.addEventListener("message", (event) => {
    if (liveSocket !== socket) {
      return;
    }
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      setLiveStatus("Invalid live feed message", "error");
      return;
    }
    if (message.type === "status") {
      setLiveStatus(
        message.status === "subscribed"
          ? "Live feed connected"
          : `Live feed ${message.status}`,
        message.status === "subscribed" ? "live" : "",
      );
    } else if (message.type === "tick") {
      applyLiveTick(message.data);
    } else if (message.type === "error") {
      feedErrorReceived = true;
      setLiveStatus(message.message, "error");
    }
  });
  socket.addEventListener("error", () => {
    if (liveSocket === socket) {
      feedErrorReceived = true;
      setLiveStatus("Live feed connection error", "error");
    }
  });
  socket.addEventListener("close", () => {
    if (liveSocket === socket && !feedErrorReceived) {
      setLiveStatus("Live feed disconnected");
    }
  });
}

function stopReplayTimer() {
  if (replayTimer !== undefined) {
    clearInterval(replayTimer);
    replayTimer = undefined;
  }
  replayPlay.textContent = "Play";
}

function restoreChart() {
  if (hasCurrentChartData()) {
    setChartData(candleData, volumeData);
    chartTitleInterval.textContent = `${getMinuteIntervalLabel()} default chart`;
  } else {
    setChartData([], []);
  }
}

function resetReplaySession() {
  stopReplayTimer();
  setReplayStartPicking(false);
  replayIndex = -1;
  restoreChart();
  updateReplayStatus();
  updateReplayControls();
}

function updateReplayControls() {
  const loaded = hasCurrentChartData();
  const replaying = replayIndex >= 0;
  replayPickStart.disabled = !loaded || replaying;
  replayStart.disabled = !loaded || replaying || isPickingReplayStart;
  replayPrevious.disabled = !replaying || replayIndex <= 0;
  replayNext.disabled = !replaying || replayIndex >= candleData.length - 1;
  replayPlay.disabled = !replaying || replayIndex >= candleData.length - 1;
  replaySpeed.disabled = !replaying;
  replayExit.disabled = !replaying;
}

function updateReplayStatus() {
  if (replayIndex < 0) {
    if (!hasCurrentChartData()) {
      replayStatus.textContent = `Load ${getMinuteIntervalLabel()} chart data before starting replay.`;
    } else if (isPickingReplayStart) {
      const candle = candleData[replayStartIndex];
      replayStatus.textContent = `Drag across the chart to choose the replay start bar, then click Done. Current: bar ${
        replayStartIndex + 1
      } of ${candleData.length}${
        candle ? ` · ${new Date(candle.time * 1000).toLocaleString()}` : ""
      }`;
    } else {
      const candle = candleData[replayStartIndex];
      replayStatus.textContent = `Replay starts at bar ${replayStartIndex + 1} of ${candleData.length}${
        candle ? ` · ${new Date(candle.time * 1000).toLocaleString()}` : ""
      }. Drag the start marker to change it.`;
    }
    return;
  }

  const candle = candleData[replayIndex];
  replayStatus.textContent = `${getMinuteIntervalLabel()} bar ${replayIndex + 1} of ${candleData.length} · ${
    new Date(candle.time * 1000).toLocaleString()
  }`;
}

function updateReplayView(index, visibleRange = chart.timeScale().getVisibleLogicalRange()) {
  replayIndex = index;
  const visibleCandles = candleData.slice(0, replayIndex + 1);
  const visibleVolumes = volumeData.slice(0, replayIndex + 1);
  candleSeries.setData(visibleCandles);
  volumeSeries.setData(visibleVolumes);
  if (visibleRange) {
    chart.timeScale().setVisibleLogicalRange(visibleRange);
  } else {
    chart.timeScale().fitContent();
  }
  refreshOrderBlocks(visibleCandles);
  showCandleStats(candleData[replayIndex], volumeData[replayIndex]?.value);
  updateReplayStatus();
  updateReplayControls();
}

function startReplay() {
  if (!hasCurrentChartData()) {
    return;
  }

  disconnectLiveFeed("Live feed paused during replay");
  stopReplayTimer();
  setReplayStartPicking(false);
  chartTitleInterval.textContent = `${getMinuteIntervalLabel()} bar replay`;
  updateReplayView(replayStartIndex);
}

function advanceReplay() {
  if (replayIndex >= candleData.length - 1) {
    stopReplayTimer();
    updateReplayControls();
    return;
  }

  replayIndex += 1;
  candleSeries.update(candleData[replayIndex]);
  volumeSeries.update(volumeData[replayIndex]);
  const visibleRange = chart.timeScale().getVisibleLogicalRange();
  if (visibleRange && replayIndex > visibleRange.to - 4) {
    const shift = replayIndex - (visibleRange.to - 4);
    chart.timeScale().setVisibleLogicalRange({
      from: visibleRange.from + shift,
      to: visibleRange.to + shift,
    });
  }
  refreshOrderBlocks(candleData.slice(0, replayIndex + 1));
  showCandleStats(candleData[replayIndex], volumeData[replayIndex].value);
  updateReplayStatus();
  updateReplayControls();
  if (replayIndex >= candleData.length - 1) {
    stopReplayTimer();
  }
}

function invalidateChartData() {
  disconnectLiveFeed();
  loadRequestId += 1;
  loadButton.disabled = false;
  setReplayStartPicking(false);
  candleData = [];
  volumeData = [];
  replayStartIndex = 0;
  chartQuery = "";
  resetReplaySession();
  chartCandleCount.textContent = "No chart data loaded";
  chartTitleSymbol.textContent = symbolInput.value.trim();
  chartTitleInterval.textContent = `${getMinuteIntervalLabel()} default chart`;
  loadButton.textContent = `Load ${getChartIntervalLabel()} chart`;
  setChartStatus(`Inputs changed. Load the ${getMinuteIntervalLabel()} chart data again.`);
  updateReplayControls();
}

async function loadChart() {
  disconnectLiveFeed();
  const requestId = ++loadRequestId;
  const queryKey = currentQueryKey();
  resetReplaySession();
  candleData = [];
  volumeData = [];
  chartQuery = "";
  setChartData([], []);
  updateReplayControls();
  setChartStatus(`Loading ${getMinuteIntervalLabel()} Fyers chart data…`);
  chartCandleCount.textContent = `Loading ${getMinuteIntervalLabel()} chart data…`;
  loadButton.disabled = true;

  try {
    const candles = await fetchFyersCandles();
    if (requestId !== loadRequestId) {
      return;
    }
    if (candles.length === 0) {
      throw new Error(`Fyers returned no ${getMinuteIntervalLabel()} candles for this symbol and date range.`);
    }

    candleData = candles.map(toCandlePoint);
    volumeData = candles.map(toVolumePoint);
    replayStartIndex = Math.min(19, candleData.length - 1);
    chartQuery = queryKey;
    setChartData(candleData, volumeData);
    chartTitleSymbol.textContent = symbolInput.value.trim();
    chartTitleInterval.textContent = `${getMinuteIntervalLabel()} default chart`;
    chartCandleCount.textContent = `${candleData.length.toLocaleString()} ${getMinuteIntervalLabel()} candles`;
    setChartStatus(`${getMinuteIntervalLabel()} chart data loaded`, "success");
    connectLiveFeed();
    updateReplayStatus();
    updateReplayControls();
  } catch (error) {
    if (requestId !== loadRequestId) {
      return;
    }
    candleData = [];
    volumeData = [];
    chartQuery = "";
    setChartData([], []);
    chartCandleCount.textContent = "No chart data loaded";
    setChartStatus(error.message, "error");
    updateReplayStatus();
    updateReplayControls();
  } finally {
    if (requestId === loadRequestId) {
      loadButton.disabled = false;
    }
  }
}

form.addEventListener("input", invalidateChartData);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadChart();
});
chartResolutionInput.addEventListener("input", updateQuickIntervalButtons);
for (const button of quickIntervalButtons) {
  button.addEventListener("click", () => {
    chartResolutionInput.value = button.dataset.resolution;
    updateQuickIntervalButtons();
    loadChart();
  });
}
replayStart.addEventListener("click", startReplay);
replayPickStart.addEventListener("click", () => {
  setReplayStartPicking(!isPickingReplayStart);
});
replayPrevious.addEventListener("click", () => {
  stopReplayTimer();
  if (replayIndex > 0) {
    updateReplayView(replayIndex - 1);
  }
});
replayNext.addEventListener("click", () => {
  stopReplayTimer();
  advanceReplay();
});
replayPlay.addEventListener("click", () => {
  if (replayTimer !== undefined) {
    stopReplayTimer();
    return;
  }
  replayPlay.textContent = "Pause";
  replayTimer = setInterval(
    advanceReplay,
    Math.max(50, 1000 / Number(replaySpeed.value)),
  );
});
replaySpeed.addEventListener("change", () => {
  if (replayTimer !== undefined) {
    stopReplayTimer();
    replayPlay.click();
  }
});
replayExit.addEventListener("click", loadChart);
volumeEnabled.addEventListener("change", () => {
  setVolumeVisible(volumeEnabled.checked);
});

chart.subscribeCrosshairMove((parameter) => {
  const candle = parameter.seriesData.get(candleSeries);
  const volume = parameter.seriesData.get(volumeSeries);
  if (candle) {
    const candleIndex = candleData.findIndex((item) => item.time === candle.time);
    showCandleStats(candle, volume?.value ?? volumeData[candleIndex]?.value);
  } else if (replayIndex >= 0) {
    showCandleStats(candleData[replayIndex], volumeData[replayIndex]?.value);
  } else {
    showCandleStats(candleData.at(-1), volumeData.at(-1)?.value);
  }
});

for (const setting of [
  internalOrderBlocksEnabled,
  internalOrderBlocksCount,
  swingOrderBlocksEnabled,
  swingOrderBlocksCount,
  liquiditySwingEnabled,
  liquiditySwingPivot,
]) {
  setting.addEventListener("input", () => refreshOrderBlocks(indicatorCandles));
}

chart.timeScale().subscribeVisibleTimeRangeChange(scheduleOrderBlockOverlayRender);
new ResizeObserver(scheduleOrderBlockOverlayRender).observe(chartContainer);
chartContainer.addEventListener("pointerdown", () => {
  chartPointerDown = true;
});
chartContainer.addEventListener("pointermove", () => {
  if (chartPointerDown) {
    scheduleOrderBlockOverlayRender();
  }
});
orderBlockCanvas.addEventListener("pointerdown", (event) => {
  if (!isPickingReplayStart) {
    return;
  }
  isDraggingReplayStart = true;
  orderBlockCanvas.setPointerCapture(event.pointerId);
  updateReplayStartFromPointer(event);
});
orderBlockCanvas.addEventListener("pointermove", (event) => {
  if (isDraggingReplayStart) {
    updateReplayStartFromPointer(event);
  }
});
for (const eventName of ["pointerup", "pointercancel"]) {
  window.addEventListener(eventName, () => {
    isDraggingReplayStart = false;
    if (chartPointerDown) {
      chartPointerDown = false;
      scheduleOrderBlockOverlayRender();
    }
  });
}
setDefaultDates();
updateReplayControls();
updateReplayStatus();
updateCandleCountdown();
setInterval(updateCandleCountdown, 1000);
