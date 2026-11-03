interface LoginProfile {
  mobileNumber?: string;
  ucc?: string;
}

export function renderLoginPage(profile: LoginProfile): string {
  return loginPageTemplate
    .replace("__MOBILE_NUMBER__", escapeHtml(profile.mobileNumber ?? ""))
    .replace("__UCC__", escapeHtml(profile.ucc ?? ""));
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]!);
}

const loginPageTemplate = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#10120f">
    <title>Sign in · Neo Desk</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #10120f;
        color: #f3f4ee;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
        --muted: #898e84;
        --line: #292d26;
        --green: #c8f169;
        --panel: #171a16;
      }

      * { box-sizing: border-box; }
      body {
        min-width: 320px;
        min-height: 100vh;
        margin: 0;
        background:
          radial-gradient(ellipse at 18% 0%, rgb(200 241 105 / 8%), transparent 34rem),
          #10120f;
      }

      .shell { max-width: 1280px; min-height: 100vh; margin: auto; padding: 28px 5.5vw 24px; }
      .topbar { display: flex; align-items: center; justify-content: space-between; }
      .brand { display: inline-flex; gap: 12px; align-items: center; color: inherit; text-decoration: none; }
      .brand-mark {
        display: grid;
        width: 36px;
        height: 36px;
        place-items: center;
        border-radius: 11px;
        background: var(--green);
        color: #141810;
        font-size: 15px;
        font-weight: 850;
        letter-spacing: -1px;
      }
      .brand-name { font-size: 14px; font-weight: 700; letter-spacing: -.3px; }
      .brand-caption { margin-top: 2px; color: var(--muted); font-size: 10px; letter-spacing: .13em; text-transform: uppercase; }
      .environment {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 11px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: #bbc0b5;
        font-size: 11px;
      }
      .environment::before { width: 7px; height: 7px; border-radius: 50%; background: var(--green); content: ""; }

      main {
        display: grid;
        min-height: calc(100vh - 112px);
        grid-template-columns: minmax(0, 1fr) minmax(360px, 430px);
        gap: clamp(42px, 9vw, 130px);
        align-items: center;
        padding: 52px 7%;
      }
      .intro { max-width: 570px; padding-bottom: 20px; }
      .eyebrow { display: flex; align-items: center; gap: 10px; margin-bottom: 21px; color: var(--green); font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
      .eyebrow::before { width: 22px; height: 1px; background: var(--green); content: ""; }
      h1 { max-width: 560px; margin: 0; font-size: clamp(42px, 6vw, 72px); font-weight: 580; letter-spacing: -.065em; line-height: .99; }
      h1 span { color: var(--green); }
      .intro-copy { max-width: 410px; margin: 23px 0 0; color: #969b91; font-size: 14px; line-height: 1.8; }
      .security-note { display: flex; max-width: 390px; gap: 12px; align-items: flex-start; margin-top: 44px; color: #a9aea3; font-size: 11px; line-height: 1.7; }
      .security-icon { flex: 0 0 auto; color: var(--green); }
      .security-note strong { color: #e6e9df; font-weight: 600; }

      .card { padding: clamp(25px, 4vw, 38px); border: 1px solid #30342c; border-radius: 18px; background: linear-gradient(145deg, #1a1d18, #151713 80%); box-shadow: 0 30px 100px rgb(0 0 0 / 28%); }
      .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 28px; }
      h2 { margin: 0; font-size: 23px; font-weight: 620; letter-spacing: -.04em; }
      .card-subtitle { margin: 7px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
      .step { flex: 0 0 auto; padding: 7px 9px; border: 1px solid #363b30; border-radius: 7px; color: #afb59f; font-size: 10px; letter-spacing: .07em; text-transform: uppercase; }
      .field { margin-top: 17px; }
      label { display: block; margin-bottom: 8px; color: #d7dad1; font-size: 11px; font-weight: 600; }
      input {
        width: 100%;
        height: 46px;
        padding: 0 13px;
        border: 1px solid #34382f;
        border-radius: 8px;
        outline: none;
        background: #11130f;
        color: #f3f4ee;
        font: inherit;
        font-size: 13px;
        transition: border-color .16s, box-shadow .16s;
      }
      input::placeholder { color: #666b61; }
      input:focus { border-color: #9cbe57; box-shadow: 0 0 0 3px rgb(200 241 105 / 10%); }
      .field-hint { margin: 7px 0 0; color: #777d72; font-size: 10px; line-height: 1.5; }
      .submit, .logout {
        display: flex;
        width: 100%;
        min-height: 47px;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-top: 24px;
        border: 0;
        border-radius: 8px;
        background: var(--green);
        color: #171b11;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 750;
        transition: background .16s, transform .16s;
      }
      .submit:hover:not(:disabled), .logout:hover:not(:disabled) { transform: translateY(-1px); background: #d5f98a; }
      .submit:focus-visible, .logout:focus-visible { outline: 3px solid rgb(200 241 105 / 45%); outline-offset: 3px; }
      .submit:disabled, .logout:disabled { cursor: wait; opacity: .7; }
      .submit svg { width: 16px; height: 16px; }
      .divider { height: 1px; margin: 22px 0 15px; background: var(--line); }
      .privacy { margin: 0; color: #787e73; font-size: 10px; line-height: 1.7; text-align: center; }
      .message { min-height: 18px; margin: 12px 0 0; color: #f3a5a0; font-size: 11px; line-height: 1.55; }
      .message[data-kind="success"] { color: var(--green); }
      .message[data-kind="info"] { color: #a9aea3; }
      .session-panel { padding: 10px 0 0; }
      .session-state { display: flex; align-items: center; gap: 10px; color: #dfe5d6; font-size: 13px; }
      .session-state::before { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 12px rgb(200 241 105 / 60%); content: ""; }
      .session-copy { margin: 13px 0 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
      .logout { border: 1px solid #383d33; background: #22261f; color: #e5e9dd; }
      .logout:hover:not(:disabled) { background: #2b3027; }
      .margin-panel { margin-top: 24px; padding-top: 23px; border-top: 1px solid var(--line); }
      .margin-title { margin: 0; font-size: 16px; font-weight: 620; letter-spacing: -.025em; }
      .margin-description { margin: 7px 0 16px; color: var(--muted); font-size: 11px; line-height: 1.6; }
      .margin-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; }
      .margin-grid .field { margin-top: 12px; }
      .margin-grid input, .margin-grid select { height: 42px; }
      .margin-grid select {
        width: 100%;
        padding: 0 13px;
        border: 1px solid #34382f;
        border-radius: 8px;
        outline: none;
        background: #11130f;
        color: #f3f4ee;
        font: inherit;
        font-size: 13px;
      }
      .margin-grid select:focus { border-color: #9cbe57; box-shadow: 0 0 0 3px rgb(200 241 105 / 10%); }
      .margin-result { margin-top: 16px; padding: 14px; border: 1px solid #34382f; border-radius: 8px; background: #11130f; }
      .margin-result-title { margin: 0 0 9px; color: var(--green); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
      .margin-result pre { max-height: 260px; margin: 0; overflow: auto; color: #d7dad1; font: 11px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
      footer { display: flex; justify-content: space-between; gap: 20px; padding: 10px 7% 0; color: #63685e; font-size: 10px; }
      footer a { color: #92988a; text-decoration: none; }
      footer a:hover { color: var(--green); }
      [hidden] { display: none !important; }

      @media (max-width: 820px) {
        .shell { padding: 22px 6vw; }
        main { min-height: auto; grid-template-columns: 1fr; gap: 36px; padding: 72px 0 40px; }
        .intro { padding: 0; }
        h1 { max-width: 560px; font-size: clamp(44px, 10vw, 66px); }
        .intro-copy { margin-top: 16px; }
        .security-note { margin-top: 22px; }
        .card { width: 100%; max-width: 500px; justify-self: center; }
        footer { padding: 4px 0 0; }
      }
      @media (max-width: 480px) {
        .shell { padding: 18px 20px; }
        .brand-caption { font-size: 9px; }
        .environment { padding: 7px 9px; font-size: 10px; }
        main { gap: 28px; padding-top: 56px; }
        .eyebrow { margin-bottom: 17px; }
        .intro-copy { font-size: 13px; }
        .card { padding: 24px 20px; }
        .margin-grid { grid-template-columns: 1fr; }
        footer { font-size: 9px; }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="Neo Desk home">
          <span class="brand-mark" aria-hidden="true">N.</span>
          <span>
            <span class="brand-name">Neo Desk</span>
            <span class="brand-caption">Trading API</span>
          </span>
        </a>
        <span class="environment">Production</span>
      </header>

      <main>
        <section class="intro" aria-labelledby="page-title">
          <p class="eyebrow">Your market workspace</p>
          <h1 id="page-title">A clearer view<br>of <span>what’s next.</span></h1>
          <p class="intro-copy">Sign in to connect your Kotak Neo account and establish a secure trading session.</p>
          <div class="security-note">
            <svg class="security-icon" width="17" height="19" viewBox="0 0 17 19" fill="none" aria-hidden="true">
              <path d="M8.5 1.5 2 4v4.7c0 4 2.7 6.8 6.5 8.8 3.8-2 6.5-4.8 6.5-8.8V4l-6.5-2.5Z" stroke="currentColor" stroke-width="1.4"/>
              <path d="m5.8 9.2 1.8 1.8 3.7-3.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span><strong>Your MPIN stays server-side.</strong> Mobile number and UCC are prefilled from local server settings; only the current authenticator code is sent to sign in.</span>
          </div>
        </section>

        <section class="card" aria-labelledby="card-title">
          <div class="card-top">
            <div>
              <h2 id="card-title">Welcome back</h2>
              <p class="card-subtitle">Confirm your account and enter the current authenticator code.</p>
            </div>
            <span class="step">Secure login</span>
          </div>

          <form id="login-form" novalidate>
            <div class="field">
              <label for="mobile-number">Registered mobile number</label>
              <input id="mobile-number" type="tel" autocomplete="off" value="__MOBILE_NUMBER__" readonly aria-readonly="true">
            </div>
            <div class="field">
              <label for="ucc">Unique client code <span aria-hidden="true">(UCC)</span></label>
              <input id="ucc" type="text" autocomplete="off" value="__UCC__" readonly aria-readonly="true">
            </div>
            <div class="field">
              <label for="totp">Authenticator code</label>
              <input id="totp" name="totp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="6-digit TOTP" aria-describedby="totp-hint" required>
              <p class="field-hint" id="totp-hint">Use the current code from your authenticator app.</p>
            </div>
            <p class="message" id="form-message" role="status" aria-live="polite"></p>
            <button class="submit" id="submit-button" type="submit">
              <span id="submit-label">Connect account</span>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </form>

          <div class="session-panel" id="session-panel" hidden>
            <div class="session-state">Kotak Neo session active</div>
            <p class="session-copy">Your account is connected. Check required margin for an order without placing it.</p>
            <section class="margin-panel" aria-labelledby="margin-title">
              <h3 class="margin-title" id="margin-title">Margin calculator</h3>
              <p class="margin-description">Enter the instrument and order details. This sends a margin estimate request only; no order will be placed.</p>
              <form id="margin-form">
                <div class="margin-grid">
                  <div class="field">
                    <label for="brk-name">Broker</label>
                    <input id="brk-name" name="brkName" value="KOTAK" maxlength="20" required>
                  </div>
                  <div class="field">
                    <label for="branch-id">Branch</label>
                    <input id="branch-id" name="brnchId" value="ONLINE" maxlength="32" required>
                  </div>
                  <div class="field">
                    <label for="exchange-segment">Exchange segment</label>
                    <input id="exchange-segment" name="exSeg" value="nse_cm" maxlength="20" required>
                  </div>
                  <div class="field">
                    <label for="instrument-token">Instrument token</label>
                    <input id="instrument-token" name="tok" value="11536" maxlength="32" required>
                  </div>
                  <div class="field">
                    <label for="price">Price</label>
                    <input id="price" name="prc" type="number" min="0.01" step="any" value="12500" required>
                  </div>
                  <div class="field">
                    <label for="price-type">Price type</label>
                    <input id="price-type" name="prcTp" value="L" maxlength="10" required>
                  </div>
                  <div class="field">
                    <label for="product">Product</label>
                    <input id="product" name="prod" value="CNC" maxlength="20" required>
                  </div>
                  <div class="field">
                    <label for="quantity">Quantity</label>
                    <input id="quantity" name="qty" type="number" min="1" step="1" value="1" required>
                  </div>
                  <div class="field">
                    <label for="transaction-type">Transaction</label>
                    <select id="transaction-type" name="trnsTp" required>
                      <option value="B">Buy</option>
                      <option value="S">Sell</option>
                    </select>
                  </div>
                </div>
                <p class="message" id="margin-message" role="status" aria-live="polite"></p>
                <button class="submit" id="margin-submit" type="submit">Check required margin</button>
              </form>
              <div class="margin-result" id="margin-result" hidden>
                <p class="margin-result-title">Kotak Neo response</p>
                <pre id="margin-output"></pre>
              </div>
            </section>
            <button class="logout" id="logout-button" type="button">Disconnect this session</button>
          </div>

          <div class="divider"></div>
          <p class="privacy">Protected connection · Session tokens are kept server-side</p>
        </section>
      </main>

      <footer>
        <span>For your personal Kotak Neo account</span>
        <a href="/docs/">API documentation</a>
      </footer>
    </div>
    <script>
      const form = document.querySelector("#login-form");
      const message = document.querySelector("#form-message");
      const submitButton = document.querySelector("#submit-button");
      const submitLabel = document.querySelector("#submit-label");
      const sessionPanel = document.querySelector("#session-panel");
      const logoutButton = document.querySelector("#logout-button");
      const marginForm = document.querySelector("#margin-form");
      const marginMessage = document.querySelector("#margin-message");
      const marginSubmit = document.querySelector("#margin-submit");
      const marginResult = document.querySelector("#margin-result");
      const marginOutput = document.querySelector("#margin-output");

      function showMessage(text, kind = "error") {
        message.textContent = text;
        message.dataset.kind = kind;
      }

      function showMarginMessage(text, kind = "error") {
        marginMessage.textContent = text;
        marginMessage.dataset.kind = kind;
      }

      function setAuthenticated(authenticated) {
        form.hidden = authenticated;
        sessionPanel.hidden = !authenticated;
        document.querySelector("#card-title").textContent = authenticated ? "You’re connected" : "Welcome back";
        document.querySelector(".card-subtitle").textContent = authenticated
          ? "Your Kotak Neo account is ready."
          : "Confirm your account and enter the current authenticator code.";
      }

      async function refreshSession() {
        try {
          const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error("Session status unavailable");
          const result = await response.json();
          setAuthenticated(result.authenticated === true);
        } catch {
          showMessage("Could not check your session. Refresh the page to try again.");
        }
      }

      marginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        showMarginMessage("");
        marginResult.hidden = true;
        if (!marginForm.reportValidity()) return;

        marginSubmit.disabled = true;
        marginSubmit.textContent = "Calculating…";
        try {
          const values = Object.fromEntries(new FormData(marginForm).entries());
          const response = await fetch("/api/margin", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(values),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Margin check failed. Please try again.");
          marginOutput.textContent = JSON.stringify(result, null, 2);
          marginResult.hidden = false;
        } catch (error) {
          showMarginMessage(error instanceof Error ? error.message : "Margin check failed. Please try again.");
        } finally {
          marginSubmit.disabled = false;
          marginSubmit.textContent = "Check required margin";
        }
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        showMessage("");
        if (!form.reportValidity()) return;

        submitButton.disabled = true;
        submitLabel.textContent = "Connecting…";
        try {
          const values = new FormData(form);
          const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ totp: values.get("totp") }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Sign-in failed. Check your details and try again.");
          document.querySelector("#totp").value = "";
          setAuthenticated(true);
          showMessage("You’re signed in.", "success");
        } catch (error) {
          showMessage(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
        } finally {
          document.querySelector("#totp").value = "";
          submitButton.disabled = false;
          submitLabel.textContent = "Connect account";
        }
      });

      logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        try {
          const response = await fetch("/api/auth/logout", { method: "POST" });
          if (!response.ok) throw new Error("Disconnect failed. Please try again.");
          setAuthenticated(false);
          marginResult.hidden = true;
          marginOutput.textContent = "";
          showMessage("Local session disconnected.", "info");
        } catch (error) {
          showMessage(error instanceof Error ? error.message : "Disconnect failed. Please try again.");
        } finally {
          logoutButton.disabled = false;
        }
      });

      refreshSession();
    </script>
  </body>
</html>`;
