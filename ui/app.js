const expiryDatesEndpoint = "/api/fyers/market-data/expired-fo-data/expiry-dates";
const expiryDatesForm = document.querySelector("#expiry-form");
const contractsEndpoint = "/api/fyers/market-data/expired-fo-data/contracts";
const candlesEndpoint = "/api/fyers/market-data/expired-fo-data";

function convertRangeValue(value, fromFormat, toFormat) {
  if (!value) {
    return "";
  }

  if (fromFormat === "1" && toFormat === "0") {
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isNaN(timestamp) ? "" : String(Math.floor(timestamp / 1000));
  }

  if (fromFormat === "0" && toFormat === "1") {
    const timestamp = Number(value);
    return Number.isSafeInteger(timestamp)
      ? new Date(timestamp * 1000).toISOString().slice(0, 10)
      : "";
  }

  return value;
}

function setupDateFormat(select, fromInput, toInput, helpText) {
  function update(previousFormat = select.value) {
    const nextFormat = select.value;
    const fromValue = fromInput.value;
    const toValue = toInput.value;
    const convertedFrom = previousFormat === nextFormat
      ? fromValue
      : convertRangeValue(fromValue, previousFormat, nextFormat);
    const convertedTo = previousFormat === nextFormat
      ? toValue
      : convertRangeValue(toValue, previousFormat, nextFormat);

    const usesDates = nextFormat === "1";
    for (const input of [fromInput, toInput]) {
      input.type = usesDates ? "date" : "text";
      input.inputMode = usesDates ? "text" : "numeric";
      input.placeholder = usesDates ? "YYYY-MM-DD" : "Epoch seconds";
    }

    if (previousFormat !== nextFormat) {
      fromInput.value = convertedFrom;
      toInput.value = convertedTo;
    }

    if (helpText) {
      helpText.textContent = usesDates
        ? "Range values are sent as YYYY-MM-DD dates."
        : "Range values are sent as epoch timestamps in seconds.";
    }
  }

  select.addEventListener("change", (event) => {
    update(event.target.dataset.previousFormat ?? event.target.value);
    event.target.dataset.previousFormat = event.target.value;
  });

  select.dataset.previousFormat = select.value;
  update();
}

function createRequestUrl(form, path) {
  const params = new URLSearchParams(new FormData(form));
  return `${path}?${params.toString()}`;
}

function getExpiryTableData(responseBody) {
  const expiryDates = responseBody?.data?.expiry_dates ?? responseBody?.expiry_dates;
  if (!expiryDates || typeof expiryDates !== "object") {
    return { columns: [], rows: [] };
  }

  const rows = [
    ["Futures", expiryDates.futures],
    ["Options", expiryDates.options],
  ].flatMap(([contractType, dates]) => (
    Array.isArray(dates)
      ? dates.map((date) => ({
        "Contract type": contractType,
        "Expiry date": stringifyCell(date),
      }))
      : []
  ));

  return { columns: ["Contract type", "Expiry date"], rows };
}

function getContractsTableData(responseBody) {
  const contracts = responseBody?.data?.contracts ?? responseBody?.contracts;
  if (!contracts || typeof contracts !== "object") {
    return { columns: [], rows: [] };
  }

  const entries = [
    ["Futures", contracts.futures],
    ["Options", contracts.options],
  ].flatMap(([contractType, items]) => (
    Array.isArray(items) ? items.map((item) => ({ contractType, item })) : []
  ));
  const detailKeys = [...new Set(entries.flatMap(({ item }) => (
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.keys(item)
      : []
  )))];
  const hasSimpleContracts = entries.some(({ item }) => (
    !item || typeof item !== "object" || Array.isArray(item)
  ));
  const columns = [
    "Contract type",
    ...detailKeys,
    ...(!detailKeys.length || hasSimpleContracts ? ["Contract"] : []),
  ];
  const rows = entries.map(({ contractType, item }) => {
    const row = { "Contract type": contractType };
    for (const key of detailKeys) {
      row[key] = item && typeof item === "object" && !Array.isArray(item)
        ? stringifyCell(item[key])
        : "";
    }
    if (!detailKeys.length || hasSimpleContracts) {
      row.Contract = item && typeof item === "object" && !Array.isArray(item)
        ? ""
        : stringifyCell(item);
    }
    return row;
  });

  return { columns, rows };
}

