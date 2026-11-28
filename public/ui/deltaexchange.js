import { getBreakoutMoveAnalysis } from "./deltaexchange-breakout-summary.js";

const configurationStatus = document.querySelector("#configuration-status");
const authenticationStatus = document.querySelector("#authentication-status");
const authMessage = document.querySelector("#auth-message");
const testAuthButton = document.querySelector("#test-auth-button");
const loadCandlesButton = document.querySelector("#load-candles-button");
const candlesStatus = document.querySelector("#candles-status");
const candlesRange = document.querySelector("#candles-range");
const candlesEmpty = document.querySelector("#candles-empty");
const candlesTableWrap = document.querySelector("#candles-table-wrap");
const candlesTableBody = document.querySelector("#candles-table-body");
const liquidityStatus = document.querySelector("#liquidity-status");
const liquidityEmpty = document.querySelector("#liquidity-empty");
const liquidityTableWrap = document.querySelector("#liquidity-table-wrap");
const liquidityTableBody = document.querySelector("#liquidity-table-body");
const breakoutStatus = document.querySelector("#breakout-status");
const breakoutEmpty = document.querySelector("#breakout-empty");
const breakoutsTableWrap = document.querySelector("#breakouts-table-wrap");
const breakoutsTableBody = document.querySelector("#breakouts-table-body");
const breakoutSelect = document.querySelector("#breakout-select");
const breakoutChartSummary = document.querySelector("#breakout-chart-summary");
const breakoutChartEmpty = document.querySelector("#breakout-chart-empty");
const breakoutChartWrap = document.querySelector("#breakout-chart-wrap");
const breakoutChartContainer = document.querySelector("#breakout-chart");
const breakoutDailyStatus = document.querySelector("#breakout-daily-status");
const breakoutDailyEmpty = document.querySelector("#breakout-daily-empty");
const breakoutRangeLabel = document.querySelector("#breakout-range-label");
const backtestDateInput = document.querySelector("#backtest-date");
const loadBacktestDateButton = document.querySelector("#load-backtest-date");
const showRecentBreakoutsButton = document.querySelector("#show-recent-breakouts");
const backtestDateStatus = document.querySelector("#backtest-date-status");
const quickRangeButtons = [...document.querySelectorAll(".quick-range-button")];
const dailyMoveChart = document.querySelector("#daily-move-chart");
const dailyMoveDetails = document.querySelector("#daily-move-details");
const dailyChartOlderButton = document.querySelector("#daily-chart-older");
const dailyChartNewerButton = document.querySelector("#daily-chart-newer");
const localDateTimeFormatter = new Intl.DateTimeFormat(navigator.language, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
const localSessionDateFormatter = new Intl.DateTimeFormat(navigator.language, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
let breakoutEvents = [];
let breakoutCandles = [];
let breakoutChart;
let breakoutCandleSeries;
let breakoutLevelLine;
let breakoutStopLine;
let dailyMoveChartInstance;
let dailyMoveSeries;
let dailyMovePointDetails = new Map();
let dailyMovePointCount = 0;
let dailyMoveSessionLineLayer;
let dailyMoveSessionBoundaries = [];
let isHistoricalBacktest = false;
let selectedBreakoutDays = 3;

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalDateRange(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Choose a valid backtest date.");
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const start = new Date(year, month - 1, day);
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day
  ) {
    throw new Error("Choose a valid backtest date.");
  }
  const end = new Date(year, month - 1, day + 1);
  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
}

function getLocalSessionBoundaries(startTime, endTime) {
  const firstDate = new Date(startTime * 1000);
  const boundary = new Date(
    firstDate.getFullYear(),
    firstDate.getMonth(),
    firstDate.getDate() + 1,
  );
  const boundaries = [];
  while (boundary.getTime() / 1000 < endTime) {
    boundaries.push(Math.floor(boundary.getTime() / 1000));
    boundary.setDate(boundary.getDate() + 1);
  }
  return boundaries;
}

async function readResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new Error("The server returned an invalid response.", { cause });
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with HTTP ${response.status}.`);
  }
  return payload;
}

async function loadConfigurationStatus() {
  configurationStatus.textContent = "Checking configuration";
  configurationStatus.dataset.state = "";
  testAuthButton.disabled = true;

  try {
    const response = await fetch("/api/deltaexchange/auth/status");
    const status = await readResponse(response);
    testAuthButton.disabled = !status.configured;
    configurationStatus.textContent = status.configured
      ? "Credentials configured"
      : "Credentials not configured";
    configurationStatus.dataset.state = status.configured ? "success" : "error";
    authMessage.textContent = status.configured
      ? "Production API credentials are available to the server."
      : "Add both credentials to the server’s .env file and restart the server.";
  } catch (error) {
    configurationStatus.textContent = "Status unavailable";
    configurationStatus.dataset.state = "error";
    authMessage.textContent = error.message;
  }
}

function formatCandleValue(value) {
  return new Intl.NumberFormat(navigator.language, {
    maximumFractionDigits: 8,
  }).format(Number(value));
}

function formatPoints(value) {
  return new Intl.NumberFormat(navigator.language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatCandleTime(timestamp) {
  return localDateTimeFormatter.format(new Date(Number(timestamp) * 1000));
}

function appendLiquidityCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value;
  row.append(cell);
}

function renderLiquiditySwings(swings, pivotLookback) {
  liquidityTableBody.replaceChildren();
  liquidityTableWrap.hidden = true;
  liquidityEmpty.hidden = false;

  const highs = swings?.highs ?? [];
  const lows = swings?.lows ?? [];
  const records = [...highs, ...lows].sort(
    (left, right) => Date.parse(right.pivotTime) - Date.parse(left.pivotTime),
  );
  if (records.length === 0) {
    liquidityStatus.textContent = "No swing found";
    liquidityStatus.dataset.state = "";
    liquidityEmpty.textContent =
      `No confirmed swing highs or lows in the past 24 hours (${pivotLookback}-candle pivot lookback).`;
    return;
  }

  for (const swing of records) {
    const row = document.createElement("tr");
    const values = [
      swing.side === "high" ? "Upside (high)" : "Downside (low)",
      localDateTimeFormatter.format(new Date(swing.pivotTime)),
      localDateTimeFormatter.format(new Date(swing.confirmedAt)),
      formatCandleValue(swing.level),
      `${formatCandleValue(swing.zoneTop)} / ${formatCandleValue(swing.zoneBottom)}`,
      formatCandleValue(swing.pivotVolume),
      formatCandleValue(swing.intersectionCount),
      formatCandleValue(swing.intersectionVolume),
      swing.status,
    ];
    for (const value of values) {
      appendLiquidityCell(row, value);
    }
    liquidityTableBody.append(row);
  }
  liquidityStatus.textContent = `${highs.length} highs · ${lows.length} lows`;
  liquidityStatus.dataset.state = "success";
  liquidityEmpty.hidden = true;
  liquidityTableWrap.hidden = false;
}

function appendBreakoutResultCell(row, outcome, state) {
  const cell = document.createElement("td");
  const label = document.createElement("span");
  label.className = "breakout-result";
  label.dataset.state = state;
  label.textContent = outcome;
  cell.append(label);
  row.append(cell);
}

function showBreakoutChartError(error) {
  breakoutChartWrap.hidden = true;
  breakoutChartEmpty.hidden = false;
  breakoutChartEmpty.textContent = error.message;
}

function drawSelectedBreakout(index) {
  const event = breakoutEvents[index];
  if (!event) {
    return;
  }

  const chartLibrary = window.LightweightCharts;
  if (!chartLibrary) {
    throw new Error("The breakout chart library is unavailable.");
  }

  breakoutChartWrap.hidden = false;
  breakoutChartEmpty.hidden = true;
  if (!breakoutChart) {
    breakoutChart = chartLibrary.createChart(breakoutChartContainer, {
      autoSize: true,
      layout: {
        background: { type: chartLibrary.ColorType.Solid, color: "#101722" },
        textColor: "#aab4c3",
      },
      grid: {
        vertLines: { color: "#202b39" },
        horzLines: { color: "#202b39" },
      },
      crosshair: {
        mode: chartLibrary.CrosshairMode.Normal,
      },
      rightPriceScale: { borderColor: "#293849" },
      timeScale: {
        borderColor: "#293849",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    breakoutCandleSeries = breakoutChart.addSeries(
      chartLibrary.CandlestickSeries,
      {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderUpColor: "#26a69a",
        borderDownColor: "#ef5350",
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      },
    );
  }

  const from = Math.max(
    Number(breakoutCandles[0]?.time ?? event.breakoutTime),
    event.breakoutTime - 30 * 60,
  );
  const to = event.stopHitAt ?? Number(breakoutCandles.at(-1)?.time ?? event.breakoutTime);
  const visibleCandles = breakoutCandles
    .filter((candle) => Number(candle.time) >= from && Number(candle.time) <= to)
    .map((candle) => ({
      time: Number(candle.time),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    }));

  breakoutCandleSeries.setData(visibleCandles);
  if (breakoutLevelLine) {
    breakoutCandleSeries.removePriceLine(breakoutLevelLine);
  }
  if (breakoutStopLine) {
    breakoutCandleSeries.removePriceLine(breakoutStopLine);
  }
  breakoutLevelLine = breakoutCandleSeries.createPriceLine({
    price: event.level,
    color: "#f0b90b",
    lineWidth: 2,
    lineStyle: chartLibrary.LineStyle.Dashed,
    axisLabelVisible: true,
    title: "Broken level",
  });
  breakoutStopLine = breakoutCandleSeries.createPriceLine({
    price: event.stopLoss,
    color: "#ef5350",
    lineWidth: 2,
    lineStyle: chartLibrary.LineStyle.Dashed,
    axisLabelVisible: true,
    title: "Stop loss",
  });
  breakoutChart.timeScale().fitContent();

  const direction = event.side === "high" ? "Upside" : "Downside";
  const outcome = event.stopHitAt
    ? `SL hit at ${formatCandleTime(event.stopHitAt)}`
    : "SL not hit by the latest candle";
  breakoutChartSummary.textContent =
    `${direction} break · Level ${formatCandleValue(event.level)} · ` +
    `SL ${formatCandleValue(event.stopLoss)} · Max move ${formatPoints(event.maxFavorablePoints)} points · ${outcome}`;
}

function renderBreakoutAnalysis(
  events,
  candles,
  dailyEvents = events,
  dailyStartTime,
  dailyEndTime,
) {
  breakoutsTableBody.replaceChildren();
  breakoutEvents = [...events].sort((left, right) => right.breakoutTime - left.breakoutTime);
  breakoutCandles = [...candles].sort((left, right) => Number(left.time) - Number(right.time));
  breakoutsTableWrap.hidden = true;
  breakoutChartWrap.hidden = true;
  breakoutChartSummary.textContent = "";
  breakoutChartEmpty.hidden = false;
  dailyMoveChart.hidden = true;
  dailyMoveDetails.textContent = "";
  breakoutDailyEmpty.hidden = false;
  breakoutDailyStatus.textContent = "Loading";
  breakoutDailyStatus.dataset.state = "";

  if (breakoutEvents.length === 0) {
    breakoutStatus.textContent = "No broken levels";
    breakoutStatus.dataset.state = "";
    breakoutEmpty.hidden = false;
    breakoutEmpty.textContent = "No confirmed liquidity levels broke in this range.";
    breakoutSelect.replaceChildren(new Option("No broken levels", ""));
    breakoutSelect.disabled = true;
    breakoutChartEmpty.textContent = "The chart will appear when a broken level is available.";
    renderDailyMoveChart(dailyEvents, dailyStartTime, dailyEndTime);
    return;
  }

  const stopHits = breakoutEvents.filter((event) => event.stopHitAt !== null).length;
  breakoutStatus.textContent = `${breakoutEvents.length} breaks · ${stopHits} SL hits`;
  breakoutStatus.dataset.state = "success";
  breakoutEmpty.hidden = true;
  breakoutsTableWrap.hidden = false;
  breakoutSelect.replaceChildren();
  breakoutSelect.disabled = false;

  for (const [index, event] of breakoutEvents.entries()) {
    const direction = event.side === "high" ? "Upside" : "Downside";
    const option = new Option(
      `${direction} · ${formatCandleTime(event.breakoutTime)} · ${formatPoints(event.maxFavorablePoints)} pts · ${event.stopHitAt ? "SL hit" : "Open"}`,
      String(index),
    );
    breakoutSelect.add(option);

    const row = document.createElement("tr");
    const values = [
      direction,
      localDateTimeFormatter.format(new Date(event.pivotTime)),
      formatCandleTime(event.breakoutTime),
      formatCandleValue(event.level),
      formatCandleValue(event.breakoutExtreme),
      formatCandleValue(event.stopLoss),
      formatPoints(event.maxFavorablePoints),
    ];
    for (const value of values) {
      appendLiquidityCell(row, value);
    }
    appendBreakoutResultCell(
      row,
      event.stopHitAt ? "SL hit" : "Not hit",
      event.stopHitAt ? "stopped" : "open",
    );
    appendLiquidityCell(
      row,
      event.stopHitAt ? formatCandleTime(event.stopHitAt) : "—",
    );
    breakoutsTableBody.append(row);
  }

  breakoutChartEmpty.textContent = "";
  renderDailyMoveChart(dailyEvents, dailyStartTime, dailyEndTime);
  try {
    drawSelectedBreakout(0);
  } catch (error) {
    showBreakoutChartError(error);
  }
}

function renderDailyMoveChart(events, startTime, endTime) {
  let analysis;
  try {
    analysis = getBreakoutMoveAnalysis(events, { startTime, endTime });
  } catch (error) {
    setDailyMoveChartError(error);
    return;
  }

  const eventCount = analysis.length;
  dailyMoveChart.setAttribute(
    "aria-label",
    isHistoricalBacktest
      ? "Individual breakout moves and stop risks for the selected date"
      : `Individual breakout moves and stop risks from the last ${selectedBreakoutDays} days`,
  );
  breakoutDailyEmpty.hidden = eventCount > 0;
  breakoutDailyEmpty.textContent = isHistoricalBacktest
    ? "No breakouts on the selected date."
    : `No breakouts in the last ${selectedBreakoutDays} days.`;
  dailyMoveChart.hidden = eventCount === 0;
  dailyMovePointDetails = new Map();
  dailyMovePointCount = eventCount * 2;
  if (eventCount === 0) {
    dailyMoveSessionBoundaries = [];
    dailyMoveSessionLineLayer?.replaceChildren();
    dailyMoveSeries?.setData([]);
    breakoutDailyStatus.textContent = isHistoricalBacktest
      ? "No breakouts on selected date"
      : `No breakouts in the last ${selectedBreakoutDays} days`;
    breakoutDailyStatus.dataset.state = "";
    dailyMoveDetails.textContent = "";
    dailyChartOlderButton.disabled = true;
    dailyChartNewerButton.disabled = true;
    return;
  }

  try {
    const chartLibrary = window.LightweightCharts;
    if (!chartLibrary) {
      throw new Error("The Lightweight Charts library is unavailable.");
    }

    dailyMoveChartInstance ??= createDailyMoveChart(chartLibrary);
    const data = [];
    dailyMoveSessionBoundaries = getLocalSessionBoundaries(startTime, endTime);
    const offsetsByBreakoutTime = new Map();
    for (const event of analysis) {
      const baseTime = event.breakoutTime;
      const offset = offsetsByBreakoutTime.get(baseTime) ?? 0;
      offsetsByBreakoutTime.set(baseTime, offset + 2);
      const favorableTime = baseTime + offset;
      const riskTime = favorableTime + 1;
      const isUpside = event.side === "high";
      const direction = isUpside ? "Upside" : "Downside";
      const outcome = event.stopHitAt
        ? `SL hit at ${formatCandleTime(event.stopHitAt)}`
        : "SL not hit";
      const details = {
        event,
        direction,
        outcome,
      };
      data.push(
        {
          time: favorableTime,
          value: event.favorablePercent,
          color: isUpside ? "#31b77b" : "#ed8a61",
        },
        {
          time: riskTime,
          value: -event.stopRiskPercent,
          color: "#e25252",
        },
      );
      dailyMovePointDetails.set(favorableTime, { ...details, metric: "Favorable move", value: event.favorablePercent });
      dailyMovePointDetails.set(riskTime, { ...details, metric: "Stop risk", value: event.stopRiskPercent });
    }

    const dataTimes = new Set(data.map((point) => point.time));
    for (const boundary of dailyMoveSessionBoundaries) {
      if (!dataTimes.has(boundary)) {
        data.push({ time: boundary, value: 0, color: "#101722" });
      }
    }
    data.sort((left, right) => left.time - right.time);
    dailyMovePointCount = data.length;
    dailyMoveSeries.setData(data);
    dailyMoveChartInstance.timeScale().applyOptions({
      rightOffset: 3,
      barSpacing: 12,
    });
    if (dailyMovePointCount > 50) {
      dailyMoveChartInstance.timeScale().setVisibleLogicalRange({
        from: dailyMovePointCount - 50,
        to: dailyMovePointCount - 1,
      });
    } else {
      dailyMoveChartInstance.timeScale().fitContent();
    }
    dailyMoveDetails.textContent = "Hover over a bar to see its breakout time, percentage, level, and SL result.";
    breakoutDailyStatus.textContent = isHistoricalBacktest
      ? `${eventCount} on selected date`
      : `${eventCount} in last ${selectedBreakoutDays} days`;
    breakoutDailyStatus.dataset.state = "success";
    breakoutDailyEmpty.hidden = true;
    requestAnimationFrame(updateDailyChartView);
  } catch (error) {
    setDailyMoveChartError(error);
  }
}

function createDailyMoveChart(chartLibrary) {
  const chart = chartLibrary.createChart(dailyMoveChart, {
    autoSize: true,
    layout: {
      background: { type: chartLibrary.ColorType.Solid, color: "#101722" },
      textColor: "#aab4c3",
    },
    grid: {
      vertLines: { color: "#202b39" },
      horzLines: { color: "#202b39" },
    },
    crosshair: {
      mode: chartLibrary.CrosshairMode.Normal,
    },
    rightPriceScale: {
      visible: true,
      borderColor: "#293849",
      autoScale: true,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: { time: true, price: true },
      axisDoubleClickReset: { time: true, price: true },
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    timeScale: {
      borderColor: "#293849",
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter: (time) => new Intl.DateTimeFormat(navigator.language, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(Number(time) * 1000)),
    },
    localization: {
      timeFormatter: (time) => formatCandleTime(time),
    },
  });
  const series = chart.addSeries(chartLibrary.HistogramSeries, {
    base: 0,
    priceFormat: {
      type: "custom",
      formatter: (price) => `${Number(price).toFixed(2)}%`,
      minMove: 0.01,
    },
    lastValueVisible: false,
    priceLineVisible: false,
  });
  dailyMoveSessionLineLayer = document.createElement("div");
  dailyMoveSessionLineLayer.className = "daily-session-line-layer";
  dailyMoveSessionLineLayer.setAttribute("aria-hidden", "true");
  dailyMoveChart.append(dailyMoveSessionLineLayer);
  chart.subscribeCrosshairMove((parameter) => {
    const point = parameter.seriesData.get(series);
    const details = point ? dailyMovePointDetails.get(Number(point.time)) : undefined;
    dailyMoveDetails.textContent = details
      ? `${details.direction} · ${formatCandleTime(details.event.breakoutTime)} · ` +
        `${details.metric}: ${formatPoints(details.value)}% · ` +
        `Level ${formatCandleValue(details.event.level)} · ${details.outcome}`
      : "Hover over a bar to see its breakout time, percentage, level, and SL result.";
  });
  chart.timeScale().subscribeVisibleLogicalRangeChange(updateDailyChartView);
  new ResizeObserver(updateDailySessionLines).observe(dailyMoveChart);
  dailyMoveSeries = series;
  return chart;
}

function setDailyMoveChartError(error) {
  breakoutDailyStatus.textContent = "Chart unavailable";
  breakoutDailyStatus.dataset.state = "error";
  breakoutDailyEmpty.hidden = false;
  breakoutDailyEmpty.textContent = error.message;
  dailyMoveChart.hidden = true;
  dailyMoveDetails.textContent = "";
  dailyChartOlderButton.disabled = true;
  dailyChartNewerButton.disabled = true;
}

function updateDailyChartNavigation() {
  if (!dailyMoveChartInstance || dailyMovePointCount === 0) {
    dailyChartOlderButton.disabled = true;
    dailyChartNewerButton.disabled = true;
    return;
  }
  const range = dailyMoveChartInstance.timeScale().getVisibleLogicalRange();
  if (!range) {
    dailyChartOlderButton.disabled = true;
    dailyChartNewerButton.disabled = true;
    return;
  }
  const rangeWidth = range.to - range.from;
  const maxFrom = Math.max(0, dailyMovePointCount - 1 - rangeWidth);
  dailyChartOlderButton.disabled = range.from <= 0.5;
  dailyChartNewerButton.disabled = range.from >= maxFrom - 0.5;
}

function updateDailyChartView() {
  updateDailyChartNavigation();
  updateDailySessionLines();
}

function updateDailySessionLines() {
  if (!dailyMoveChartInstance || !dailyMoveSessionLineLayer) {
    return;
  }

  const timeScale = dailyMoveChartInstance.timeScale();
  const lines = [];
  for (const boundary of dailyMoveSessionBoundaries) {
    const x = timeScale.timeToCoordinate(boundary);
    if (x === null || !Number.isFinite(x) || x < 0 || x > dailyMoveChart.clientWidth) {
      continue;
    }
    const line = document.createElement("span");
    line.className = "daily-session-line";
    line.style.left = `${x + 1}px`;
    const label = document.createElement("span");
    label.className = "daily-session-line-label";
    label.textContent = localSessionDateFormatter.format(new Date(boundary * 1000));
    line.append(label);
    lines.push(line);
  }
  dailyMoveSessionLineLayer.replaceChildren(...lines);
}

function scrollDailyChart(direction) {
  const timeScale = dailyMoveChartInstance?.timeScale();
  const range = timeScale?.getVisibleLogicalRange();
  if (!range) {
    return;
  }
  const rangeWidth = range.to - range.from;
  const maxFrom = Math.max(0, dailyMovePointCount - 1 - rangeWidth);
  const step = Math.max(12, rangeWidth * 0.75);
  const from = Math.min(maxFrom, Math.max(0, range.from + direction * step));
  timeScale.setVisibleLogicalRange({ from, to: from + rangeWidth });
}

function appendCandleRow(candle) {
  const row = document.createElement("tr");
  const values = [
    formatCandleTime(candle.time),
    formatCandleValue(candle.open),
    formatCandleValue(candle.high),
    formatCandleValue(candle.low),
    formatCandleValue(candle.close),
    formatCandleValue(candle.volume),
  ];

  for (const value of values) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.append(cell);
  }
  candlesTableBody.append(row);
}

async function loadCandles(breakoutDays = selectedBreakoutDays) {
  isHistoricalBacktest = false;
  selectedBreakoutDays = breakoutDays;
  for (const button of quickRangeButtons) {
    button.disabled = true;
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.breakoutDays) === selectedBreakoutDays),
    );
  }
  loadCandlesButton.disabled = true;
  loadBacktestDateButton.disabled = true;
  showRecentBreakoutsButton.disabled = true;
  breakoutRangeLabel.textContent = `LAST ${selectedBreakoutDays} DAYS · LOCAL TIME`;
  backtestDateStatus.textContent = `Loading latest ${selectedBreakoutDays} days`;
  backtestDateStatus.dataset.state = "";
  candlesStatus.textContent = "Loading";
  candlesStatus.dataset.state = "";
  candlesEmpty.hidden = false;
  candlesEmpty.textContent = "Requesting candle data…";
  candlesTableWrap.hidden = true;
  candlesTableBody.replaceChildren();
  liquidityStatus.textContent = "Loading";
  liquidityStatus.dataset.state = "";
  liquidityEmpty.hidden = false;
  liquidityEmpty.textContent = "Calculating liquidity swings…";
  liquidityTableWrap.hidden = true;
  liquidityTableBody.replaceChildren();
  breakoutStatus.textContent = "Loading";
  breakoutStatus.dataset.state = "";
  breakoutEmpty.hidden = false;
  breakoutEmpty.textContent = "Analyzing broken levels…";
  breakoutsTableWrap.hidden = true;
  breakoutsTableBody.replaceChildren();
  breakoutSelect.disabled = true;
  breakoutChartWrap.hidden = true;
  breakoutChartSummary.textContent = "";
  breakoutChartEmpty.hidden = false;
  breakoutChartEmpty.textContent = "Analyzing broken levels…";
  dailyMoveChart.hidden = true;
  dailyMoveDetails.textContent = "";
  breakoutDailyStatus.textContent = "Loading";
  breakoutDailyStatus.dataset.state = "";
  breakoutDailyEmpty.hidden = false;
  breakoutDailyEmpty.textContent =
    `Loading breakouts from the last ${selectedBreakoutDays} days…`;
  dailyChartOlderButton.disabled = true;
  dailyChartNewerButton.disabled = true;

  try {
    const query = new URLSearchParams({ days: String(selectedBreakoutDays) });
    const response = await fetch(`/api/deltaexchange/market-data/candles?${query}`);
    const result = await readResponse(response);
    const candles = [...result.candles].sort((a, b) => Number(b.time) - Number(a.time));
    for (const candle of candles) {
      appendCandleRow(candle);
    }

    candlesStatus.textContent = `${candles.length.toLocaleString()} candles`;
    candlesStatus.dataset.state = "success";
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    candlesRange.textContent = `BTCUSD.P · 1 minute · Last 24 hours · Local timezone ${timeZone} · API symbol ${result.apiSymbol}`;
    candlesEmpty.hidden = candles.length > 0;
    candlesEmpty.textContent = "No candles were returned for this range.";
    candlesTableWrap.hidden = candles.length === 0;
    renderLiquiditySwings(result.liquiditySwings, result.pivotLookback);
    renderBreakoutAnalysis(
      result.liquidityBreakouts,
      result.candles,
      result.dailyLiquidityBreakouts,
      result.breakoutStart,
      result.end,
    );
    breakoutRangeLabel.textContent = `LAST ${selectedBreakoutDays} DAYS · LOCAL TIME`;
    backtestDateStatus.textContent = `Showing latest ${selectedBreakoutDays} days`;
    backtestDateStatus.dataset.state = "";
  } catch (error) {
    candlesStatus.textContent = "Request failed";
    candlesStatus.dataset.state = "error";
    candlesEmpty.textContent = error.message;
    candlesTableWrap.hidden = true;
    liquidityStatus.textContent = "Unavailable";
    liquidityStatus.dataset.state = "error";
    liquidityEmpty.textContent = error.message;
    liquidityTableWrap.hidden = true;
    breakoutStatus.textContent = "Unavailable";
    breakoutStatus.dataset.state = "error";
    breakoutEmpty.textContent = error.message;
    breakoutsTableWrap.hidden = true;
    breakoutChartEmpty.textContent = error.message;
    breakoutDailyStatus.textContent = "Unavailable";
    breakoutDailyStatus.dataset.state = "error";
    backtestDateStatus.textContent = error.message;
    backtestDateStatus.dataset.state = "error";
    breakoutDailyEmpty.textContent = error.message;
    dailyMoveChart.hidden = true;
    dailyMoveDetails.textContent = "";
    dailyChartOlderButton.disabled = true;
    dailyChartNewerButton.disabled = true;
  } finally {
    loadCandlesButton.disabled = false;
    loadBacktestDateButton.disabled = false;
    showRecentBreakoutsButton.disabled = false;
    quickRangeButtons.forEach((button) => {
      button.disabled = false;
    });
  }
}

async function loadBacktestDate() {
  let range;
  try {
    range = getLocalDateRange(backtestDateInput.value);
  } catch (error) {
    backtestDateStatus.textContent = error.message;
    backtestDateStatus.dataset.state = "error";
    return;
  }

  loadBacktestDateButton.disabled = true;
  loadCandlesButton.disabled = true;
  showRecentBreakoutsButton.disabled = true;
  quickRangeButtons.forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-pressed", "false");
  });
  isHistoricalBacktest = true;
  backtestDateStatus.textContent = "Loading selected date";
  backtestDateStatus.dataset.state = "";
  breakoutRangeLabel.textContent =
    `${new Intl.DateTimeFormat(navigator.language, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(new Date(range.start * 1000))} · LOCAL TIME`;
  breakoutStatus.textContent = "Loading";
  breakoutStatus.dataset.state = "";
  breakoutEmpty.hidden = false;
  breakoutEmpty.textContent = "Loading breakouts for the selected date…";
  breakoutsTableWrap.hidden = true;
  breakoutChartWrap.hidden = true;
  breakoutChartEmpty.hidden = false;
  breakoutChartEmpty.textContent = "Loading selected-date breakouts…";
  breakoutDailyStatus.textContent = "Loading";
  breakoutDailyStatus.dataset.state = "";
  breakoutDailyEmpty.hidden = false;
  breakoutDailyEmpty.textContent = "Loading breakouts for the selected date…";
  dailyMoveChart.hidden = true;
  dailyMoveDetails.textContent = "";
  dailyChartOlderButton.disabled = true;
  dailyChartNewerButton.disabled = true;

  try {
    const query = new URLSearchParams({
      start: String(range.start),
      end: String(range.end),
    });
    const response = await fetch(`/api/deltaexchange/market-data/candles?${query}`);
    const result = await readResponse(response);
    renderBreakoutAnalysis(
      result.liquidityBreakouts,
      result.candles,
      result.dailyLiquidityBreakouts,
      result.start,
      result.end,
    );
    const eventCount = result.liquidityBreakouts.length;
    backtestDateStatus.textContent = eventCount
      ? `${eventCount} breakout${eventCount === 1 ? "" : "s"} loaded`
      : "No breakouts on this date";
    backtestDateStatus.dataset.state = eventCount ? "success" : "";
  } catch (error) {
    backtestDateStatus.textContent = error.message;
    backtestDateStatus.dataset.state = "error";
    breakoutStatus.textContent = "Unavailable";
    breakoutStatus.dataset.state = "error";
    breakoutEmpty.hidden = false;
    breakoutEmpty.textContent = error.message;
    breakoutsTableWrap.hidden = true;
    breakoutChartEmpty.hidden = false;
    breakoutChartEmpty.textContent = error.message;
    breakoutDailyStatus.textContent = "Unavailable";
    breakoutDailyStatus.dataset.state = "error";
    breakoutDailyEmpty.hidden = false;
    breakoutDailyEmpty.textContent = error.message;
    dailyMoveChart.hidden = true;
    dailyMoveDetails.textContent = "";
  } finally {
    loadBacktestDateButton.disabled = false;
    loadCandlesButton.disabled = false;
    showRecentBreakoutsButton.disabled = false;
    quickRangeButtons.forEach((button) => {
      button.disabled = false;
    });
  }
}

backtestDateInput.max = getLocalDateString();
backtestDateInput.value = getLocalDateString();
testAuthButton.addEventListener("click", async () => {
  testAuthButton.disabled = true;
  authenticationStatus.textContent = "Testing";
  authenticationStatus.dataset.state = "";

  try {
    const response = await fetch("/api/deltaexchange/auth/test", {
      method: "POST",
    });
    const result = await readResponse(response);
    authenticationStatus.textContent = result.authenticated
      ? "Authenticated"
      : "Authentication failed";
    authenticationStatus.dataset.state = result.authenticated ? "success" : "error";
  } catch (error) {
    authenticationStatus.textContent = error.message;
    authenticationStatus.dataset.state = "error";
  } finally {
    testAuthButton.disabled = false;
  }
});

loadCandlesButton.addEventListener("click", () => loadCandles(selectedBreakoutDays));
loadBacktestDateButton.addEventListener("click", loadBacktestDate);
showRecentBreakoutsButton.addEventListener("click", () => loadCandles(3));
for (const button of quickRangeButtons) {
  button.addEventListener("click", () => {
    loadCandles(Number(button.dataset.breakoutDays));
  });
}
breakoutSelect.addEventListener("change", () => {
  try {
    drawSelectedBreakout(Number(breakoutSelect.value));
  } catch (error) {
    showBreakoutChartError(error);
  }
});
dailyChartOlderButton.addEventListener("click", () => {
  scrollDailyChart(-1);
});
dailyChartNewerButton.addEventListener("click", () => {
  scrollDailyChart(1);
});
loadConfigurationStatus();
loadCandles();
