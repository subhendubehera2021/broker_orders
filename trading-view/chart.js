import { findLiquiditySwings } from "/trading-view/liquidity-swings.js";
import { formatIndiaAxisTick, formatIndiaTime } from "/trading-view/time-format.js";
import {
  calculateDemoPnl,
  DEMO_LOT_SIZE,
  demoFillPrice,
  isDemoOrderTriggered,
} from "/trading-view/demo-trading.js";

const { CrosshairMode, LineStyle, TickMarkType, createChart } = window.LightweightCharts;
const main = document.querySelector("main");
const chartColors = {
  background: "#0f0f0f",
  text: "#787b86",
  grid: "#1b1b1b",
  border: "#2b2b2b",
  up: "#089981",
  down: "#f23645",
  upVolume: "rgba(8, 153, 129, 0.35)",
  downVolume: "rgba(242, 54, 69, 0.35)",
  drawing: "#2962ff",
  liquidityZoneTop: "rgba(8, 153, 129, 0.24)",
  liquidityZoneBottom: "rgba(8, 153, 129, 0.08)",
};
const chartElement = document.querySelector("#chart");
const chartWrap = document.querySelector("#chart-wrap");
const chartMessage = document.querySelector("#chart-message");
const chartMessageText = document.querySelector("#chart-message-text");
const chartLogin = document.querySelector("#chart-login");
const symbolInput = document.querySelector("#symbol");
const rangeSelect = document.querySelector("#range");
const optionChainToggle = document.querySelector("#nifty-options-toggle");
const optionChainModal = document.querySelector("#option-chain-modal");
const optionChainPanel = document.querySelector("#option-chain-panel");
const optionChainStatus = document.querySelector("#option-chain-status");
const optionChainRows = document.querySelector("#option-chain-rows");
const optionExpirySelect = document.querySelector("#option-expiry");
const swingToggle = document.querySelector("#swing-toggle");
const indicatorsToggle = document.querySelector("#indicators-toggle");
const indicatorPopover = document.querySelector("#indicator-popover");
const drawToggle = document.querySelector("#draw-toggle");
const drawPopover = document.querySelector("#draw-popover");
const lookbackSlider = document.querySelector("#lookback");
const lookbackValue = document.querySelector("#lookback-value");
const fullscreenToggle = document.querySelector("#fullscreen-toggle");
const fullscreenStatus = document.querySelector("#fullscreen-status");
const connectionStatus = document.querySelector("#connection-status");
const feedStatus = document.querySelector("#feed-status");
const priceActionTrigger = document.querySelector("#price-action-trigger");
const priceActionMenu = document.querySelector("#price-action-menu");
const priceActionNotice = document.querySelector("#price-action-notice");
const swingHighActionTrigger = document.querySelector("#swing-high-action-trigger");
const demoModeToggle = document.querySelector("#demo-mode-toggle");
const demoTradingControls = document.querySelector("#demo-trading-controls");
const demoBuyButton = document.querySelector("#demo-buy-button");
const demoSellButton = document.querySelector("#demo-sell-button");
const demoOrderLayer = document.querySelector("#demo-order-layer");
const demoTradeStatus = document.querySelector("#demo-trade-status");
const demoPnlSummary = document.querySelector("#demo-pnl-summary");
const priceAlertLabel = document.querySelector("#price-alert-label");
const priceSellLabel = document.querySelector("#price-sell-label");
const priceBuyLabel = document.querySelector("#price-buy-label");
const priceOrderLabel = document.querySelector("#price-order-label");
const priceLineLabel = document.querySelector("#price-line-label");
const orderPreviewModal = document.querySelector("#order-preview-modal");
const orderPreviewTitle = document.querySelector("#order-preview-title");
const orderPreviewSymbol = document.querySelector("#order-preview-symbol");
const orderPreviewQuantity = document.querySelector("#order-preview-quantity");
const orderPreviewType = document.querySelector("#order-preview-type");
const orderPreviewPrice = document.querySelector("#order-preview-price");
const orderPreviewNotice = document.querySelector("#order-preview-notice");
const orderPreviewSubmit = document.querySelector("#submit-order-preview");
const intervalSeconds = { "1": 60, "2": 120, "3": 180, "5": 300, "15": 900, "60": 3600, D: 86400 };
const livePriceLabelHeight = 18;
const liveCountdownHeight = 20;
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
let currentResolution = "1";
let chartType = "candles";
let activeTool = "cursor";
let pendingTrendStart;
let drawings = [];
let swingSeries = [];
let swingMarkers = [];
let activeSwings = [];
let quoteTimer;
let countdownTimer;
let quoteInFlight = false;
let liveSocket;
let socketConnected = false;
let socketTransportConnected = false;
let subscribedSymbol;
let activeChartSymbol;
let socketConnectionPromise;
let socketGeneration = 0;
let lastQuoteVolume;
let loadSequence = 0;
let optionChainSequence = 0;
let crosshairPrice;
let crosshairY;
let priceActionMenuTrigger = priceActionTrigger;
let orderPreviewSide = "Buy";
let demoOrders = [];
let nextDemoOrderId = 1;
let demoOrderSymbol;
let demoPositions = [];
let demoRealizedPnl = 0;

function activePriceSeries() {
  return chartType === "candles" ? candleSeries : barSeries;
}

function formatActionPrice(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
    : "—";
}

function updateDemoTradeButtons() {
  const symbol = symbolInput.value.trim().toUpperCase();
  const canPlaceOrder =
    demoModeToggle.checked && candles.length > 0 && Boolean(activeChartSymbol) && activeChartSymbol === symbol;
  demoBuyButton.disabled = !canPlaceOrder;
  demoSellButton.disabled = !canPlaceOrder;
}

function formatDemoPnl(value) {
  return `${value < 0 ? "-" : "+"}₹${formatActionPrice(Math.abs(value))}`;
}

function updateDemoPnlSummary(symbol = activeChartSymbol) {
  const openPnl = demoPositions
    .filter((position) => position.symbol === symbol)
    .reduce((total, position) => total + position.pnl, 0);
  demoPnlSummary.textContent =
    `Open P/L ${formatDemoPnl(openPnl)} · Realized ${formatDemoPnl(demoRealizedPnl)}`;
  demoPnlSummary.dataset.pnl = openPnl > 0 ? "positive" : openPnl < 0 ? "negative" : "flat";
}