function getCandleTableData(responseBody) {
  const candles = responseBody?.candles ?? responseBody?.data?.candles;
  if (!Array.isArray(candles) || candles.length === 0) {
    return { columns: [], rows: [] };
  }

  const objectCandles = candles.filter((candle) => (
    candle && typeof candle === "object" && !Array.isArray(candle)
  ));
  if (objectCandles.length > 0) {
    const columns = [...new Set(objectCandles.flatMap((candle) => Object.keys(candle)))];
    const rows = candles.map((candle) => Object.fromEntries(
      columns.map((column) => [
        column,
        candle && typeof candle === "object" && !Array.isArray(candle)
          ? stringifyCell(candle[column])
          : "",
      ]),
    ));
    return { columns, rows };
  }

  const candleFields = [
    "Timestamp",
    "Open",
    "High",
    "Low",
    "Close",
    "Volume",
    "Open interest",
    "Greeks",
  ];
  const fieldCount = candles.reduce((count, candle) => (
    Math.max(count, Array.isArray(candle) ? candle.length : 0)
  ), 0);
  const columns = Array.from({ length: fieldCount }, (_, index) => (
    candleFields[index] ?? `Value ${index + 1}`
  ));
  const rows = candles.map((candle) => Object.fromEntries(
    columns.map((column, index) => [
      column,
      Array.isArray(candle) ? stringifyCell(candle[index]) : "",
    ]),
  ));
  return { columns, rows };
}

function stringifyCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function renderTable(head, body, columns, rows) {
  head.replaceChildren();
  body.replaceChildren();
  if (!rows.length) {
    return;
  }

  const headerRow = document.createElement("tr");
  for (const column of columns) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = column;
    headerRow.append(cell);
  }
  head.append(headerRow);

  for (const row of rows) {
    const tableRow = document.createElement("tr");
    for (const column of columns) {
      const cell = document.createElement("td");
      cell.textContent = row[column] ?? "";
      tableRow.append(cell);
    }
    body.append(tableRow);
  }
}

function bindTableRequest({
  form,
  path,
  status,
  emptyState,
  tableWrap,
  tableHead,
  tableBody,
  rawResponse,
  rawOutput,
  getTableData,
  searchWrap,
  searchInput,
  searchCount,
  loadingMessage,
  emptyMessage,
}) {
  let allRows = [];

  function applyLocalSearch() {
    const query = searchInput.value.trim().toLowerCase();
    const filteredRows = allRows.filter((row) => (
      Object.values(row).some((value) => String(value).toLowerCase().includes(query))
    ));

    renderTable(tableHead, tableBody, Object.keys(allRows[0] ?? {}), filteredRows);
    tableWrap.hidden = filteredRows.length === 0;
    emptyState.hidden = filteredRows.length > 0;
    emptyState.textContent = allRows.length > 0
      ? "No rows match your search."
      : emptyMessage;
    searchCount.textContent = query
      ? `${filteredRows.length} of ${allRows.length}`
      : `${allRows.length} results`;
  }

  searchInput.addEventListener("input", applyLocalSearch);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      return;
    }

    const url = createRequestUrl(form, path);
    status.textContent = "Loading…";
    status.dataset.state = "";
    allRows = [];
    searchInput.value = "";
    searchWrap.hidden = true;
    tableWrap.hidden = true;
    emptyState.hidden = false;
    emptyState.textContent = loadingMessage;
    rawResponse.hidden = true;

    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      const response = await fetch(url, {
        headers: { Accept: "*/*" },
      });
      const body = await response.text();
      let responseBody;
      let formattedBody = body || "(empty response)";
      try {
        responseBody = JSON.parse(body);
        formattedBody = JSON.stringify(responseBody, null, 2);
      } catch {
        responseBody = null;
      }

      const { columns, rows } = getTableData(responseBody);
      allRows = rows;
      searchWrap.hidden = rows.length === 0;
      if (rows.length > 0) {
        applyLocalSearch();
      } else {
        renderTable(tableHead, tableBody, columns, rows);
        tableWrap.hidden = true;
        emptyState.hidden = false;
        emptyState.textContent = response.ok
          ? emptyMessage
          : "Request failed. Check the raw response for details.";
      }
      rawOutput.textContent = formattedBody;
      rawResponse.hidden = false;
      status.textContent = `HTTP ${response.status}`;
      status.dataset.state = response.ok ? "success" : "error";
    } catch (error) {
      tableWrap.hidden = true;
      searchWrap.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent = `Request failed: ${error.message}`;
      status.textContent = "Network error";
      status.dataset.state = "error";
    } finally {
      submitButton.disabled = false;
    }
  });
}

