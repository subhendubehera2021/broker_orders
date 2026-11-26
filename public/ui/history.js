const historyEndpoint = "/api/internal/liquidity-swing-history";
const historyEmpty = document.querySelector("#history-empty");
const historyTableWrap = document.querySelector("#history-table-wrap");
const historyTableBody = document.querySelector("#history-table-body");
const historyPivotTimeFilter = document.querySelector("#history-filter-pivot-time");
const historyResolutionFilter = document.querySelector("#history-filter-resolution");
const historyResolutionQuickFilters = [
  ...document.querySelectorAll("[data-history-resolution]"),
];
const historyTypeQuickFilters = [
  ...document.querySelectorAll("[data-history-type]"),
];
const historyStatusQuickFilters = [
  ...document.querySelectorAll("[data-history-status]"),
];
const historyTradedQuickFilters = [
  ...document.querySelectorAll("[data-history-traded]"),
];
const historyLookbackQuickFilters = [
  ...document.querySelectorAll("[data-history-lookback]"),
];
const historyLimit = document.querySelector("#history-limit");
const historyShowDeleted = document.querySelector("#history-show-deleted");
const historyCount = document.querySelector("#history-count");
const historyPageStatus = document.querySelector("#history-page-status");
const historyRefresh = document.querySelector("#history-refresh");
const historyPrevious = document.querySelector("#history-previous");
const historyNext = document.querySelector("#history-next");
const historyAuthModal = document.querySelector("#history-auth-modal");
const historyAuthTrigger = document.querySelector("#history-auth-trigger");
const historyAuthClose = document.querySelector("#history-auth-close");
const historyAuthForm = document.querySelector("#history-auth-form");
const historyApiKeyInput = document.querySelector("#history-api-key");
const historyUnlock = document.querySelector("#history-unlock");
const historyLock = document.querySelector("#history-lock");
const historyAuthStatus = document.querySelector("#history-auth-status");
const historyAnalysisModal = document.querySelector("#history-analysis-modal");
const historyAnalysisForm = document.querySelector("#history-analysis-form");
const historyAnalysisClose = document.querySelector("#history-analysis-close");
const historyAnalysisCancel = document.querySelector("#history-analysis-cancel");
const historyAnalysisRowId = document.querySelector("#history-analysis-row-id");
const historyAnalysisSave = document.querySelector("#history-analysis-save");
const historyAnalysisStatus = document.querySelector("#history-analysis-status");
const historyAnalysisInputs = {
  comment: document.querySelector("#history-analysis-comment"),
  is_traded: document.querySelector("#history-analysis-is-traded"),
  buy_price: document.querySelector("#history-analysis-buy-price"),
  sell_price: document.querySelector("#history-analysis-sell-price"),
  high: document.querySelector("#history-analysis-high"),
  sl: document.querySelector("#history-analysis-sl"),
  c_low: document.querySelector("#history-analysis-c-low"),
  qty: document.querySelector("#history-analysis-qty"),
  p_l: document.querySelector("#history-analysis-p-l"),
};

let historyRows = [];
let historyTotal = 0;
let historyOffset = 0;
let historyLoading = false;
let historyReloadPending = false;
let historyMutationLoading = false;
let historyError = "";
let masterApiKey = "";

function getSwing(row) {
  try {
    return JSON.parse(row.swing_json);
  } catch {
    return null;
  }
}

function getSelectedFilterValue(buttons, dataKey, fallback = "") {
  const selectedButton = buttons.find(
    (button) => button.getAttribute("aria-pressed") === "true",
  );
  return selectedButton ? selectedButton.dataset[dataKey] : fallback;
}

function setSelectedFilterButton(buttons, selectedButton) {
  for (const button of buttons) {
    button.setAttribute("aria-pressed", String(button === selectedButton));
  }
}

function getSelectedResolution() {
  return getSelectedFilterValue(
    historyResolutionQuickFilters,
    "historyResolution",
    historyResolutionFilter.value,
  );
}

function getSelectedLookback() {
  return getSelectedFilterValue(historyLookbackQuickFilters, "historyLookback");
}

function getSelectedType() {
  return getSelectedFilterValue(historyTypeQuickFilters, "historyType");
}

function getSelectedStatus() {
  return getSelectedFilterValue(historyStatusQuickFilters, "historyStatus");
}

function getSelectedTraded() {
  return getSelectedFilterValue(historyTradedQuickFilters, "historyTraded");
}