function updateDemoOrderPositions() {
  const occupiedWidgetPositions = [];
  for (const item of [...demoOrders, ...demoPositions]) {
    if (!candles.length || item.symbol !== activeChartSymbol) {
      item.row.hidden = true;
      continue;
    }

    const price = "entryPrice" in item ? item.entryPrice : item.price;
    const y = activePriceSeries().priceToCoordinate(price);
    if (!Number.isFinite(y)) {
      item.row.hidden = true;
      continue;
    }

    const minY = 24;
    const maxY = Math.max(minY, chartElement.clientHeight - 24);
    const lineY = Math.max(minY, Math.min(y, maxY));
    let widgetOffset = 0;
    if (occupiedWidgetPositions.length) {
      for (let distance = 28; distance <= chartElement.clientHeight; distance += 28) {
        const down = lineY + distance;
        const up = lineY - distance;
        if (
          down <= maxY &&
          occupiedWidgetPositions.every((position) => Math.abs(position - down) >= 28)
        ) {
          widgetOffset = distance;
          break;
        }
        if (
          up >= minY &&
          occupiedWidgetPositions.every((position) => Math.abs(position - up) >= 28)
        ) {
          widgetOffset = -distance;
          break;
        }
      }
    }
    item.row.style.top = `${lineY}px`;
    item.widget.style.setProperty("--demo-widget-offset", `${widgetOffset}px`);
    occupiedWidgetPositions.push(lineY + widgetOffset);
    item.row.hidden = false;
  }
}

function clearDemoOrders(message = "") {
  const count = demoOrders.length;
  for (const order of demoOrders) order.row.remove();
  demoOrders = [];
  demoOrderSymbol = undefined;
  updateDemoOrderPositions();
  if (message && count) demoTradeStatus.textContent = message;
  return count;
}

function cancelDemoOrder(id) {
  const index = demoOrders.findIndex((order) => order.id === id);
  if (index === -1) return;
  const [order] = demoOrders.splice(index, 1);
  order.row.remove();
  if (!demoOrders.length) demoOrderSymbol = undefined;
  updateDemoOrderPositions();
  demoTradeStatus.textContent =
    `Demo ${order.side} ${order.type.toLowerCase()} order for ${DEMO_LOT_SIZE} units at ₹${formatActionPrice(order.price)} canceled. No live order was affected.`;
}

function placeDemoOrder(side, requestedPrice = crosshairPrice, type = "Limit") {
  const symbol = symbolInput.value.trim().toUpperCase();
  if (!demoModeToggle.checked || !candles.length || !symbol || symbol !== activeChartSymbol) return;
  const price = Number.isFinite(requestedPrice) ? requestedPrice : candles.at(-1)?.close;
  if (!Number.isFinite(price) || price <= 0) return;

  const order = {
    id: nextDemoOrderId++,
    side,
    type,
    price: Math.round(price * 100) / 100,
    symbol,
  };
  demoOrderSymbol = order.symbol;
  const row = document.createElement("div");
  row.className = "demo-order-row";
  row.dataset.side = side;
  const widget = document.createElement("div");
  widget.className = "demo-order-widget";
  const dragButton = document.createElement("button");
  dragButton.className = "demo-order-drag";
  dragButton.type = "button";
  const cancelButton = document.createElement("button");
  cancelButton.className = "demo-order-cancel";
  cancelButton.type = "button";
  cancelButton.textContent = "×";
  cancelButton.addEventListener("click", () => cancelDemoOrder(order.id));
  let dragPointerId;

  dragButton.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragPointerId = event.pointerId;
    dragButton.setPointerCapture(event.pointerId);
  });
  dragButton.addEventListener("pointermove", (event) => {
    if (event.pointerId !== dragPointerId) return;
    event.preventDefault();
    const y = event.clientY - chartElement.getBoundingClientRect().top;
    const nextPrice = activePriceSeries().coordinateToPrice(y);
    if (Number.isFinite(nextPrice) && nextPrice > 0) {
      order.price = Math.round(nextPrice * 100) / 100;
      updateDemoOrder(order);
    }
  });
  const stopDragging = (event) => {
    if (event.pointerId === dragPointerId) dragPointerId = undefined;
  };
  dragButton.addEventListener("pointerup", stopDragging);
  dragButton.addEventListener("pointercancel", stopDragging);
  dragButton.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    order.price = Math.max(0.01, Math.round(
      (order.price + (event.key === "ArrowUp" ? 0.01 : -0.01)) * 100,
    ) / 100);
    updateDemoOrder(order);
  });
  widget.append(dragButton, cancelButton);
  row.append(widget);
  order.row = row;
  order.widget = widget;
  order.dragButton = dragButton;
  order.cancelButton = cancelButton;
  demoOrders.push(order);
  demoOrderLayer.append(row);
  updateDemoOrder(order);
  demoTradeStatus.textContent =
    `Demo ${side} ${type.toLowerCase()} order for ${DEMO_LOT_SIZE} units (1 lot) added at ₹${formatActionPrice(order.price)}. Drag the price tag to adjust it or use × to cancel. No order was sent.`;
}

function updateDemoOrder(order) {
  const orderType = order.type.toLowerCase();
  order.dragButton.textContent =
    `${order.side.toUpperCase()} ${orderType.toUpperCase()} · ${DEMO_LOT_SIZE} qty · ₹${formatActionPrice(order.price)}`;
  order.dragButton.setAttribute(
    "aria-label",
    `Move demo ${order.side} ${orderType} order for ${DEMO_LOT_SIZE} units at ₹${formatActionPrice(order.price)}. Use the up and down arrow keys to adjust the price.`,
  );
  order.cancelButton.setAttribute(
    "aria-label",
    `Cancel demo ${order.side} ${orderType} order for ${DEMO_LOT_SIZE} units at ₹${formatActionPrice(order.price)}`,
  );
  updateDemoOrderPositions();
}

function updateDemoPositionPnl(symbol, marketPrice) {
  for (const position of demoPositions) {
    if (position.symbol !== symbol) continue;
    const pnl = calculateDemoPnl(position.side, position.entryPrice, marketPrice, position.quantity);
    if (!Number.isFinite(pnl)) continue;
    position.currentPrice = marketPrice;
    position.pnl = pnl;
    position.pnlLabel.textContent = `P/L ${formatDemoPnl(pnl)}`;
    position.pnlLabel.dataset.pnl = pnl > 0 ? "positive" : pnl < 0 ? "negative" : "flat";
    position.closeButton.setAttribute(
      "aria-label",
      `Close demo ${position.side} position at ₹${formatActionPrice(marketPrice)}. Current P/L ${formatDemoPnl(pnl)}.`,
    );
  }
  updateDemoPnlSummary(symbol);
  updateDemoOrderPositions();
}

function closeDemoPosition(id) {
  const index = demoPositions.findIndex((position) => position.id === id);
  if (index === -1) return;
  const [position] = demoPositions.splice(index, 1);
  demoRealizedPnl += position.pnl;
  position.row.remove();
  updateDemoPnlSummary();
  updateDemoOrderPositions();
  demoTradeStatus.textContent =
    `Demo ${position.side} position closed. Realized P/L ${formatDemoPnl(position.pnl)} for ${position.quantity} units.`;
}