bindTableRequest({
  form: expiryDatesForm,
  path: expiryDatesEndpoint,
  status: document.querySelector("#request-status"),
  emptyState: document.querySelector("#response-empty"),
  tableWrap: document.querySelector("#response-table-wrap"),
  tableHead: document.querySelector("#response-table-head"),
  tableBody: document.querySelector("#response-table-body"),
  rawResponse: document.querySelector("#raw-response"),
  rawOutput: document.querySelector("#raw-response-output"),
  getTableData: getExpiryTableData,
  searchWrap: document.querySelector("#expiry-search-wrap"),
  searchInput: document.querySelector("#expiry-search"),
  searchCount: document.querySelector("#expiry-search-count"),
  loadingMessage: "Requesting expiry dates…",
  emptyMessage: "No expiry dates were returned for this range.",
});

bindTableRequest({
  form: document.querySelector("#contracts-form"),
  path: contractsEndpoint,
  status: document.querySelector("#contracts-status"),
  emptyState: document.querySelector("#contracts-empty"),
  tableWrap: document.querySelector("#contracts-table-wrap"),
  tableHead: document.querySelector("#contracts-table-head"),
  tableBody: document.querySelector("#contracts-table-body"),
  rawResponse: document.querySelector("#contracts-raw-response"),
  rawOutput: document.querySelector("#contracts-raw-response-output"),
  getTableData: getContractsTableData,
  searchWrap: document.querySelector("#contracts-search-wrap"),
  searchInput: document.querySelector("#contracts-search"),
  searchCount: document.querySelector("#contracts-search-count"),
  loadingMessage: "Requesting expired contracts…",
  emptyMessage: "No contracts were returned for this expiry date.",
});

bindTableRequest({
  form: document.querySelector("#candles-form"),
  path: candlesEndpoint,
  status: document.querySelector("#candles-status"),
  emptyState: document.querySelector("#candles-empty"),
  tableWrap: document.querySelector("#candles-table-wrap"),
  tableHead: document.querySelector("#candles-table-head"),
  tableBody: document.querySelector("#candles-table-body"),
  rawResponse: document.querySelector("#candles-raw-response"),
  rawOutput: document.querySelector("#candles-raw-response-output"),
  getTableData: getCandleTableData,
  searchWrap: document.querySelector("#candles-search-wrap"),
  searchInput: document.querySelector("#candles-search"),
  searchCount: document.querySelector("#candles-search-count"),
  loadingMessage: "Requesting historical candles…",
  emptyMessage: "No candles were returned for this symbol and range.",
});

setupDateFormat(
  document.querySelector("#date-format"),
  document.querySelector("#range-from"),
  document.querySelector("#range-to"),
  document.querySelector("#date-format-help"),
);
setupDateFormat(
  document.querySelector("#candle-date-format"),
  document.querySelector("#candle-range-from"),
  document.querySelector("#candle-range-to"),
  document.querySelector("#candle-date-format-help"),
);
