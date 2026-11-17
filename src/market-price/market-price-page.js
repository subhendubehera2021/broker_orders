import {
  marketPriceDashboardScript,
  marketPriceDashboardStyles,
  marketPricePanelMarkup,
} from "./market-price-dashboard.js";

export const marketPricePage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <title>Kotak Live Market Price</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #e8edf7;
        background: #080e18;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        --muted: #8290a5;
        --line: rgba(165, 187, 217, .12);
        --panel: rgba(17, 26, 40, .9);
        --accent: #f28c28;
        --accent-hover: #ffa94d;
        --connected: #65d6a5;
      }

      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        min-height: 100dvh;
        margin: 0;
        padding: 28px 18px;
        display: grid;
        place-items: center;
        background:
          radial-gradient(ellipse at 50% 0%, rgba(52, 104, 151, .2), transparent 54%),
          radial-gradient(ellipse at 100% 100%, rgba(242, 140, 40, .09), transparent 42%),
          #080e18;
      }
      .market-price-page { width: min(100%, 620px); display: grid; gap: 16px; }
      .page-heading { display: flex; align-items: center; gap: 12px; }
      .brand-mark {
        width: 36px;
        height: 36px;
        display: grid;
        flex: 0 0 36px;
        place-items: center;
        border: 1px solid rgba(242, 140, 40, .3);
        border-radius: 10px;
        color: var(--accent);
        background: rgba(242, 140, 40, .09);
        font-size: 13px;
        font-weight: 750;
      }
      .page-heading-copy { flex: 1; }
      .page-heading-copy .eyebrow { margin-bottom: 4px; }
      h1 { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -.04em; }
      .back-link { color: #b7c3d5; font-size: 11px; text-decoration: none; }
      .back-link:hover { color: var(--accent-hover); }
      .panel {
        overflow: hidden;
        border: 1px solid rgba(160, 181, 210, .16);
        border-radius: 18px;
        background: linear-gradient(145deg, rgba(20, 31, 47, .98), var(--panel));
        box-shadow: 0 24px 80px rgba(0, 0, 0, .38), inset 0 1px rgba(255, 255, 255, .035);
      }
      .eyebrow {
        margin: 0 0 8px;
        color: var(--accent);
        font-size: 10px;
        font-weight: 750;
        letter-spacing: .15em;
        text-transform: uppercase;
      }
      label { display: block; margin-bottom: 8px; color: #b8c5d7; font-size: 11px; font-weight: 650; }
      .token-card { padding: 19px 22px; }
      .token-input, .market-price-input {
        width: 100%;
        height: 42px;
        padding: 0 12px;
        border: 1px solid rgba(160, 181, 210, .19);
        border-radius: 9px;
        outline: none;
        color: #e8edf7;
        background: rgba(5, 10, 17, .55);
        font: inherit;
        font-size: 13px;
      }
      .token-input:focus, .market-price-input:focus {
        border-color: rgba(242, 140, 40, .75);
        box-shadow: 0 0 0 3px rgba(242, 140, 40, .12);
      }
      .token-help { margin: 7px 0 0; color: #748198; font-size: 10px; }
      button {
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 14px;
        border: 1px solid transparent;
        border-radius: 9px;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .primary { color: #211306; background: var(--accent); }
      .primary:hover:not(:disabled) { background: var(--accent-hover); }
      button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
      ${marketPriceDashboardStyles}
      @media (max-width: 480px) {
        body { padding: 18px 12px; }
        .token-card { padding-right: 19px; padding-left: 19px; }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
      }
    </style>
  </head>
  <body>
    <main class="market-price-page">
      <header class="page-heading">
        <span class="brand-mark" aria-hidden="true">KO</span>
        <div class="page-heading-copy">
          <p class="eyebrow">Market data</p>
          <h1>Live price monitor</h1>
        </div>
        <a class="back-link" href="/">Order dashboard</a>
      </header>
      <section class="panel token-card" aria-label="Dashboard authentication">
        <label for="token">Worker control token</label>
        <input class="token-input" id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Enter your control token">
        <p class="token-help">The token stays in this tab and is sent only to this Worker.</p>
      </section>
      ${marketPricePanelMarkup}
    </main>
    <script>${marketPriceDashboardScript}</script>
  </body>
</html>`;