function createDemoPosition(order, marketPrice) {
  const entryPrice = demoFillPrice(order, marketPrice);
  if (!Number.isFinite(entryPrice)) return;
  const position = {
    id: order.id,
    symbol: order.symbol,
    side: order.side,
    entryPrice,
    currentPrice: marketPrice,
    quantity: DEMO_LOT_SIZE,
    pnl: calculateDemoPnl(order.side, entryPrice, marketPrice, DEMO_LOT_SIZE) ?? 0,
  };
  const row = document.createElement("div");
  row.className = "demo-order-row";
  row.dataset.side = position.side;
  const widget = document.createElement("div");
  widget.className = "demo-order-widget";
  const summary = document.createElement("span");
  summary.className = "demo-position-summary";
  summary.textContent =
    `${position.side.toUpperCase()} ${position.quantity} qty (1 lot) · Entry ₹${formatActionPrice(entryPrice)}`;
  const pnlLabel = document.createElement("span");
  pnlLabel.className = "demo-position-pnl";
  const closeButton = document.createElement("button");
  closeButton.className = "demo-position-close";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => closeDemoPosition(position.id));
  widget.append(summary, pnlLabel, closeButton);
  row.append(widget);
  position.row = row;
  position.widget = widget;
  position.pnlLabel = pnlLabel;
  position.closeButton = closeButton;
  demoPositions.push(position);
  demoOrderLayer.append(row);
  updateDemoPositionPnl(order.symbol, marketPrice);
}

function processDemoOrderFills(symbol, marketPrice) {
  if (!demoModeToggle.checked) return;
  const remaining = [];
  const filled = [];
  for (const order of demoOrders) {
    if (order.symbol === symbol && isDemoOrderTriggered(order, marketPrice)) filled.push(order);
    else remaining.push(order);
  }
  demoOrders = remaining;
  if (!demoOrders.length) demoOrderSymbol = undefined;
  for (const order of filled) {
    order.row.remove();
    createDemoPosition(order, marketPrice);
  }
  if (filled.length) {
    demoTradeStatus.textContent =
      `${filled.length} demo order${filled.length === 1 ? "" : "s"} filled at the market quote. Open P/L is now displayed on the chart.`;
  }
}

function priceActionInstrumentName() {
  const symbol = symbolInput.value.trim().toUpperCase();
  if (/^NSE:NIFTY\d*-INDEX$/.test(symbol)) return "NIFTY";
  return symbol.split(":").at(-1)?.replace(/-(INDEX|EQ)$/, "") || symbol;
}

function updatePriceActionLabels() {
  const instrument = priceActionInstrumentName();
  const price = formatActionPrice(crosshairPrice);
  priceAlertLabel.textContent = `Add alert on ${instrument} at ${price}`;
  priceSellLabel.textContent = demoModeToggle.checked
    ? `Place demo sell limit at ${price}`
    : `Sell 1 ${instrument} @ ${price} limit`;
  priceBuyLabel.textContent = demoModeToggle.checked
    ? `Place demo buy stop at ${price}`
    : `Buy 1 ${instrument} @ ${price} stop`;
  priceOrderLabel.textContent = demoModeToggle.checked
    ? `Place demo buy limit at ${price}`
    : `Add order on ${instrument} at ${price}...`;
  priceLineLabel.textContent = `Draw horizontal line at ${price}`;
}

function updatePriceActionPosition(y) {
  if (!candles.length || !Number.isFinite(y) || y < 0 || y > chartElement.clientHeight - 30) return;
  const price = activePriceSeries().coordinateToPrice(y);
  if (!Number.isFinite(price)) return;

  crosshairPrice = price;
  crosshairY = y;
  priceActionTrigger.style.top = `${y}px`;
  priceActionTrigger.hidden = false;
  if (!priceActionMenu.hidden) priceActionMenu.style.top = `${y}px`;
  updatePriceActionLabels();
}

function updateLatestSwingActionTrigger() {
  const latestSwingHigh = activeSwings.filter((swing) => swing.side === "high").at(-1);
  if (!swingToggle.checked || !latestSwingHigh) {
    swingHighActionTrigger.hidden = true;
    return;
  }

  const startX = chart.timeScale().timeToCoordinate(latestSwingHigh.startTime);
  const endX = chart.timeScale().timeToCoordinate(latestSwingHigh.endTime);
  const y = activePriceSeries().priceToCoordinate(latestSwingHigh.level);
  const plotRight = chartElement.clientWidth - 80;
  if (!Number.isFinite(startX) || !Number.isFinite(endX) || !Number.isFinite(y)) return;

  const x = (startX + endX) / 2;
  const edge = 11;
  if (
    x < edge ||
    x > plotRight - edge ||
    y < edge ||
    y > chartElement.clientHeight - edge
  ) {
    swingHighActionTrigger.hidden = true;
    return;
  }

  swingHighActionTrigger.style.left = `${x}px`;
  swingHighActionTrigger.style.top = `${y}px`;
  swingHighActionTrigger.dataset.price = String(latestSwingHigh.level);
  swingHighActionTrigger.dataset.y = String(y);
  swingHighActionTrigger.setAttribute(
    "aria-label",
    `Open price actions at latest liquidity swing high ${formatActionPrice(latestSwingHigh.level)}`,
  );
  swingHighActionTrigger.title = `Price actions at ${formatActionPrice(latestSwingHigh.level)}`;
  swingHighActionTrigger.hidden = false;
  if (!priceActionMenu.hidden && priceActionMenuTrigger === swingHighActionTrigger) {
    priceActionMenu.style.top = `${y}px`;
  }
}

function updateChartOverlays() {
  updateLatestSwingActionTrigger();
  updateDemoOrderPositions();
  updateLiveCountdown();
}

let chartOverlayUpdateFrame;
function scheduleChartOverlayUpdate() {
  if (chartOverlayUpdateFrame !== undefined) return;
  chartOverlayUpdateFrame = requestAnimationFrame(() => {
    chartOverlayUpdateFrame = undefined;
    updateChartOverlays();
  });
}

let swingActionUpdateFrame;
function scheduleSwingActionUpdate() {
  if (swingActionUpdateFrame !== undefined) return;
  swingActionUpdateFrame = requestAnimationFrame(() => {
    swingActionUpdateFrame = undefined;
    updateLatestSwingActionTrigger();
    updateLiveCountdown();
  });
}

chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleChartOverlayUpdate);
chart.timeScale().subscribeSizeChange(scheduleChartOverlayUpdate);
chartWrap.addEventListener("pointermove", scheduleSwingActionUpdate, { passive: true });
window.addEventListener("resize", scheduleChartOverlayUpdate);

function closePriceActionMenu() {
  priceActionMenu.hidden = true;
  priceActionTrigger.setAttribute("aria-expanded", "false");
  swingHighActionTrigger.setAttribute("aria-expanded", "false");
}

function togglePriceActionMenu(price, y, trigger) {
  if (!Number.isFinite(price) || !Number.isFinite(y)) return;
  if (!priceActionMenu.hidden) {
    closePriceActionMenu();
    return;
  }

  crosshairPrice = price;
  crosshairY = y;
  priceActionMenuTrigger = trigger;
  priceActionMenu.hidden = false;
  priceActionMenu.style.top = `${y}px`;
  trigger.setAttribute("aria-expanded", "true");
  updatePriceActionLabels();
  priceActionNotice.textContent = demoModeToggle.checked
    ? "Demo mode adds local orders only. Nothing is sent to Fyers."
    : "Preview only. No orders or alerts will be sent.";
}

