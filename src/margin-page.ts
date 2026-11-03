export function renderMarginPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#10120f">
    <title>Margin calculator · Neo Desk</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #10120f;
        color: #f3f4ee;
        --muted: #898e84;
        --line: #292d26;
        --green: #c8f169;
      }
      * { box-sizing: border-box; }
      body { min-width: 320px; min-height: 100vh; margin: 0; background: radial-gradient(ellipse at 18% 0%, rgb(200 241 105 / 8%), transparent 34rem), #10120f; }
      .shell { max-width: 980px; min-height: 100vh; margin: auto; padding: 28px 5.5vw 24px; }
      header { display: flex; align-items: center; justify-content: space-between; }
      .brand { display: inline-flex; gap: 12px; align-items: center; color: inherit; text-decoration: none; }
      .brand-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; background: var(--green); color: #141810; font-size: 15px; font-weight: 850; }
      .brand-name { font-size: 14px; font-weight: 700; }
      .brand-caption { margin-top: 2px; color: var(--muted); font-size: 10px; letter-spacing: .13em; text-transform: uppercase; }
      .back-link { color: #a9aea3; font-size: 12px; text-decoration: none; }
      .back-link:hover { color: var(--green); }
      main { padding: clamp(42px, 8vh, 86px) 0; }
      .eyebrow { margin: 0 0 12px; color: var(--green); font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(34px, 6vw, 54px); font-weight: 600; letter-spacing: -.055em; }
      .intro { max-width: 560px; margin: 12px 0 30px; color: var(--muted); font-size: 13px; line-height: 1.7; }
      .card { padding: clamp(22px, 4vw, 34px); border: 1px solid #30342c; border-radius: 16px; background: linear-gradient(145deg, #1a1d18, #151713 80%); box-shadow: 0 30px 100px rgb(0 0 0 / 28%); }
      .notice { margin: 0; color: #c9cfc0; font-size: 12px; line-height: 1.6; }
      .status { margin: 12px 0 0; color: #f3a5a0; font-size: 12px; line-height: 1.6; }
      .status[data-kind="success"] { color: var(--green); }
      .status a { color: var(--green); }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 16px; margin-top: 18px; }
      .field { margin-top: 14px; }
      label { display: block; margin-bottom: 8px; color: #d7dad1; font-size: 11px; font-weight: 600; }
      input, select { width: 100%; height: 44px; padding: 0 13px; border: 1px solid #34382f; border-radius: 8px; outline: none; background: #11130f; color: #f3f4ee; font: inherit; font-size: 13px; }
      input:focus, select:focus { border-color: #9cbe57; box-shadow: 0 0 0 3px rgb(200 241 105 / 10%); }
      button { min-height: 47px; margin-top: 22px; padding: 0 20px; border: 0; border-radius: 8px; background: var(--green); color: #171b11; cursor: pointer; font: inherit; font-size: 12px; font-weight: 750; }
      button:hover:not(:disabled) { background: #d5f98a; }
      button:disabled { cursor: wait; opacity: .7; }
      .result { margin-top: 18px; padding: 14px; border: 1px solid #34382f; border-radius: 8px; background: #11130f; }
      .result-title { margin: 0 0 9px; color: var(--green); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
      pre { max-height: 360px; margin: 0; overflow: auto; color: #d7dad1; font: 11px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
      [hidden] { display: none !important; }
      @media (max-width: 560px) { .shell { padding: 20px; } main { padding: 54px 0; } .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <a class="brand" href="/" aria-label="Neo Desk home">
          <span class="brand-mark" aria-hidden="true">N.</span>
          <span><span class="brand-name">Neo Desk</span><br><span class="brand-caption">Trading API</span></span>
        </a>
        <a class="back-link" href="/">Back to sign in</a>
      </header>
      <main>
        <p class="eyebrow">Kotak Neo · Estimate only</p>
        <h1>Margin calculator</h1>
        <p class="intro">Check the required margin for an instrument and order configuration. This requests an estimate only and does not place an order.</p>
        <section class="card" aria-label="Margin calculator">
          <p class="notice" id="session-notice">Checking your Kotak Neo session…</p>
          <form id="margin-form" hidden>
            <div class="grid">
              <div class="field"><label for="brk-name">Broker</label><input id="brk-name" name="brkName" value="KOTAK" maxlength="20" required></div>
              <div class="field"><label for="branch-id">Branch</label><input id="branch-id" name="brnchId" value="ONLINE" maxlength="32" required></div>
              <div class="field"><label for="exchange-segment">Exchange segment</label><input id="exchange-segment" name="exSeg" value="nse_cm" maxlength="20" required></div>
              <div class="field"><label for="instrument-token">Instrument token</label><input id="instrument-token" name="tok" value="11536" maxlength="32" required></div>
              <div class="field"><label for="price">Price</label><input id="price" name="prc" type="number" min="0.01" step="any" value="12500" required></div>
              <div class="field"><label for="price-type">Price type</label><input id="price-type" name="prcTp" value="L" maxlength="10" required></div>
              <div class="field"><label for="product">Product</label><input id="product" name="prod" value="CNC" maxlength="20" required></div>
              <div class="field"><label for="quantity">Quantity</label><input id="quantity" name="qty" type="number" min="1" step="1" value="1" required></div>
              <div class="field"><label for="transaction-type">Transaction</label><select id="transaction-type" name="trnsTp" required><option value="B">Buy</option><option value="S">Sell</option></select></div>
            </div>
            <p class="status" id="form-message" role="status" aria-live="polite"></p>
            <button id="submit-button" type="submit">Check required margin</button>
          </form>
          <div class="result" id="result" hidden>
            <p class="result-title">Kotak Neo response</p>
            <pre id="output"></pre>
          </div>
        </section>
      </main>
    </div>
    <script>
      const notice = document.querySelector("#session-notice");
      const form = document.querySelector("#margin-form");
      const message = document.querySelector("#form-message");
      const button = document.querySelector("#submit-button");
      const result = document.querySelector("#result");
      const output = document.querySelector("#output");

      async function checkSession() {
        try {
          const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error("Session status unavailable");
          const session = await response.json();
          if (session.authenticated === true) {
            notice.textContent = "Kotak Neo session active.";
            notice.dataset.kind = "success";
            form.hidden = false;
          } else {
            notice.innerHTML = 'Sign in to Kotak Neo to use the calculator. <a href="/">Go to sign in</a>.';
          }
        } catch {
          notice.textContent = "Could not check your session. Refresh the page to try again.";
        }
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "";
        result.hidden = true;
        if (!form.reportValidity()) return;
        button.disabled = true;
        button.textContent = "Calculating…";
        try {
          const values = Object.fromEntries(new FormData(form).entries());
          const response = await fetch("/api/margin", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(values),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Margin check failed. Please try again.");
          output.textContent = JSON.stringify(data, null, 2);
          result.hidden = false;
        } catch (error) {
          message.textContent = error instanceof Error ? error.message : "Margin check failed. Please try again.";
        } finally {
          button.disabled = false;
          button.textContent = "Check required margin";
        }
      });

      checkSession();
    </script>
  </body>
</html>`;
}
