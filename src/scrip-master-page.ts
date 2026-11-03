export function renderNseFoScripMasterPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#10120f">
    <title>NSE F&O Scrip Master · Neo Desk</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #10120f; color: #f3f4ee; --muted: #898e84; --line: #292d26; --green: #c8f169; }
      * { box-sizing: border-box; }
      body { min-width: 320px; min-height: 100vh; margin: 0; background: radial-gradient(ellipse at 18% 0%, rgb(200 241 105 / 8%), transparent 34rem), #10120f; }
      .shell { max-width: 1440px; min-height: 100vh; margin: auto; padding: 24px 4vw; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
      .brand { display: inline-flex; gap: 12px; align-items: center; color: inherit; text-decoration: none; }
      .brand-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; background: var(--green); color: #141810; font-size: 15px; font-weight: 850; }
      .brand-name { font-size: 14px; font-weight: 700; }
      .brand-caption { margin-top: 2px; color: var(--muted); font-size: 10px; letter-spacing: .13em; text-transform: uppercase; }
      .nav { display: flex; gap: 18px; align-items: center; }
      .nav a { color: #a9aea3; font-size: 12px; text-decoration: none; }
      .nav a:hover { color: var(--green); }
      main { padding: clamp(36px, 7vh, 68px) 0 24px; }
      .eyebrow { margin: 0 0 10px; color: var(--green); font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(32px, 5vw, 48px); font-weight: 600; letter-spacing: -.055em; }
      .intro { max-width: 680px; margin: 10px 0 26px; color: var(--muted); font-size: 13px; line-height: 1.7; }
      .panel { padding: 20px; border: 1px solid #30342c; border-radius: 14px; background: linear-gradient(145deg, #1a1d18, #151713 80%); }
      .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
      #search { width: min(100%, 400px); height: 42px; padding: 0 12px; border: 1px solid #34382f; border-radius: 8px; outline: none; background: #11130f; color: #f3f4ee; font: inherit; font-size: 12px; }
      #search:focus { border-color: #9cbe57; box-shadow: 0 0 0 3px rgb(200 241 105 / 10%); }
      .status { min-height: 20px; margin: 14px 0; color: #a9aea3; font-size: 12px; }
      .status[data-kind="error"] { color: #f3a5a0; }
      .table-wrap { max-height: 68vh; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; white-space: nowrap; }
      th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; }
      th { position: sticky; top: 0; z-index: 1; background: #20231d; color: var(--green); font-weight: 700; }
      td { color: #d7dad1; }
      tr:last-child td { border-bottom: 0; }
      .pagination { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding-top: 14px; color: var(--muted); font-size: 11px; }
      .page-controls { display: flex; gap: 8px; }
      button { min-height: 34px; padding: 0 12px; border: 1px solid #383d33; border-radius: 7px; background: #22261f; color: #e5e9dd; cursor: pointer; font: inherit; font-size: 11px; }
      button:hover:not(:disabled) { border-color: #9cbe57; color: var(--green); }
      button:disabled { cursor: default; opacity: .45; }
      [hidden] { display: none !important; }
      @media (max-width: 600px) { .shell { padding: 18px 14px; } .panel { padding: 12px; } .nav { gap: 12px; } .nav a { font-size: 11px; } .pagination { align-items: flex-start; flex-direction: column; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <a class="brand" href="/" aria-label="Neo Desk home">
          <span class="brand-mark" aria-hidden="true">N.</span>
          <span><span class="brand-name">Neo Desk</span><br><span class="brand-caption">Trading API</span></span>
        </a>
        <nav class="nav" aria-label="Main navigation"><a href="/margin">Margin calculator</a><a href="/">Sign in</a></nav>
      </header>
      <main>
        <p class="eyebrow">Instrument reference</p>
        <h1>NSE F&amp;O Scrip Master</h1>
        <p class="intro">Browse the full NSE derivatives instrument list from Kotak Neo. Search across all fields to find an instrument token or contract.</p>
        <section class="panel" aria-label="NSE F&O instrument list">
          <div class="toolbar">
            <input id="search" type="search" placeholder="Search instruments…" aria-label="Search all instrument fields" disabled>
            <a href="/api/scrip-master/nse-fo" download="nse_fo.csv" style="color:#a9aea3;font-size:11px">Download CSV</a>
          </div>
          <p class="status" id="status" role="status" aria-live="polite">Loading the NSE F&amp;O instrument list…</p>
          <div class="table-wrap" id="table-wrap" hidden>
            <table><thead id="table-head"></thead><tbody id="table-body"></tbody></table>
          </div>
          <div class="pagination" id="pagination" hidden>
            <span id="row-count"></span>
            <div class="page-controls">
              <button id="previous" type="button">Previous</button>
              <span id="page-count" style="align-self:center"></span>
              <button id="next" type="button">Next</button>
            </div>
          </div>
        </section>
      </main>
    </div>
    <script>
      const status = document.querySelector("#status");
      const search = document.querySelector("#search");
      const tableWrap = document.querySelector("#table-wrap");
      const tableHead = document.querySelector("#table-head");
      const tableBody = document.querySelector("#table-body");
      const pagination = document.querySelector("#pagination");
      const rowCount = document.querySelector("#row-count");
      const pageCount = document.querySelector("#page-count");
      const previous = document.querySelector("#previous");
      const next = document.querySelector("#next");
      const pageSize = 100;
      let columns = [];
      let rows = [];
      let page = 0;

      function parseCsv(text) {
        const records = [];
        let record = [];
        let field = "";
        let quoted = false;
        for (let index = 0; index < text.length; index += 1) {
          const character = text[index];
          if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
              field += '"';
              index += 1;
            } else if (character === '"') {
              quoted = false;
            } else {
              field += character;
            }
          } else if (character === '"' && field.length === 0) {
            quoted = true;
          } else if (character === ",") {
            record.push(field);
            field = "";
          } else if (character === "\\n" || character === "\\r") {
            if (character === "\\r" && text[index + 1] === "\\n") index += 1;
            record.push(field);
            if (record.some((value) => value.length > 0)) records.push(record);
            record = [];
            field = "";
          } else {
            field += character;
          }
        }
        if (field.length > 0 || record.length > 0) {
          record.push(field);
          records.push(record);
        }
        return records;
      }

      function setStatus(message, kind = "") {
        status.textContent = message;
        status.dataset.kind = kind;
      }

      function render() {
        const term = search.value.trim().toLocaleLowerCase();
        const filtered = term
          ? rows.filter((row) => row.some((value) => value.toLocaleLowerCase().includes(term)))
          : rows;
        const pageTotal = Math.ceil(filtered.length / pageSize);
        page = Math.min(page, Math.max(0, pageTotal - 1));
        const start = page * pageSize;
        const shown = filtered.slice(start, start + pageSize);
        tableHead.replaceChildren();
        tableBody.replaceChildren();

        const headerRow = document.createElement("tr");
        for (const column of columns) {
          const cell = document.createElement("th");
          cell.scope = "col";
          cell.textContent = column;
          headerRow.append(cell);
        }
        tableHead.append(headerRow);
        for (const row of shown) {
          const tableRow = document.createElement("tr");
          for (let index = 0; index < columns.length; index += 1) {
            const cell = document.createElement("td");
            cell.textContent = row[index] ?? "";
            tableRow.append(cell);
          }
          tableBody.append(tableRow);
        }

        rowCount.textContent = "Showing " + (filtered.length ? start + 1 : 0) + "–" + Math.min(start + pageSize, filtered.length) + " of " + filtered.length + " instruments";
        pageCount.textContent = "Page " + (pageTotal ? page + 1 : 0) + " of " + pageTotal;
        previous.disabled = page === 0;
        next.disabled = page + 1 >= pageTotal;
        pagination.hidden = false;
        tableWrap.hidden = false;
        setStatus(rows.length + " instruments loaded · " + columns.length + " fields");
      }

      search.addEventListener("input", () => { page = 0; render(); });
      previous.addEventListener("click", () => { page -= 1; render(); });
      next.addEventListener("click", () => { page += 1; render(); });

      async function loadMaster() {
        try {
          const response = await fetch("/api/scrip-master/nse-fo", { headers: { Accept: "text/csv" } });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Could not load the NSE F&O instrument list.");
          }
          const records = parseCsv((await response.text()).replace(/^\\uFEFF/, ""));
          if (records.length < 2) throw new Error("The NSE F&O Scrip Master file is empty or invalid.");
          columns = records[0].map((column) => column.trim());
          rows = records.slice(1).filter((row) => row.some((value) => value.length > 0));
          if (columns.length === 0 || rows.length === 0) throw new Error("No NSE F&O instruments were found.");
          search.disabled = false;
          render();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not load the NSE F&O instrument list.", "error");
        }
      }

      loadMaster();
    </script>
  </body>
</html>`;
}