function openOrderPreview(
  side,
  orderType,
  price = crosshairPrice,
  returnFocus = priceActionMenuTrigger,
) {
  orderPreviewSide = side;
  orderPreviewTitle.textContent = `${side} ${priceActionInstrumentName()}`;
  orderPreviewSymbol.value = priceActionInstrumentName();
  orderPreviewQuantity.value = "1";
  orderPreviewType.value = orderType;
  orderPreviewPrice.value = formatActionPrice(price);
  orderPreviewNotice.textContent = "Preview only. No order will be placed.";
  orderPreviewSubmit.textContent = `Preview ${side}`;
  orderPreviewSubmit.className = side.toLowerCase();
  orderPreviewModal.dataset.returnFocus = returnFocus.id;
  closePriceActionMenu();
  orderPreviewModal.hidden = false;
  orderPreviewQuantity.focus();
}

function closeOrderPreview() {
  orderPreviewModal.hidden = true;
  document.querySelector(`#${orderPreviewModal.dataset.returnFocus || "price-action-trigger"}`).focus();
}

document.addEventListener("pointerout", (event) => {
  if (
    priceActionMenu.hidden &&
    chartWrap.contains(event.target) &&
    !chartWrap.contains(event.relatedTarget)
  ) {
    priceActionTrigger.hidden = true;
  }
});

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

function finiteNumber(value) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isValidCandle(bar) {
  return Boolean(
    bar &&
    ["time", "open", "high", "low", "close", "volume"].every((key) => Number.isFinite(bar[key])) &&
    bar.time > 0 &&
    bar.low <= Math.min(bar.open, bar.close) &&
    bar.high >= Math.max(bar.open, bar.close) &&
    bar.volume >= 0
  );
}

function formatVolume(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-IN", { notation: "compact" }).format(value) : "—";
}

function formatLiquidityVolume(value) {
  if (!Number.isFinite(value) || value <= 0) return "";
  const suffix = value >= 10_000_000 ? "Cr" : value >= 100_000 ? "L" : "";
  const divisor = value >= 10_000_000 ? 10_000_000 : value >= 100_000 ? 100_000 : 1;
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value / divisor);
  return `${formatted}${suffix}`;
}

function addOptionChainCell(row, value, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = value;
  row.append(cell);
  return cell;
}

function createOptionContractButton(option, isHighestVolume) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `option-contract ${option.optionType === "PE" ? "put" : "call"}`;
  if (isHighestVolume) button.classList.add("highest-volume");
  button.dataset.optionSymbol = option.symbol;
  button.title = option.symbol;
  const sideLabel = option.optionType === "CE" ? "call" : "put";
  button.setAttribute(
    "aria-label",
    `Open ${sideLabel} ${formatPrice(option.strikePrice)} chart, volume ${formatVolume(option.volume)}` +
      (isHighestVolume ? `, highest volume on the ${sideLabel} side` : ""),
  );

  const price = document.createElement("strong");
  price.textContent = formatPrice(option.ltp);
  const change = document.createElement("small");
  change.textContent = Number.isFinite(option.ltpChangePercent)
    ? `${option.ltpChangePercent > 0 ? "+" : ""}${option.ltpChangePercent.toFixed(2)}%`
    : option.symbol;
  const volume = document.createElement("small");
  volume.className = "option-volume";
  volume.textContent = `Vol ${formatVolume(option.volume)}`;
  button.append(price, change, volume);
  if (isHighestVolume) {
    const indicator = document.createElement("span");
    indicator.className = "option-volume-indicator";
    indicator.textContent = "Max vol";
    button.append(indicator);
  }
  return button;
}

function centerAtmStrike() {
  const atmRow = optionChainRows.querySelector("tr.atm");
  const tableWrap = optionChainRows.closest(".option-chain-table-wrap");
  if (!atmRow || !tableWrap) return;

  const rowBounds = atmRow.getBoundingClientRect();
  const tableBounds = tableWrap.getBoundingClientRect();
  tableWrap.scrollTop +=
    rowBounds.top - tableBounds.top - (tableWrap.clientHeight - rowBounds.height) / 2;
}

function renderOptionChain(optionChain, requestedTimestamp) {
  optionExpirySelect.replaceChildren();
  for (const expiry of optionChain.expiries) {
    const option = document.createElement("option");
    option.value = expiry.timestamp;
    option.textContent = expiry.date;
    optionExpirySelect.append(option);
  }
  optionExpirySelect.disabled = optionChain.expiries.length === 0;
  if (optionChain.expiries.length) {
    const selectedExpiry = optionChain.expiries.find(({ timestamp }) => timestamp === requestedTimestamp)
      ?? optionChain.expiries[0];
    optionExpirySelect.value = selectedExpiry.timestamp;
  }

  const strikes = new Map();
  for (const option of optionChain.options) {
    const row = strikes.get(option.strikePrice) ?? {};
    row[option.optionType] = option;
    strikes.set(option.strikePrice, row);
  }
  const highestVolumeBySide = { CE: 0, PE: 0 };
  for (const contracts of strikes.values()) {
    for (const side of ["CE", "PE"]) {
      const volume = contracts[side]?.volume;
      if (Number.isFinite(volume)) {
        highestVolumeBySide[side] = Math.max(highestVolumeBySide[side], volume);
      }
    }
  }
  const orderedStrikes = [...strikes.entries()].sort(([left], [right]) => left - right);
  const atmStrike = Number.isFinite(optionChain.underlyingPrice) && orderedStrikes.length
    ? orderedStrikes.reduce((closest, [strike]) =>
        Math.abs(strike - optionChain.underlyingPrice) < Math.abs(closest - optionChain.underlyingPrice)
          ? strike
          : closest,
      orderedStrikes[0][0])
    : undefined;

  optionChainRows.replaceChildren();
  for (const [strike, contracts] of orderedStrikes) {
    const row = document.createElement("tr");
    if (strike === atmStrike) row.className = "atm";

    addOptionChainCell(row, formatVolume(contracts.CE?.openInterest), "call-oi");
    const callCell = document.createElement("td");
    if (contracts.CE) {
      callCell.append(createOptionContractButton(
        contracts.CE,
        contracts.CE.volume > 0 && contracts.CE.volume === highestVolumeBySide.CE,
      ));
    }
    else callCell.textContent = "—";
    row.append(callCell);
    addOptionChainCell(row, formatPrice(strike), "option-strike");
    const putCell = document.createElement("td");
    if (contracts.PE) {
      putCell.append(createOptionContractButton(
        contracts.PE,
        contracts.PE.volume > 0 && contracts.PE.volume === highestVolumeBySide.PE,
      ));
    }
    else putCell.textContent = "—";
    row.append(putCell);
    addOptionChainCell(row, formatVolume(contracts.PE?.openInterest), "put-oi");
    optionChainRows.append(row);
  }

  centerAtmStrike();

  const underlying = Number.isFinite(optionChain.underlyingPrice)
    ? `NIFTY ${formatPrice(optionChain.underlyingPrice)}`
    : "NIFTY";
  optionChainStatus.textContent =
    `${underlying} · Call OI ${formatVolume(optionChain.callOpenInterest)} · ` +
    `Put OI ${formatVolume(optionChain.putOpenInterest)} · Click a contract to open its chart.`;
}