function appendHistoryCell(tableRow, value) {
  const cell = document.createElement("td");
  cell.textContent = value === null || value === undefined || value === ""
    ? "-"
    : String(value);
  tableRow.append(cell);
}

function formatLocalDateTime(value) {
  if (value === null || value === undefined || value === "") {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function openHistoryAnalysis(row) {
  historyAnalysisRowId.value = row.id;
  historyAnalysisInputs.comment.value = row.comment ?? "";
  historyAnalysisInputs.is_traded.checked = row.is_traded;
  for (const field of [
    "buy_price",
    "sell_price",
    "high",
    "sl",
    "c_low",
    "qty",
    "p_l",
  ]) {
    historyAnalysisInputs[field].value = row[field] ?? "";
  }
  historyAnalysisStatus.textContent = "";
  historyAnalysisStatus.dataset.state = "";
  historyAnalysisModal.showModal();
}

function renderHistoryRows(rows) {
  historyTableBody.replaceChildren();

  for (const row of rows) {
    const swing = getSwing(row);
    const tableRow = document.createElement("tr");
    appendHistoryCell(tableRow, row.id);

    const values = [
      row.option_symbol,
      row.option_type,
      row.resolution,
      row.pivot_lookback,
      swing?.level,
      formatLocalDateTime(row.pivot_time ?? swing?.pivotTime),
      formatLocalDateTime(row.recorded_at),
      `${row.from_date} to ${row.to_date}`,
      swing?.status,
      row.comment,
      row.is_traded ? "Yes" : "No",
      row.buy_price,
      row.sell_price,
      row.high,
      row.sl,
      row.c_low,
      row.qty,
      row.p_l,
    ];
    for (const value of values) {
      appendHistoryCell(tableRow, value);
    }

    const detailsCell = document.createElement("td");
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const output = document.createElement("pre");
    summary.textContent = "View JSON";
    try {
      output.textContent = JSON.stringify(JSON.parse(row.swing_json), null, 2);
    } catch {
      summary.textContent = "Invalid JSON";
      output.textContent = String(row.swing_json ?? "");
    }
    details.append(summary, output);
    detailsCell.append(details);
    tableRow.append(detailsCell);

    const actionCell = document.createElement("td");
    const actionButtons = document.createElement("div");
    actionButtons.className = "history-row-actions";
    const editButton = document.createElement("button");
    editButton.className = "secondary-button history-analysis-edit-button";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.disabled = !masterApiKey || historyLoading || historyMutationLoading;
    editButton.setAttribute("aria-label", `Edit analysis for history row ${row.id}`);
    editButton.addEventListener("click", () => openHistoryAnalysis(row));

    const actionButton = document.createElement("button");
    actionButton.className = "secondary-button";
    actionButton.type = "button";
    actionButton.textContent = row.is_deleted ? "Restore" : "🗑";
    if (!row.is_deleted) {
      actionButton.classList.add("history-delete-button");
      actionButton.title = "Delete";
    }
    actionButton.disabled = !masterApiKey || historyLoading || historyMutationLoading;
    actionButton.setAttribute(
      "aria-label",
      `${row.is_deleted ? "Restore" : "Soft-delete"} history row ${row.id}`,
    );
    actionButton.addEventListener("click", () => updateHistoryDeletion(row));
    actionButtons.append(editButton, actionButton);
    actionCell.append(actionButtons);
    tableRow.append(actionCell);
    historyTableBody.append(tableRow);
  }
}

function updateHistoryTable() {
  renderHistoryRows(historyRows);
  historyTableWrap.hidden = historyRows.length === 0;
  historyEmpty.hidden = historyRows.length > 0;
  historyEmpty.textContent = historyError || (historyTotal === 0
    ? "No rows match the selected filters."
    : "No rows on this page.");
  historyCount.textContent = `${historyRows.length} rows loaded; ${historyTotal} matching total`;

  const pageNumber = Math.floor(historyOffset / Number(historyLimit.value)) + 1;
  const pageCount = Math.max(1, Math.ceil(historyTotal / Number(historyLimit.value)));
  historyPageStatus.textContent = `Page ${pageNumber} of ${pageCount}`;
  historyPrevious.disabled = historyLoading || historyMutationLoading || historyOffset === 0;
  historyNext.disabled = historyLoading
    || historyMutationLoading
    || historyOffset + historyRows.length >= historyTotal;
  historyRefresh.disabled = historyLoading || historyMutationLoading;
  historyAnalysisSave.disabled = !masterApiKey || historyMutationLoading;
}

async function loadHistory() {
  if (historyLoading) {
    historyReloadPending = true;
    return;
  }

  historyLoading = true;
  historyError = "";
  historyEmpty.hidden = false;
  historyEmpty.textContent = "Loading saved swing history…";
  historyTableWrap.hidden = true;
  historyRefresh.disabled = true;
  historyPrevious.disabled = true;
  historyNext.disabled = true;

  const params = new URLSearchParams({
    limit: historyLimit.value,
    offset: String(historyOffset),
    includeDeleted: historyShowDeleted.checked ? "1" : "0",
  });
  const filters = {
    resolution: getSelectedResolution(),
    optionType: getSelectedType(),
    lookback: getSelectedLookback(),
    status: getSelectedStatus(),
    traded: getSelectedTraded(),
  };
  for (const [name, value] of Object.entries(filters)) {
    if (value !== "") {
      params.set(name, value);
    }
  }
  if (historyPivotTimeFilter.value) {
    const start = new Date(`${historyPivotTimeFilter.value}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    params.set("pivotTimeFrom", start.toISOString());
    params.set("pivotTimeTo", end.toISOString());
  }

  try {
    const response = await fetch(`${historyEndpoint}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? `Request failed with HTTP ${response.status}.`);
    }
    if (
      !Array.isArray(body.rows) ||
      !Number.isSafeInteger(body.total) ||
      body.rows.some((row) => typeof row.is_deleted !== "boolean")
    ) {
      throw new Error("The history endpoint returned an invalid response.");
    }

    historyRows = body.rows;
    historyTotal = body.total;
  } catch (error) {
    historyRows = [];
    historyTotal = 0;
    historyError = error.message;
  } finally {
    historyLoading = false;
    if (historyReloadPending) {
      historyReloadPending = false;
      loadHistory();
    } else {
      updateHistoryTable();
    }
  }
}

function resetPageAndLoadHistory() {
  historyOffset = 0;
  loadHistory();
}

function lockHistoryActions(message = "Actions are locked.") {
  masterApiKey = "";
  historyApiKeyInput.value = "";
  historyApiKeyInput.disabled = false;
  historyUnlock.hidden = false;
  historyLock.hidden = true;
  historyAuthStatus.textContent = message;
  historyAuthStatus.dataset.state = "";
  updateHistoryTable();
}

async function updateHistoryDeletion(row) {
  if (!masterApiKey || historyMutationLoading) {
    return;
  }

  const isDeleted = !row.is_deleted;
  const verb = isDeleted ? "soft-delete" : "restore";
  if (!window.confirm(`Are you sure you want to ${verb} history row ${row.id}?`)) {
    return;
  }

  historyMutationLoading = true;
  historyAuthStatus.textContent = `${isDeleted ? "Deleting" : "Restoring"} row ${row.id}…`;
  historyAuthStatus.dataset.state = "";
  updateHistoryTable();

  try {
    const response = await fetch(`${historyEndpoint}/${row.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-apikey": masterApiKey,
      },
      body: JSON.stringify({ is_deleted: isDeleted }),
    });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        lockHistoryActions("Invalid master key or passcode. Enter it again.");
        if (!historyAuthModal.open) {
          historyAuthModal.showModal();
        }
      }
      throw new Error(body.error ?? `Request failed with HTTP ${response.status}.`);
    }

    historyAuthStatus.textContent = isDeleted ? "Record soft-deleted." : "Record restored.";
    historyAuthStatus.dataset.state = "success";
    if (
      isDeleted &&
      !historyShowDeleted.checked &&
      historyRows.length === 1 &&
      historyOffset > 0
    ) {
      historyOffset = Math.max(0, historyOffset - Number(historyLimit.value));
    }
    await loadHistory();
  } catch (error) {
    historyAuthStatus.textContent = error.message;
    historyAuthStatus.dataset.state = "error";
  } finally {
    historyMutationLoading = false;
    updateHistoryTable();
  }
}

async function updateHistoryAnalysis(event) {
  event.preventDefault();
  if (!masterApiKey || historyMutationLoading) {
    return;
  }

  const analysis = {
    comment: historyAnalysisInputs.comment.value.trim() || null,
    is_traded: historyAnalysisInputs.is_traded.checked,
  };
  for (const field of [
    "buy_price",
    "sell_price",
    "high",
    "sl",
    "c_low",
    "qty",
    "p_l",
  ]) {
    const value = historyAnalysisInputs[field].value;
    analysis[field] = value === "" ? null : Number(value);
  }

  historyMutationLoading = true;
  historyAnalysisStatus.textContent = "Saving analysis…";
  historyAnalysisStatus.dataset.state = "";
  updateHistoryTable();

  try {
    const id = Number(historyAnalysisRowId.value);
    const response = await fetch(`${historyEndpoint}/${id}/analysis`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-apikey": masterApiKey,
      },
      body: JSON.stringify(analysis),
    });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        lockHistoryActions("Invalid master key or passcode. Enter it again.");
        if (!historyAuthModal.open) {
          historyAuthModal.showModal();
        }
      }
      throw new Error(body.error ?? `Request failed with HTTP ${response.status}.`);
    }

    await loadHistory();
    historyAnalysisModal.close();
    historyAuthStatus.textContent = "Analysis saved.";
    historyAuthStatus.dataset.state = "success";
  } catch (error) {
    historyAnalysisStatus.textContent = error.message;
    historyAnalysisStatus.dataset.state = "error";
  } finally {
    historyMutationLoading = false;
    updateHistoryTable();
  }
}

historyPivotTimeFilter.addEventListener("input", resetPageAndLoadHistory);
for (const button of historyResolutionQuickFilters) {
  button.addEventListener("click", () => {
    historyResolutionFilter.value = "";
    setSelectedFilterButton(historyResolutionQuickFilters, button);
    resetPageAndLoadHistory();
  });
}
historyResolutionFilter.addEventListener("change", () => {
  const allButton = historyResolutionQuickFilters.find(
    (button) => button.dataset.historyResolution === "",
  );
  setSelectedFilterButton(
    historyResolutionQuickFilters,
    historyResolutionFilter.value ? null : allButton,
  );
  resetPageAndLoadHistory();
});
for (const button of historyTypeQuickFilters) {
  button.addEventListener("click", () => {
    setSelectedFilterButton(historyTypeQuickFilters, button);
    resetPageAndLoadHistory();
  });
}
for (const button of historyStatusQuickFilters) {
  button.addEventListener("click", () => {
    setSelectedFilterButton(historyStatusQuickFilters, button);
    resetPageAndLoadHistory();
  });
}
for (const button of historyTradedQuickFilters) {
  button.addEventListener("click", () => {
    setSelectedFilterButton(historyTradedQuickFilters, button);
    resetPageAndLoadHistory();
  });
}
for (const button of historyLookbackQuickFilters) {
  button.addEventListener("click", () => {
    setSelectedFilterButton(historyLookbackQuickFilters, button);
    resetPageAndLoadHistory();
  });
}
historyLimit.addEventListener("change", () => {
  historyOffset = 0;
  loadHistory();
});
historyShowDeleted.addEventListener("change", () => {
  historyOffset = 0;
  loadHistory();
});
historyRefresh.addEventListener("click", loadHistory);
historyPrevious.addEventListener("click", () => {
  historyOffset = Math.max(0, historyOffset - Number(historyLimit.value));
  loadHistory();
});
historyNext.addEventListener("click", () => {
  if (historyOffset + historyRows.length < historyTotal) {
    historyOffset += Number(historyLimit.value);
    loadHistory();
  }
});
historyAuthTrigger.addEventListener("click", () => historyAuthModal.showModal());
historyAuthClose.addEventListener("click", () => historyAuthModal.close());
historyAuthModal.addEventListener("close", () => {
  if (!masterApiKey) {
    historyApiKeyInput.value = "";
    historyAuthStatus.textContent = "Actions are locked.";
    historyAuthStatus.dataset.state = "";
  }
});
historyAuthForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const key = historyApiKeyInput.value.trim();
  if (!key) {
    historyAuthStatus.textContent = "Enter the master key or passcode to unlock actions.";
    historyAuthStatus.dataset.state = "error";
    return;
  }

  masterApiKey = key;
  historyApiKeyInput.value = "";
  historyApiKeyInput.disabled = true;
  historyUnlock.hidden = true;
  historyLock.hidden = false;
  historyAuthStatus.textContent = "History actions unlocked for this page.";
  historyAuthStatus.dataset.state = "success";
  updateHistoryTable();
  historyAuthModal.close();
});
historyAnalysisForm.addEventListener("submit", updateHistoryAnalysis);
historyAnalysisClose.addEventListener("click", () => historyAnalysisModal.close());
historyAnalysisCancel.addEventListener("click", () => historyAnalysisModal.close());
historyLock.addEventListener("click", () => lockHistoryActions());
loadHistory();