async function loadNiftyOptionChain(timestamp = optionExpirySelect.value) {
  const sequence = ++optionChainSequence;
  const query = new URLSearchParams({ strikecount: "10", timestamp });
  optionChainStatus.textContent = "Loading NIFTY option chain…";
  try {
    const optionChain = await fetchJson(`/api/fyers/options-chain?${query}`);
    if (sequence !== optionChainSequence) return;
    renderOptionChain(optionChain, timestamp);
  } catch (error) {
    if (sequence !== optionChainSequence) return;
    optionChainStatus.textContent = error.message;
    optionChainRows.replaceChildren();
  }
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
  swingMarkers = [];
  activeSwings = [];
  swingHighActionTrigger.hidden = true;
  candleSeries.setMarkers([]);
  barSeries.setMarkers([]);
}

function updateCurrentCandleVolumeMarker() {
  const latest = candles.at(-1);
  const volumeLabel = latest ? formatLiquidityVolume(latest.volume) : "";
  const markers = [...swingMarkers];
  const breaksByTime = new Map();
  const addBreak = (time, side, volume) => {
    const breakout = breaksByTime.get(time) ?? { sides: new Set(), volume };
    breakout.sides.add(side);
    if (!Number.isFinite(breakout.volume) && Number.isFinite(volume)) {
      breakout.volume = volume;
    }
    breaksByTime.set(time, breakout);
  };

  for (const swing of activeSwings) {
    if (Number.isFinite(swing.breakTime)) {
      addBreak(swing.breakTime, swing.side, swing.breakVolume);
    }
    if (
      latest &&
      !Number.isFinite(swing.breakTime) &&
      latest.time > swing.startTime &&
      latest.time <= swing.endTime &&
      (swing.side === "high" ? latest.high > swing.level : latest.low < swing.level)
    ) {
      addBreak(latest.time, swing.side, latest.volume);
    }
  }

  for (const [time, breakout] of breaksByTime) {
    const breaksHigh = breakout.sides.has("high");
    const breaksLow = breakout.sides.has("low");
    const label = breaksHigh && breaksLow ? "B" : breaksHigh ? "H" : "L";
    const breakoutVolume = formatLiquidityVolume(breakout.volume);
    markers.push({
      time,
      position: "aboveBar",
      color: breaksHigh && breaksLow
        ? chartColors.text
        : breaksHigh
          ? chartColors.down
          : chartColors.up,
      shape: "circle",
      text: breakoutVolume ? `${label} ${breakoutVolume}` : label,
      size: 0,
    });
  }

  if (latest && volumeLabel) {
    markers.push({
      time: latest.time,
      position: "belowBar",
      color: latest.close >= latest.open ? chartColors.up : chartColors.down,
      shape: "circle",
      text: volumeLabel,
      size: 0,
    });
  }
  markers.sort((left, right) => left.time - right.time);
  const candleTimes = new Set(candles.map((bar) => bar.time));
  activePriceSeries().setMarkers(markers.filter((marker) => candleTimes.has(marker.time)));
}

function renderSwings() {
  clearSwings();
  if (swingToggle.checked && candles.length >= Number(lookbackSlider.value) * 2 + 1) {
    activeSwings = findLiquiditySwings(candles, Number(lookbackSlider.value));
    for (const swing of activeSwings) {
      const isHigh = swing.side === "high";
      const color = isHigh ? chartColors.down : chartColors.up;
      if (
        Number.isFinite(swing.zoneEndTime) &&
        swing.zoneEndTime > swing.startTime &&
        swing.zoneTop > swing.zoneBottom
      ) {
        const zone = chart.addBaselineSeries({
          baseValue: { type: "price", price: swing.zoneBottom },
          topFillColor1: chartColors.liquidityZoneTop,
          topFillColor2: chartColors.liquidityZoneBottom,
          topLineColor: chartColors.liquidityZoneBottom,
          bottomFillColor1: chartColors.liquidityZoneTop,
          bottomFillColor2: chartColors.liquidityZoneBottom,
          bottomLineColor: chartColors.liquidityZoneBottom,
          lineVisible: false,
          pointMarkersVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        zone.setData([
          { time: swing.startTime, value: swing.zoneTop },
          { time: swing.zoneEndTime, value: swing.zoneTop },
        ]);
        swingSeries.push(zone);
      }

      const series = chart.addLineSeries({
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      series.setData([
        { time: swing.startTime, value: swing.level },
        { time: swing.endTime, value: swing.level },
      ]);
      swingSeries.push(series);
      const startVolumeLabel = formatLiquidityVolume(swing.startVolume);
      const swingVolumeLabel = formatLiquidityVolume(swing.volume);
      const volumeLabel = [
        startVolumeLabel && `Start ${startVolumeLabel}`,
        swingVolumeLabel && `Total ${swingVolumeLabel}`,
      ].filter(Boolean).join(" · ");
      if (volumeLabel) {
        swingMarkers.push({
          time: swing.startTime,
          position: "aboveBar",
          color,
          shape: "circle",
          text: volumeLabel,
          size: 0,
        });
      }
    }
  }
  updateCurrentCandleVolumeMarker();
  updateLatestSwingActionTrigger();
}

function stopCountdownTimer() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = undefined;
  document.querySelector("#live-countdown").hidden = true;
}

function clearLiveTimer() {
  stopQuotePolling();
  stopCountdownTimer();
  const socket = liveSocket;
  liveSocket = undefined;
  socketConnected = false;
  socketTransportConnected = false;
  subscribedSymbol = undefined;
  activeChartSymbol = undefined;
  socketGeneration += 1;
  socketConnectionPromise = undefined;
  if (typeof socket?.close === "function") socket.close();
}

function stopQuotePolling() {
  if (quoteTimer) clearInterval(quoteTimer);
  quoteTimer = undefined;
}

function startQuotePolling() {
  if (socketConnected || quoteTimer || !activeChartSymbol) return;
  quoteTimer = setInterval(() => {
    if (activeChartSymbol) void pollQuote(loadSequence, activeChartSymbol);
  }, 5000);
  void pollQuote(loadSequence, activeChartSymbol);
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
  const top = y + livePriceLabelHeight / 2;
  if (
    remaining <= 0 ||
    !Number.isFinite(y) ||
    y < livePriceLabelHeight / 2 ||
    top + liveCountdownHeight > chartElement.clientHeight
  ) {
    timer.hidden = true;
    return;
  }

  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");
  const text = `${minutes}:${seconds}`;
  const direction = latest.close >= latest.open ? "up" : "down";
  const topStyle = `${Math.round(top)}px`;
  if (timer.textContent !== text) timer.textContent = text;
  if (timer.dataset.direction !== direction) timer.dataset.direction = direction;
  if (timer.style.top !== topStyle) timer.style.top = topStyle;
  if (timer.hidden) timer.hidden = false;
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
    if (update?.symbol !== symbol) continue;
    const price = finiteNumber(update.ltp);
    const time = finiteNumber(update.exch_feed_time ?? update.last_traded_time);
    if (price === undefined || time === undefined) continue;
    quotes.push({
      price,
      volume: finiteNumber(update.vol_traded_today),
      time,
    });
  }
  if (!quotes.length) return;

  socketConnected = true;
  stopQuotePolling();
  for (const quote of quotes) applyLiveQuote(sequence, symbol, quote);
}

function syncLiveSocketSubscription(symbol) {
  if (subscribedSymbol === symbol) return;
  socketConnected = false;
  if (!liveSocket || !socketTransportConnected) return;

  if (subscribedSymbol) {
    if (typeof liveSocket.unsubscribe !== "function") {
      throw new Error("Fyers WebSocket SDK does not support unsubscribe");
    }
    liveSocket.unsubscribe([subscribedSymbol]);
    subscribedSymbol = undefined;
  }
  if (!symbol) return;

  liveSocket.subscribe([symbol]);
  subscribedSymbol = symbol;
}

async function connectLiveSocket() {
  if (liveSocket || socketConnectionPromise) return;
  if (typeof window.fyersDataSocket !== "function") {
    feedStatus.textContent = "Fyers WebSocket SDK unavailable; using REST quote fallback";
    setConnectionStatus("Starting fallback");
    startQuotePolling();
    return;
  }

  const generation = socketGeneration;
  const attempt = (async () => {
    try {
      const credentials = await fetchJson("/api/fyers/ws-token", { method: "POST" });
      if (generation !== socketGeneration || liveSocket) return;

      const token = `${credentials.appId}:${credentials.accessToken}`;
      const Socket = window.fyersDataSocket;
      const socket = typeof Socket.getInstance === "function"
        ? Socket.getInstance(token, "", true)
        : new Socket(token, "", true);
      liveSocket = socket;
      socketConnected = false;
      socket.on("connect", () => {
        if (liveSocket !== socket) return;
        socketTransportConnected = true;
        try {
          if (typeof socket.mode === "function" && socket.FullMode !== undefined) {
            socket.mode(socket.FullMode);
          }
          syncLiveSocketSubscription(activeChartSymbol);
          if (activeChartSymbol) {
            setConnectionStatus("Fyers connected");
            feedStatus.textContent = "Waiting for first Fyers price update; REST fallback is active";
            startQuotePolling();
          }
        } catch (error) {
          socketConnected = false;
          setConnectionStatus("Fyers reconnecting");
          feedStatus.textContent = `WebSocket subscription failed: ${error.message}`;
          startQuotePolling();
        }
      });
      socket.on("message", (message) => {
        if (liveSocket === socket && activeChartSymbol) {
          updateFromSocket(loadSequence, activeChartSymbol, message);
        }
      });
      socket.on("error", () => {
        if (liveSocket !== socket) return;
        socketTransportConnected = false;
        subscribedSymbol = undefined;
        socketConnected = false;
        setConnectionStatus("Fyers reconnecting");
        feedStatus.textContent = "WebSocket interrupted; using REST quote fallback";
        startQuotePolling();
      });
      socket.on("close", () => {
        if (liveSocket !== socket) return;
        socketTransportConnected = false;
        subscribedSymbol = undefined;
        socketConnected = false;
        setConnectionStatus("Fyers reconnecting");
        feedStatus.textContent = "WebSocket disconnected; using REST quote fallback";
        startQuotePolling();
      });
      if (typeof socket.autoreconnect === "function") socket.autoreconnect(10);
      else if (typeof socket.autoReconnect === "function") socket.autoReconnect(10);
      socket.connect();
    } catch (error) {
      if (generation !== socketGeneration) return;
      const failedSocket = liveSocket;
      liveSocket = undefined;
      socketTransportConnected = false;
      subscribedSymbol = undefined;
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
      startQuotePolling();
    }
  })();
  socketConnectionPromise = attempt;
  await attempt;
  if (generation === socketGeneration) socketConnectionPromise = undefined;
}

async function loadChart() {
  stopQuotePolling();
  stopCountdownTimer();
  activeChartSymbol = undefined;
  updateDemoOrderPositions();
  const sequence = ++loadSequence;
  const symbol = symbolInput.value.trim().toUpperCase();
  if (demoOrders.length && symbol !== demoOrderSymbol) {
    clearDemoOrders("Chart symbol changed. Pending demo orders were canceled.");
  }
  updateDemoTradeButtons();
  if (!symbol) {
    try {
      syncLiveSocketSubscription(undefined);
    } catch (error) {
      feedStatus.textContent = `WebSocket unsubscribe failed: ${error.message}`;
    }
    showMessage("Enter a Fyers symbol to load the chart.");
    symbolInput.focus();
    return;
  }

  clearDrawings();
  clearSwings();
  priceActionMenu.hidden = true;
  priceActionTrigger.hidden = true;
  priceActionTrigger.setAttribute("aria-expanded", "false");
  crosshairPrice = undefined;
  crosshairY = undefined;
  candles = [];
  candleSeries.setData([]);
  barSeries.setData([]);
  volumeSeries.setData([]);
  updateDemoOrderPositions();
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
    if (
      !Array.isArray(candles) ||
      candles.some((bar, index) =>
        !isValidCandle(bar) || (index > 0 && bar.time <= candles[index - 1].time)
      )
    ) {
      throw new Error("Fyers returned invalid or out-of-order candle data. Check the symbol and try again.");
    }
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
    updateDemoOrderPositions();
    renderSwings();
    updateLiveCountdown();
    hideMessage();
    lastQuoteVolume = undefined;
    activeChartSymbol = symbol;
    updateDemoTradeButtons();
    updateDemoPositionPnl(symbol, candles.at(-1).close);
    let subscriptionError;
    try {
      syncLiveSocketSubscription(symbol);
    } catch (error) {
      socketConnected = false;
      subscriptionError = error;
    }
    if (subscriptionError) {
      setConnectionStatus("Fyers reconnecting");
      feedStatus.textContent = `WebSocket subscription failed: ${subscriptionError.message}`;
    } else if (socketTransportConnected) {
      setConnectionStatus(socketConnected ? "Fyers live" : "Fyers connected", "connected");
      feedStatus.textContent = socketConnected
        ? "Fyers WebSocket active"
        : "Waiting for first Fyers price update; REST fallback is active";
    } else if (liveSocket) {
      setConnectionStatus("Fyers reconnecting");
      feedStatus.textContent = "Waiting for Fyers WebSocket reconnect; REST fallback is active";
    } else {
      setConnectionStatus("Connecting", "");
      feedStatus.textContent = "Connecting to Fyers market-data WebSocket";
    }
    startQuotePolling();
    void connectLiveSocket();
    countdownTimer = setInterval(updateLiveCountdown, 1000);
  } catch (error) {
    if (sequence !== loadSequence) return;
    candles = [];
    clearDemoOrders("Chart data could not be loaded. Pending demo orders were canceled.");
    updateDemoTradeButtons();
    if (error.status === 401) {
      clearLiveTimer();
    } else {
      try {
        syncLiveSocketSubscription(undefined);
      } catch (subscriptionError) {
        feedStatus.textContent = `WebSocket unsubscribe failed: ${subscriptionError.message}`;
      }
    }
    showMessage(error.message, { login: error.status === 401 });
    setConnectionStatus(error.status === 401 ? "Login required" : "Data unavailable", "error");
    if (error.status === 401) {
      feedStatus.textContent = "Your Fyers session is missing or expired";
    } else if (!feedStatus.textContent.startsWith("WebSocket unsubscribe failed:")) {
      feedStatus.textContent = "Could not load market data";
    }
  }
}

function intervalLabel(resolution) {
  if (resolution === "60") return "1 hour";
  if (resolution === "D") return "1 day";
  return `${resolution} minute${resolution === "1" ? "" : "s"}`;
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
  const price = finiteNumber(quote?.price);
  const time = finiteNumber(quote?.time);
  const volume = finiteNumber(quote?.volume);
  if (
    price === undefined ||
    price <= 0 ||
    time === undefined ||
    time <= 0 ||
    (volume !== undefined && volume < 0)
  ) {
    setConnectionStatus("Invalid Fyers quote", "error");
    feedStatus.textContent = "Ignored an invalid live quote; waiting for valid market data";
    return;
  }

  const previous = candles.at(-1);
  if (!previous || time < previous.time) return;

  const isNewBar = currentResolution === "D"
    ? timeBucket(previous.time, currentResolution) !== timeBucket(time, currentResolution)
    : timeBucket(time, currentResolution) > previous.time;
  const volumeDelta = volume === undefined || lastQuoteVolume === undefined
    ? 0
    : Math.max(0, volume - lastQuoteVolume);

  const next = isNewBar
    ? {
        time: currentResolution === "D" ? time : timeBucket(time, currentResolution),
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volumeDelta,
      }
    : {
        ...previous,
        high: Math.max(previous.high, price),
        low: Math.min(previous.low, price),
        close: price,
        volume: previous.volume + volumeDelta,
      };
  if (!isValidCandle(next)) {
    setConnectionStatus("Invalid Fyers candle update", "error");
    feedStatus.textContent = "Ignored an invalid live candle update; waiting for valid market data";
    return;
  }

  if (volume !== undefined) lastQuoteVolume = volume;
  if (isNewBar) candles.push(next);
  else candles[candles.length - 1] = next;
  candleSeries.update(next);
  barSeries.update(next);
  volumeSeries.update({
    time: next.time,
    value: next.volume,
    color: next.close >= next.open ? chartColors.upVolume : chartColors.downVolume,
  });
  document.querySelector("#last-price").textContent = formatPrice(price);
  updateOhlc(next);
  processDemoOrderFills(symbol, price);
  updateDemoPositionPnl(symbol, price);
  updateCurrentCandleVolumeMarker();
  updateLiveCountdown();
  updateLatestSwingActionTrigger();
  updateDemoOrderPositions();
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
  scheduleSwingActionUpdate();
  if (param.point) updatePriceActionPosition(param.point.y);
  updateDemoOrderPositions();
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

swingHighActionTrigger.addEventListener("click", () => {
  togglePriceActionMenu(
    Number(swingHighActionTrigger.dataset.price),
    Number(swingHighActionTrigger.dataset.y),
    swingHighActionTrigger,
  );
});

priceActionTrigger.addEventListener("click", () => {
  togglePriceActionMenu(crosshairPrice, crosshairY, priceActionTrigger);
});

document.querySelectorAll("[data-price-action]").forEach((button) => {
  button.addEventListener("click", () => {
    switch (button.dataset.priceAction) {
      case "alert":
        priceActionNotice.textContent = "Alert preview only. No alert will be created.";
        break;
      case "sell":
        if (demoModeToggle.checked) {
          placeDemoOrder("sell", crosshairPrice, "Limit");
          closePriceActionMenu();
          priceActionMenuTrigger.focus();
        } else {
          openOrderPreview("Sell", "Limit");
        }
        break;
      case "buy":
        if (demoModeToggle.checked) {
          placeDemoOrder("buy", crosshairPrice, "Stop");
          closePriceActionMenu();
          priceActionMenuTrigger.focus();
        } else {
          openOrderPreview("Buy", "Stop");
        }
        break;
      case "order":
        if (demoModeToggle.checked) {
          placeDemoOrder("buy", crosshairPrice, "Limit");
          closePriceActionMenu();
          priceActionMenuTrigger.focus();
        } else {
          openOrderPreview("Buy", "Limit");
        }
        break;
      case "horizontal": {
        const series = activePriceSeries();
        const line = series.createPriceLine({
          price: crosshairPrice,
          color: chartColors.drawing,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Level",
        });
        drawings.push({ type: "price", series, line });
        closePriceActionMenu();
        break;
      }
      default:
        break;
    }
  });
});

document.querySelector("#close-order-preview").addEventListener("click", closeOrderPreview);
document.querySelector("#cancel-order-preview").addEventListener("click", closeOrderPreview);
document.querySelector("[data-close-order-preview]").addEventListener("click", closeOrderPreview);
document.querySelector("#order-preview-form").addEventListener("submit", (event) => {
  event.preventDefault();
  orderPreviewNotice.textContent = `${orderPreviewSide} preview ready. No order was placed.`;
});

function closeOptionChainModal() {
  if (optionChainModal.open) optionChainModal.close();
}

optionChainModal.addEventListener("close", () => {
  optionChainToggle.setAttribute("aria-expanded", "false");
  optionChainToggle.focus();
});

optionChainModal.addEventListener("click", (event) => {
  if (event.target !== optionChainModal) return;
  const bounds = optionChainModal.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  ) {
    closeOptionChainModal();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (
    !priceActionMenu.hidden &&
    !priceActionMenu.contains(event.target) &&
    event.target !== priceActionTrigger &&
    event.target !== swingHighActionTrigger
  ) {
    closePriceActionMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!indicatorPopover.hidden) {
    indicatorPopover.hidden = true;
    indicatorsToggle.setAttribute("aria-expanded", "false");
    indicatorsToggle.focus();
    return;
  }
  if (!drawPopover.hidden) {
    drawPopover.hidden = true;
    drawToggle.setAttribute("aria-expanded", "false");
    drawToggle.focus();
    return;
  }
  if (optionChainModal.open) {
    closeOptionChainModal();
    return;
  }
  if (!orderPreviewModal.hidden) {
    closeOrderPreview();
    return;
  }
  if (!priceActionMenu.hidden) {
    closePriceActionMenu();
    priceActionTrigger.focus();
    return;
  }
  if (document.fullscreenElement === main) {
    void document.exitFullscreen().catch((error) => {
      fullscreenStatus.textContent = `Could not exit fullscreen: ${error.message}`;
    });
  }
});

document.querySelector("#intervals").addEventListener("change", (event) => {
  const resolution = event.target.value;
  if (resolution === currentResolution) return;
  currentResolution = resolution;
  void loadChart();
});

document.querySelector("#load-chart").addEventListener("click", () => void loadChart());
symbolInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void loadChart();
});
symbolInput.addEventListener("input", updateDemoTradeButtons);
rangeSelect.addEventListener("change", () => void loadChart());
function updateFullscreenControl() {
  const isFullscreen = document.fullscreenElement === main;
  fullscreenToggle.setAttribute("aria-pressed", String(isFullscreen));
  fullscreenToggle.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Fullscreen");
  fullscreenToggle.title = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
  fullscreenStatus.textContent = isFullscreen ? "Fullscreen mode enabled" : "Fullscreen mode exited";
}

document.addEventListener("fullscreenchange", updateFullscreenControl);
fullscreenToggle.addEventListener("click", async () => {
  if (!document.fullscreenElement && typeof main.requestFullscreen !== "function") {
    fullscreenStatus.textContent = "Fullscreen is not supported in this browser.";
    return;
  }
  try {
    if (document.fullscreenElement === main) await document.exitFullscreen();
    else await main.requestFullscreen();
  } catch (error) {
    fullscreenStatus.textContent = `Could not change fullscreen mode: ${error.message}`;
  }
});

optionChainToggle.addEventListener("click", () => {
  if (optionChainModal.open) {
    closeOptionChainModal();
    return;
  }
  optionChainModal.showModal();
  optionChainToggle.setAttribute("aria-expanded", "true");
  document.querySelector("#close-option-chain").focus();
  void loadNiftyOptionChain(optionExpirySelect.value);
});
document.querySelector("#refresh-option-chain").addEventListener("click", () => {
  void loadNiftyOptionChain(optionExpirySelect.value);
});
optionExpirySelect.addEventListener("change", () => {
  void loadNiftyOptionChain(optionExpirySelect.value);
});
document.querySelector("#close-option-chain").addEventListener("click", () => {
  closeOptionChainModal();
});
const positionToolbarPopover = (popover, trigger) => {
  if (popover.hidden) return;
  const triggerBounds = trigger.getBoundingClientRect();
  const gap = 8;
  const popoverWidth = popover.offsetWidth;
  const popoverHeight = popover.offsetHeight;
  const left = Math.max(gap, Math.min(triggerBounds.left, window.innerWidth - popoverWidth - gap));
  const top = triggerBounds.bottom + popoverHeight + gap <= window.innerHeight
    ? triggerBounds.bottom + gap
    : Math.max(gap, triggerBounds.top - popoverHeight - gap);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
};
indicatorsToggle.addEventListener("click", () => {
  const expanded = indicatorsToggle.getAttribute("aria-expanded") !== "true";
  indicatorPopover.hidden = !expanded;
  indicatorsToggle.setAttribute("aria-expanded", String(expanded));
  positionToolbarPopover(indicatorPopover, indicatorsToggle);
});
drawToggle.addEventListener("click", () => {
  const expanded = drawToggle.getAttribute("aria-expanded") !== "true";
  drawPopover.hidden = !expanded;
  drawToggle.setAttribute("aria-expanded", String(expanded));
  positionToolbarPopover(drawPopover, drawToggle);
});
window.addEventListener("resize", () => {
  positionToolbarPopover(indicatorPopover, indicatorsToggle);
  positionToolbarPopover(drawPopover, drawToggle);
});
window.addEventListener("scroll", () => {
  positionToolbarPopover(indicatorPopover, indicatorsToggle);
  positionToolbarPopover(drawPopover, drawToggle);
}, true);
document.addEventListener("pointerdown", (event) => {
  if (
    indicatorPopover.hidden ||
    indicatorPopover.contains(event.target) ||
    indicatorsToggle.contains(event.target)
  ) {
    return;
  }
  indicatorPopover.hidden = true;
  indicatorsToggle.setAttribute("aria-expanded", "false");
});
document.addEventListener("pointerdown", (event) => {
  if (
    drawPopover.hidden ||
    drawPopover.contains(event.target) ||
    drawToggle.contains(event.target)
  ) {
    return;
  }
  drawPopover.hidden = true;
  drawToggle.setAttribute("aria-expanded", "false");
});
optionChainRows.addEventListener("click", (event) => {
  const contract = event.target.closest("[data-option-symbol]");
  if (!contract) return;
  symbolInput.value = contract.dataset.optionSymbol;
  closeOptionChainModal();
  void loadChart();
});
swingToggle.addEventListener("change", () => {
  indicatorsToggle.setAttribute("aria-pressed", String(swingToggle.checked));
  renderSwings();
});
lookbackSlider.addEventListener("input", () => {
  lookbackValue.value = lookbackSlider.value;
  renderSwings();
});

document.querySelector("#candles-type").addEventListener("click", () => {
  chartType = "candles";
  candleSeries.applyOptions({ visible: true });
  barSeries.applyOptions({ visible: false });
  document.querySelector("#candles-type").classList.add("selected");
  document.querySelector("#bars-type").classList.remove("selected");
  document.querySelector("#candles-type").setAttribute("aria-pressed", "true");
  document.querySelector("#bars-type").setAttribute("aria-pressed", "false");
  clearDrawings();
  renderSwings();
  updateDemoOrderPositions();
  updateLiveCountdown();
});

document.querySelector("#bars-type").addEventListener("click", () => {
  chartType = "bars";
  candleSeries.applyOptions({ visible: false });
  barSeries.applyOptions({ visible: true });
  document.querySelector("#bars-type").classList.add("selected");
  document.querySelector("#candles-type").classList.remove("selected");
  document.querySelector("#bars-type").setAttribute("aria-pressed", "true");
  document.querySelector("#candles-type").setAttribute("aria-pressed", "false");
  clearDrawings();
  renderSwings();
  updateDemoOrderPositions();
  updateLiveCountdown();
});

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => selectTool(button.dataset.tool));
});
document.querySelector("#clear-drawings").addEventListener("click", clearDrawings);
demoModeToggle.addEventListener("change", () => {
  demoTradingControls.hidden = !demoModeToggle.checked;
  if (demoModeToggle.checked) {
    demoTradeStatus.textContent = candles.length
      ? "Demo mode on. Orders fill on a price touch or a quote gap of at least ₹0.10. Each fill is 65 units (1 lot); P/L updates on quotes. Nothing is sent to Fyers."
      : "Demo mode on. Load chart data before adding demo orders.";
  } else {
    const canceled = clearDemoOrders();
    demoTradeStatus.textContent = canceled
      ? `Demo mode off. Canceled ${canceled} pending demo order${canceled === 1 ? "" : "s"}. No live orders were affected.`
      : "Demo mode off. No live orders were affected.";
  }
  updatePriceActionLabels();
  if (!priceActionMenu.hidden) {
    priceActionNotice.textContent = demoModeToggle.checked
      ? "Demo mode adds local orders only. Nothing is sent to Fyers."
      : "Preview only. No orders or alerts will be sent.";
  }
  updateDemoTradeButtons();
});
demoBuyButton.addEventListener("click", () => placeDemoOrder("buy"));
demoSellButton.addEventListener("click", () => placeDemoOrder("sell"));

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
