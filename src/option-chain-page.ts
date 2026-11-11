export function renderOptionChainPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0b0f14">
    <title>NIFTY Option Chain · Neo Desk</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0f14; color: #e6edf3; --muted: #8d9aaa; --line: #26313d; --accent: #70d6bd; }
      * { box-sizing: border-box; }
      body { min-width: 320px; min-height: 100vh; margin: 0; background: radial-gradient(ellipse at 18% 0%, rgb(112 214 189 / 6%), transparent 34rem), #0b0f14; }
      .shell { max-width: 1440px; min-height: 100vh; margin: auto; padding: 24px 4vw; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
      .brand { display: inline-flex; gap: 12px; align-items: center; color: inherit; text-decoration: none; }
      .brand-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; background: var(--accent); color: #0d1715; font-size: 15px; font-weight: 850; }
      .brand-name { font-size: 14px; font-weight: 700; }
      .brand-caption { margin-top: 2px; color: var(--muted); font-size: 10px; letter-spacing: .13em; text-transform: uppercase; }
      .nav { display: flex; gap: 18px; align-items: center; }
      .nav a { color: #aab6c3; font-size: 12px; text-decoration: none; }
      .nav a:hover { color: var(--accent); }
      main { padding: clamp(36px, 7vh, 68px) 0 24px; }
      .panel { padding: 20px; border: 1px solid #26313d; border-radius: 14px; background: linear-gradient(145deg, #131a22, #10161d 80%); box-shadow: 0 18px 48px rgb(0 0 0 / 18%); }
      .controls { display: flex; min-height: 44px; flex-wrap: wrap; align-items: center; gap: 12px; }
      .feed-status { display: inline-flex; min-height: 32px; align-items: center; gap: 8px; padding: 0 11px; border: 1px solid #303d4b; border-radius: 999px; background: #0e141b; color: #9aa8b7; font-size: 11px; font-weight: 750; letter-spacing: .08em; }
      .feed-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: #8290a0; }
      .feed-status[data-state="connecting"] .feed-dot, .feed-status[data-state="reconnecting"] .feed-dot { background: #e6b65c; }
      .feed-status[data-state="live"] { border-color: #315e53; color: #9ce0cb; }
      .feed-status[data-state="live"] .feed-dot { background: #55d6a5; box-shadow: 0 0 0 3px rgb(85 214 165 / 14%); animation: live-pulse 1.8s ease-out infinite; }
      .feed-status[data-state="disconnected"] { border-color: #67434a; color: #f0a3a3; }
      .feed-status[data-state="disconnected"] .feed-dot { background: #e36d78; }
      @keyframes live-pulse { 50% { box-shadow: 0 0 0 5px rgb(85 214 165 / 4%); } }
      @media (prefers-reduced-motion: reduce) { .feed-status[data-state="live"] .feed-dot { animation: none; } }
      label { color: #a9b6c4; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      select, button { height: 40px; padding: 0 12px; border: 1px solid #303d4b; border-radius: 7px; background: #0e141b; color: #e3eaf1; font: inherit; font-size: 12px; }
      select { min-width: 170px; }
      button { background: #1a2530; cursor: pointer; }
      button:hover:not(:disabled) { border-color: #579887; color: var(--accent); }
      button:disabled, select:disabled { cursor: default; opacity: .5; }
      select:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .status { min-height: 18px; margin: 14px 0 12px; color: #a0adba; font-size: 11px; letter-spacing: .04em; }
      .status[data-kind="error"] { color: #f0a3a3; }
      .status a { color: var(--accent); }
      .activity-status { min-height: 20px; margin: 12px 0 14px; color: #a0adba; font-size: 11px; }
      .activity-status[data-state="connected"] { color: #9ce0cb; }
      .activity-status[data-state="error"] { color: #f0a3a3; }
      .activity-panel h2 { margin: 0 0 14px; font-size: 17px; }
      .activity-panel + .activity-panel { margin-top: 16px; }
      .activity-table-wrap { max-height: 48vh; overflow: auto; border: 1px solid #293541; border-radius: 10px; background: #0d131a; }
      .activity-table { width: 100%; min-width: 760px; table-layout: auto; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
      .activity-table th, .activity-table td { padding: 11px 14px; border-bottom: 1px solid #222d38; text-align: left; }
      .activity-table th { position: sticky; top: 0; z-index: 1; background: #171f27; color: #9baaba; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
      .activity-table td { color: #d7e0e9; font-variant-numeric: tabular-nums; }
      .activity-table tbody tr:last-child td { border-bottom: 0; }
      .activity-empty { padding: 24px 12px !important; color: #8d9aaa !important; text-align: center !important; }
      .orders-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
      .orders-heading h2 { margin: 0; font-size: 17px; }
      .orders-status { min-height: 18px; margin: 14px 0 12px; color: #a0adba; font-size: 11px; }
      .orders-status[data-kind="error"] { color: #f0a3a3; }
      .open-orders-table { min-width: 680px; }
      .open-orders-table th { position: static; height: auto; padding: 11px 14px; background: #171f27; text-align: left; }
      .open-orders-table td { padding: 11px 14px; }
      .table-wrap { max-height: 72vh; overflow: auto; border: 1px solid #293541; border-radius: 10px; background: #0d131a; }
      table { width: 100%; min-width: 760px; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 13px; white-space: nowrap; }
      th, td { overflow: hidden; padding: 13px 16px; border-right: 1px solid #242e38; border-bottom: 1px solid #222d38; text-overflow: ellipsis; }
      th:last-child, td:last-child { border-right: 0; }
      th { position: sticky; z-index: 1; color: #9baaba; font-size: 10px; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
      .group-head th { top: 0; height: 36px; background: #171f27; }
      .column-head th { top: 36px; height: 38px; background: #111820; color: #aab7c5; font-size: 10px; }
      th.call-subhead { background: #172126; }
      th.put-subhead { background: #11191d; }
      th.instrument-head { text-align: left; }
      th.price-head { text-align: right; }
      th.strike-head { color: var(--accent); text-align: center; }
      td { color: #d7e0e9; font-variant-numeric: tabular-nums; }
      tbody tr.option-row { height: 54px; transition: background .12s ease; }
      tbody tr.option-row:hover td { filter: brightness(1.16); }
      tbody tr:not(.spot-row):last-child td { border-bottom: 0; }
      th.call-head { color: #a9ddd0 !important; text-align: center; }
      th.put-head { color: #b6c2ce !important; text-align: center; }
      td.call-instrument, td.call-price { background: #171f24; }
      td.put-price, td.put-instrument { background: #12191e; }
      td.call-instrument, td.put-instrument { position: relative; }
      td.call-price, td.strike-cell, td.put-price { font-size: 15px; font-weight: 650; }
      td.call-price { color: #e2e9ed; text-align: right; }
      td.strike-cell { background: #0d1217; color: #f0f3f6; font-size: 16px; font-weight: 750; text-align: center; }
      td.put-price { color: #e2e9ed; text-align: left; }
      td.put-instrument { text-align: right; }
      .instrument-name { display: block; overflow: hidden; padding-right: 100px; color: #cbd6df; font-size: 11px; font-weight: 550; text-overflow: ellipsis; }
      .buy-button { position: absolute; top: 50%; right: 8px; height: 26px; padding: 0 10px; transform: translateY(-50%); border: 1px solid #416b60; border-radius: 6px; background: #1b302a; color: #9ce0cb; font-size: 10px; font-weight: 800; letter-spacing: .06em; opacity: 0; pointer-events: none; transition: opacity .12s ease; }
      .option-row:hover .buy-button, .option-row:focus-within .buy-button { opacity: .9; pointer-events: auto; }
      .buy-button:disabled { cursor: default; opacity: 0; pointer-events: none; }
      .option-row:hover .buy-button:disabled, .option-row:focus-within .buy-button:disabled { opacity: .9; }
      .swing-button { position: absolute; top: 50%; right: 54px; height: 26px; padding: 0 7px; transform: translateY(-50%); border: 1px solid #53677d; border-radius: 6px; background: #202b38; color: #c4d2e0; font-size: 9px; font-weight: 800; letter-spacing: .04em; opacity: 0; pointer-events: none; transition: opacity .12s ease; }
      .option-row:hover .swing-button, .option-row:focus-within .swing-button { opacity: .9; pointer-events: auto; }
      .order-dialog { width: min(460px, calc(100vw - 28px)); max-height: min(90vh, 700px); padding: 0; overflow: auto; border: 1px solid #344250; border-radius: 14px; background: #111820; color: #e6edf3; box-shadow: 0 24px 80px rgb(0 0 0 / 55%); }
      .order-dialog::backdrop { background: rgb(0 0 0 / 72%); backdrop-filter: blur(3px); }
      .swing-dialog { width: min(1040px, calc(100vw - 28px)); max-height: min(92vh, 850px); padding: 0; overflow: auto; border: 1px solid #344250; border-radius: 14px; background: #111820; color: #e6edf3; box-shadow: 0 24px 80px rgb(0 0 0 / 55%); }
      .swing-dialog::backdrop { background: rgb(0 0 0 / 72%); backdrop-filter: blur(3px); }
      .swing-content { padding: 22px; }
      .swing-heading { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .swing-heading h2 { margin: 0; font-size: 19px; }
      .swing-instrument { margin: 5px 0 0; color: #9aa8b7; font-size: 12px; }
      .swing-ltp { display: inline-block; margin-left: 8px; color: #9ce0cb; font-variant-numeric: tabular-nums; font-weight: 700; }
      .swing-close { width: 36px; min-width: 36px; height: 36px; padding: 0; font-size: 18px; }
      .swing-controls { display: grid; grid-template-columns: repeat(6, minmax(100px, 1fr)); align-items: end; gap: 10px; margin-top: 20px; }
      .swing-controls label { display: grid; gap: 6px; color: #a9b6c4; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
      .swing-controls input, .swing-controls select { width: 100%; min-width: 0; height: 38px; padding: 0 9px; border: 1px solid #303d4b; border-radius: 7px; background: #0e141b; color: #e3eaf1; font: inherit; font-size: 11px; }
      .swing-controls button { height: 38px; }
      .swing-status { min-height: 18px; margin: 14px 0 10px; color: #a0adba; font-size: 11px; }
      .swing-status[data-kind="error"] { color: #f0a3a3; }
      .swing-table-wrap { max-height: 48vh; overflow: auto; border: 1px solid #293541; border-radius: 10px; background: #0d131a; }
      .swing-table { width: 100%; min-width: 820px; table-layout: auto; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
      .swing-table th, .swing-table td { padding: 10px 12px; border-right: 0; text-align: left; }
      .swing-table th { position: sticky; top: 0; z-index: 1; background: #171f27; color: #9baaba; font-size: 10px; letter-spacing: .08em; }
      .swing-high { color: #f0a3a3 !important; }
      .swing-low { color: #9ce0cb !important; }
      .swing-empty { padding: 24px 12px !important; color: #8d9aaa !important; text-align: center !important; }
      .swing-buy { height: 28px; padding: 0 10px; border: 1px solid #416b60; border-radius: 6px; background: #1b302a; color: #9ce0cb; font-size: 10px; font-weight: 750; cursor: pointer; }
      .swing-buy:hover { border-color: #70d6bd; }
      .swing-actions { display: flex; justify-content: flex-end; margin-top: 14px; }
      .order-form { padding: 22px; }
      .order-title { margin: 0; font-size: 18px; font-weight: 750; }
      .order-contract { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin: 6px 0 20px; color: #9aa8b7; font-size: 12px; }
      .order-ltp { color: #9ce0cb; font-variant-numeric: tabular-nums; font-weight: 700; }
      .order-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .order-fields label { display: grid; gap: 7px; color: #a9b6c4; font-size: 10px; }
      .order-fields [hidden] { display: none; }
      .order-fields input, .order-value { width: 100%; min-height: 40px; padding: 0 10px; border: 1px solid #303d4b; border-radius: 7px; background: #0e141b; color: #e3eaf1; font: inherit; font-size: 13px; }
      .order-value { display: flex; align-items: center; color: #cbd6df; font-size: 12px; }
      .order-note { margin: 16px 0; color: #9aa8b7; font-size: 11px; line-height: 1.5; }
      .order-error { min-height: 18px; margin: 12px 0; color: #f0a3a3; font-size: 12px; }
      .order-actions { display: flex; justify-content: flex-end; gap: 10px; }
      .order-submit { border-color: #416b60; background: #1b302a; color: #9ce0cb; font-weight: 750; }
      .order-fields input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      tr.spot-row td { height: 58px; padding: 0; border-top: 1px solid #168dd0; border-bottom: 1px solid #168dd0; background: #101419; }
      .spot-marker { position: relative; display: flex; min-height: 58px; align-items: center; justify-content: center; }
      .spot-marker::before { position: absolute; right: 0; left: 0; height: 1px; background: #168dd0; content: ""; }
      .spot-pill { position: relative; z-index: 1; display: flex; min-height: 44px; align-items: center; justify-content: center; gap: 10px; padding: 0 28px; border: 1px solid #168dd0; border-radius: 999px; background: #11171d; box-shadow: 0 0 20px rgb(22 141 208 / 12%); }
      .spot-label { color: #39aef0; font-size: 13px; font-weight: 650; }
      .spot-price { color: #39aef0; font-size: 15px; font-variant-numeric: tabular-nums; font-weight: 750; }
      [hidden] { display: none !important; }
      @media (hover: none) { .option-row .buy-button, .option-row .swing-button { opacity: .9; pointer-events: auto; } }
      @media (max-width: 600px) { .shell { padding: 18px 14px; } .panel { padding: 12px; } .nav { gap: 12px; } .nav a { font-size: 11px; } }
      @media (max-width: 800px) { .swing-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); } .swing-controls button { grid-column: 1 / -1; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <a class="brand" href="/" aria-label="Neo Desk home">
          <span class="brand-mark" aria-hidden="true">N.</span>
          <span><span class="brand-name">Neo Desk</span><br><span class="brand-caption">Trading API</span></span>
        </a>
        <nav class="nav" aria-label="Main navigation"><a href="/orders">Orders</a><a href="#live-activity">Live activity</a><a href="/margin">Margin calculator</a><a href="/scrip-master">Scrip Master</a><a href="/">Sign in</a></nav>
      </header>
      <main>
        <section class="panel" aria-label="Open orders" style="margin-bottom: 20px">
          <div class="orders-heading">
            <h2>Open orders</h2>
            <button id="refresh-open-orders" type="button">Refresh orders</button>
          </div>
          <p class="orders-status" id="open-orders-status" role="status" aria-live="polite">Loading open orders…</p>
          <div class="table-wrap">
            <table class="open-orders-table">
              <thead><tr>
                <th scope="col">Order ID</th>
                <th scope="col">Instrument</th>
                <th scope="col">Side</th>
                <th scope="col">Qty</th>
                <th scope="col">Price</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr></thead>
              <tbody id="open-order-rows"><tr><td colspan="8">Loading…</td></tr></tbody>
            </table>
          </div>
        </section>
        <section class="panel" aria-label="NIFTY option chain">
          <div class="controls">
            <label for="expiry">Expiry</label>
            <select id="expiry" disabled><option value="">Loading expiries…</option></select>
            <button id="refresh-price" type="button">Reconnect</button>
            <span class="feed-status" id="price-status" data-state="idle" role="status" aria-live="polite"><span class="feed-dot" aria-hidden="true"></span><span class="feed-label">Sign in for live price</span></span>
          </div>
          <p class="status" id="status" role="status" aria-live="polite">Loading local NIFTY expiries…</p>
          <div class="table-wrap" id="table-wrap" hidden>
            <table>
              <colgroup>
                <col style="width:23%"><col style="width:17%"><col style="width:20%"><col style="width:17%"><col style="width:23%">
              </colgroup>
              <thead><tr class="group-head">
                <th class="call-head" colspan="2">CALLS</th>
                <th class="strike-head">STRIKE</th>
                <th class="put-head" colspan="2">PUTS</th>
              </tr><tr class="column-head">
                <th class="call-subhead instrument-head">Instrument</th>
                <th class="call-subhead price-head">LTP</th>
                <th class="strike-head">Strike</th>
                <th class="put-subhead price-head">LTP</th>
                <th class="put-subhead instrument-head">Instrument</th>
              </tr></thead>
              <tbody id="rows"></tbody>
            </table>
          </div>
        </section>
        <section class="panel activity-panel" id="live-activity" aria-label="Live order updates">
          <h2>Live activity</h2>
          <p class="activity-status" id="activity-stream-status" data-state="connecting" role="status" aria-live="polite">Checking your Kotak Neo session…</p>
          <p class="activity-status" id="activity-auto-sell-status" role="status" aria-live="polite">Auto-sell: waiting for app BUY orders.</p>
          <div class="activity-table-wrap">
            <table class="activity-table">
              <thead><tr><th>Order ID</th><th>Symbol</th><th>Side</th><th>Quantity</th><th>Filled</th><th>Average price</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody id="activity-order-updates"><tr><td class="activity-empty" colspan="8">Waiting for order updates…</td></tr></tbody>
            </table>
          </div>
        </section>
        <section class="panel activity-panel" aria-label="Live position updates">
          <h2>Position updates</h2>
          <p class="activity-status" id="activity-position-status" role="status" aria-live="polite">Loading current positions…</p>
          <div class="activity-table-wrap">
            <table class="activity-table">
              <thead><tr><th>Trading symbol</th><th>Product</th><th>Net qty</th><th>Buy qty</th><th>Sell qty</th><th>Buy amount</th><th>Sell amount</th><th>P&amp;L (Sell - Buy)</th><th>Updated</th></tr></thead>
              <tbody id="activity-position-updates"><tr><td class="activity-empty" colspan="9">Waiting for position updates…</td></tr></tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
    <dialog class="order-dialog" id="order-dialog" aria-labelledby="order-title">
      <form class="order-form" id="order-form">
        <h2 class="order-title" id="order-title">Place BUY order</h2>
        <p class="order-contract"><span id="order-contract"></span><span class="order-ltp" id="order-ltp" aria-live="polite">LTP unavailable</span></p>
        <div class="order-fields">
          <label for="order-side">Side
            <select id="order-side">
              <option value="B">BUY</option>
              <option value="S">SELL</option>
            </select>
          </label>
          <label for="order-quantity">Quantity (units)
            <input id="order-quantity" type="number" min="1" step="1" required>
          </label>
          <label for="order-product">Product
            <select id="order-product">
              <option value="MIS">MIS · Intraday</option>
              <option value="NRML">NRML · Carry forward</option>
              <option value="CO">CO · Cover order</option>
              <option value="BO">BO · Bracket order</option>
            </select>
          </label>
          <label for="order-type">Order type
            <select id="order-type">
              <option value="L">Limit (L)</option>
              <option value="MKT">Market (MKT)</option>
              <option value="SL">Stop-limit (SL)</option>
              <option value="SL-M">Stop-market (SL-M)</option>
            </select>
          </label>
          <label for="order-price" id="order-price-field">Price (₹)
            <input id="order-price" type="number" min="0.05" step="0.05" required>
          </label>
          <label for="order-trigger-price" id="order-trigger-field" hidden>Trigger price (₹)
            <input id="order-trigger-price" type="number" min="0.05" step="0.05">
          </label>
          <label for="order-validity">Validity
            <select id="order-validity">
              <option value="DAY">DAY</option>
              <option value="IOC">IOC</option>
            </select>
          </label>
          <label for="order-amo">After market order
            <select id="order-amo">
              <option value="NO">NO</option>
              <option value="YES">YES</option>
            </select>
          </label>
          <label for="order-disclosed-quantity">Disclosed quantity
            <input id="order-disclosed-quantity" type="number" min="0" step="1" value="0" required>
          </label>
          <label for="order-market-protection">Market protection
            <input id="order-market-protection" type="number" min="0" step="0.01" value="0" required>
          </label>
          <label for="order-tag">Order tag
            <input id="order-tag" type="text" maxlength="20">
          </label>
        </div>
        <div class="order-fields" id="order-bracket-fields" hidden>
          <label for="order-square-off-type">Square-off type
            <select id="order-square-off-type">
              <option value="Ticks">Ticks</option>
              <option value="Absolute">Absolute</option>
            </select>
          </label>
          <label for="order-square-off-value">Square-off value
            <input id="order-square-off-value" type="number" min="0.01" step="0.01">
          </label>
          <label for="order-stop-loss-type">Stop-loss type
            <select id="order-stop-loss-type">
              <option value="Ticks">Ticks</option>
              <option value="Absolute">Absolute</option>
            </select>
          </label>
          <label for="order-stop-loss-value">Stop-loss value
            <input id="order-stop-loss-value" type="number" min="0.01" step="0.01">
          </label>
          <label for="order-trailing-stop">Trailing stop-loss
            <select id="order-trailing-stop">
              <option value="N">No</option>
              <option value="Y">Yes</option>
            </select>
          </label>
          <label for="order-trailing-value">Trailing stop value
            <input id="order-trailing-value" type="number" min="0" step="0.01" value="0">
          </label>
        </div>
        <p class="order-note">Quantity must be a whole number of lots. CNC and MTF are not available for NIFTY F&amp;O. Review the live-order confirmation before submitting.</p>
        <p class="order-error" id="order-error" role="alert"></p>
        <div class="order-actions">
          <button type="button" id="order-cancel">Cancel</button>
          <button type="submit" class="order-submit" id="order-submit">Review &amp; place live BUY</button>
        </div>
      </form>
    </dialog>
    <dialog class="swing-dialog" id="swing-dialog" aria-labelledby="swing-title">
      <div class="swing-content">
        <div class="swing-heading">
          <div><h2 id="swing-title">Liquidity swings</h2><p class="swing-instrument"><span id="swing-instrument"></span><span class="swing-ltp" id="swing-ltp" aria-live="polite">LTP unavailable</span></p></div>
          <button class="swing-close" id="swing-close" type="button" aria-label="Close liquidity swings">×</button>
        </div>
        <form id="swing-form">
          <div class="swing-controls">
            <label for="swing-interval">Interval
              <select id="swing-interval">
                <option value="1min" selected>1 minute</option><option value="3min">3 minutes</option>
                <option value="5min">5 minutes</option><option value="10min">10 minutes</option>
                <option value="15min">15 minutes</option><option value="30min">30 minutes</option>
                <option value="60min">60 minutes</option><option value="D">Daily</option><option value="W">Weekly</option>
              </select>
            </label>
            <label for="swing-lookback">Pivot lookback
              <select id="swing-lookback">
                <option value="3">3 candles</option><option value="5" selected>5 candles</option>
                <option value="10">10 candles</option><option value="14">14 candles</option>
                <option value="20">20 candles</option>
              </select>
            </label>
            <label for="swing-side">Side
              <select id="swing-side"><option value="high" selected>Swing high</option><option value="low">Swing low</option><option value="both">Both</option></select>
            </label>
            <label for="swing-from">From<input id="swing-from" type="date" required></label>
            <label for="swing-to">To<input id="swing-to" type="date" required></label>
            <button type="submit" id="swing-analyze">Analyze</button>
          </div>
        </form>
        <p class="swing-status" id="swing-status" role="status" aria-live="polite">Choose settings and analyze historical candles.</p>
        <div class="swing-table-wrap">
          <table class="swing-table">
            <thead><tr><th>Side</th><th>Pivot time</th><th>Level</th><th>Zone</th><th>Touches</th><th>Volume</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="swing-rows"><tr><td class="swing-empty" colspan="7">No swing results yet.</td></tr></tbody>
          </table>
        </div>
        <div class="swing-actions"><button type="button" id="swing-done">Close</button></div>
      </div>
    </dialog>
    <script>
      const expirySelect = document.querySelector("#expiry");
      const status = document.querySelector("#status");
      const tableWrap = document.querySelector("#table-wrap");
      const tableBody = document.querySelector("#rows");
      const priceStatus = document.querySelector("#price-status");
      const refreshPriceButton = document.querySelector("#refresh-price");
      const openOrdersStatus = document.querySelector("#open-orders-status");
      const openOrderRows = document.querySelector("#open-order-rows");
      const refreshOpenOrdersButton = document.querySelector("#refresh-open-orders");
      const activityStatusLabel = document.querySelector("#activity-stream-status");
      const activityAutoSellStatus = document.querySelector("#activity-auto-sell-status");
      const activityOrderBody = document.querySelector("#activity-order-updates");
      const activityPositionBody = document.querySelector("#activity-position-updates");
      const activityPositionStatus = document.querySelector("#activity-position-status");
      const orderDialog = document.querySelector("#order-dialog");
      const swingDialog = document.querySelector("#swing-dialog");
      const swingInstrumentLabel = document.querySelector("#swing-instrument");
      const swingLtpLabel = document.querySelector("#swing-ltp");
      const swingForm = document.querySelector("#swing-form");
      const swingIntervalSelect = document.querySelector("#swing-interval");
      const swingLookbackSelect = document.querySelector("#swing-lookback");
      const swingSideSelect = document.querySelector("#swing-side");
      const swingFromInput = document.querySelector("#swing-from");
      const swingToInput = document.querySelector("#swing-to");
      const swingStatus = document.querySelector("#swing-status");
      const swingRows = document.querySelector("#swing-rows");
      const swingAnalyzeButton = document.querySelector("#swing-analyze");
      const orderForm = document.querySelector("#order-form");
      const orderContractLabel = document.querySelector("#order-contract");
      const orderLtpLabel = document.querySelector("#order-ltp");
      const orderQuantityInput = document.querySelector("#order-quantity");
      const orderSideSelect = document.querySelector("#order-side");
      const orderProductSelect = document.querySelector("#order-product");
      const orderTypeSelect = document.querySelector("#order-type");
      const orderPriceField = document.querySelector("#order-price-field");
      const orderPriceInput = document.querySelector("#order-price");
      const orderTriggerField = document.querySelector("#order-trigger-field");
      const orderTriggerInput = document.querySelector("#order-trigger-price");
      const orderValiditySelect = document.querySelector("#order-validity");
      const orderAmoSelect = document.querySelector("#order-amo");
      const orderDisclosedQuantityInput = document.querySelector("#order-disclosed-quantity");
      const orderMarketProtectionInput = document.querySelector("#order-market-protection");
      const orderTagInput = document.querySelector("#order-tag");
      const orderBracketFields = document.querySelector("#order-bracket-fields");
      const orderSquareOffTypeSelect = document.querySelector("#order-square-off-type");
      const orderSquareOffValueInput = document.querySelector("#order-square-off-value");
      const orderStopLossTypeSelect = document.querySelector("#order-stop-loss-type");
      const orderStopLossValueInput = document.querySelector("#order-stop-loss-value");
      const orderTrailingStopSelect = document.querySelector("#order-trailing-stop");
      const orderTrailingValueInput = document.querySelector("#order-trailing-value");
      const orderError = document.querySelector("#order-error");
      const orderSubmitButton = document.querySelector("#order-submit");
      const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
      let expiryValues = [];
      let marketFeed;
      let liveSpotPrice;
      let loadedContracts = [];
      let displayedStrikesKey = "";
      let selectedOrderContract;
      let orderSubmissionUncertain = false;
      let selectedSwingContract;
      let swingRequestId = 0;
      let analyzedSwings = [];
      const activityOrderUpdates = new Map();
      const seenActivityOrderEvents = new Set();
      let activityPositionUpdates = [];
      let activityEventSource;
      const swingOrderAttempts = new Set();
      const optionPrices = new Map();
      const volumeFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
      const swingMaxDays = { "1min": 30, "3min": 30, "5min": 30, "10min": 60, "15min": 60, "30min": 90, "60min": 90, D: 180, W: 180 };

      function setStatus(text, kind = "") {
        status.textContent = text;
        status.dataset.kind = kind;
      }

      function orderValue(order, keys) {
        for (const key of keys) {
          const value = order[key];
          if (value !== undefined && value !== null && value !== "") return String(value);
        }
        return "—";
      }

      function extractOrders(payload) {
        if (Array.isArray(payload)) return payload.filter((item) => item && typeof item === "object");
        if (!payload || typeof payload !== "object") return [];
        for (const key of ["data", "orders", "orderBook", "orderbook"]) {
          const result = extractOrders(payload[key]);
          if (result.length) return result;
        }
        return [];
      }

      function activityValue(record, key, fallback = "—") {
        const item = record[key];
        return item === undefined || item === null || item === "" ? fallback : String(item);
      }

      function activityPnl(position) {
        const buyAmount = Number(position.buyAmt);
        const sellAmount = Number(position.sellAmt);
        if (
          position.buyAmt === undefined ||
          position.buyAmt === null ||
          position.buyAmt === "" ||
          position.sellAmt === undefined ||
          position.sellAmt === null ||
          position.sellAmt === "" ||
          !Number.isFinite(buyAmount) ||
          !Number.isFinite(sellAmount)
        ) {
          return "—";
        }
        return new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(sellAmount - buyAmount);
      }

      function drawActivityRows(body, records, fields, emptyMessage) {
        body.replaceChildren();
        if (!records.length) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.className = "activity-empty";
          cell.colSpan = fields.length;
          cell.textContent = emptyMessage;
          row.append(cell);
          body.append(row);
          return;
        }
        for (const record of records) {
          const row = document.createElement("tr");
          for (const field of fields) {
            const cell = document.createElement("td");
            cell.textContent = field === "pnl" ? activityPnl(record) : activityValue(record, field);
            row.append(cell);
          }
          body.append(row);
        }
      }

      function handleActivityOrder(data) {
        const orderNumber = activityValue(data, "nOrdNo", "");
        if (!orderNumber) return;
        const receivedAt = activityValue(data, "updRecvTm", "");
        if (receivedAt) {
          const eventKey = orderNumber + ":" + receivedAt;
          if (seenActivityOrderEvents.has(eventKey)) return;
          seenActivityOrderEvents.add(eventKey);
          if (seenActivityOrderEvents.size > 2000) {
            const oldest = seenActivityOrderEvents.values().next().value;
            if (oldest) seenActivityOrderEvents.delete(oldest);
          }
        }
        const previous = activityOrderUpdates.get(orderNumber) || {};
        activityOrderUpdates.set(orderNumber, { ...previous, ...data });
        drawActivityRows(
          activityOrderBody,
          [...activityOrderUpdates.values()],
          ["nOrdNo", "trdSym", "trnsTp", "qty", "fldQty", "avgPrc", "ordSt", "ordDtTm"],
          "Waiting for order updates…",
        );
      }

      function activityPositionKey(data) {
        const symbol = activityValue(data, "trdSym", activityValue(data, "sym", ""));
        const identity = [
          activityValue(data, "actId", ""),
          symbol,
          activityValue(data, "exSeg", ""),
          activityValue(data, "prod", ""),
        ];
        return identity.some(Boolean) ? identity.join("|") : "";
      }

      function renderActivityPositions() {
        drawActivityRows(
          activityPositionBody,
          activityPositionUpdates,
          ["trdSym", "prod", "qty", "flBuyQty", "flSellQty", "buyAmt", "sellAmt", "pnl", "hsUpTm"],
          "Waiting for position updates…",
        );
      }

      function handleActivityPosition(data) {
        const key = activityPositionKey(data);
        const index = key
          ? activityPositionUpdates.findIndex((position) => activityPositionKey(position) === key)
          : -1;
        if (index >= 0) activityPositionUpdates[index] = { ...activityPositionUpdates[index], ...data };
        else activityPositionUpdates.push(data);
        renderActivityPositions();
        activityPositionStatus.textContent =
          activityPositionUpdates.length + " position" +
          (activityPositionUpdates.length === 1 ? "" : "s") + " · live update received";
        activityPositionStatus.dataset.state = "connected";
      }

      function extractActivityPositions(payload) {
        if (Array.isArray(payload)) {
          return payload.filter((item) => item && typeof item === "object" && !Array.isArray(item));
        }
        if (!payload || typeof payload !== "object") return [];
        if (["sym", "trdSym", "actId"].some((key) => payload[key] !== undefined)) {
          return [payload];
        }
        for (const key of ["data", "positions", "positionBook", "positionbook"]) {
          const records = extractActivityPositions(payload[key]);
          if (records.length) return records;
        }
        return [];
      }

      async function connectActivityStream() {
        try {
          const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error("Could not check the Kotak Neo session.");
          const session = await response.json();
          if (session.authenticated !== true) {
            activityStatusLabel.textContent = "Sign in to Kotak Neo before opening live activity.";
            activityStatusLabel.dataset.state = "error";
            activityPositionStatus.textContent = "Sign in to load current positions.";
            activityPositionStatus.dataset.state = "error";
            return;
          }

          try {
            const positionsResponse = await fetch("/api/positions", {
              headers: { Accept: "application/json" },
            });
            const positionsPayload = await positionsResponse.json();
            if (!positionsResponse.ok) {
              throw new Error(positionsPayload.error || "Could not load current positions.");
            }
            activityPositionUpdates = extractActivityPositions(positionsPayload);
            renderActivityPositions();
            activityPositionStatus.textContent =
              activityPositionUpdates.length + " current position" +
              (activityPositionUpdates.length === 1 ? "" : "s") +
              " loaded · waiting for live updates";
            activityPositionStatus.dataset.state = "";
          } catch (error) {
            activityPositionStatus.textContent =
              error instanceof Error ? error.message : "Could not load current positions.";
            activityPositionStatus.dataset.state = "error";
          }

          activityEventSource = new EventSource("/api/orders/stream");
          activityEventSource.addEventListener("connection", (event) => {
            const message = JSON.parse(event.data);
            activityStatusLabel.textContent =
              message.state === "connected"
                ? "Connected · receiving live updates"
                : message.state === "reconnecting"
                  ? "Reconnecting to Kotak Neo…"
                  : "Connecting to Kotak Neo…";
            activityStatusLabel.dataset.state =
              message.state === "connected" ? "connected" : "connecting";
          });
          activityEventSource.addEventListener("order", (event) => {
            handleActivityOrder(JSON.parse(event.data));
          });
          activityEventSource.addEventListener("position", (event) => {
            handleActivityPosition(JSON.parse(event.data));
          });
          activityEventSource.addEventListener("stream-error", (event) => {
            const message = JSON.parse(event.data);
            activityStatusLabel.textContent = message.error || "Kotak Neo stream reported an error.";
            activityStatusLabel.dataset.state = "error";
          });
          activityEventSource.addEventListener("auto-sell", (event) => {
            const notice = JSON.parse(event.data);
            activityAutoSellStatus.textContent = notice.message || "Automatic SELL update received.";
            activityAutoSellStatus.dataset.state =
              notice.status === "failed" ? "error" : notice.status === "submitted" ? "connected" : "";
          });
          activityEventSource.onerror = () => {
            activityStatusLabel.textContent = "Connection interrupted; reconnecting…";
            activityStatusLabel.dataset.state = "connecting";
          };
        } catch (error) {
          activityStatusLabel.textContent =
            error instanceof Error ? error.message : "Could not open live activity.";
          activityStatusLabel.dataset.state = "error";
        }
      }

      function isOpenOrder(order) {
        const orderStatus = orderValue(order, ["ordSt", "orderStatus", "status", "stat"])
          .toLowerCase()
          .replace(/[_-]+/g, " ")
          .trim();
        return [
          "open",
          "pending",
          "trigger pending",
          "validation pending",
          "open pending",
          "partially filled",
          "partial",
          "after market order req received",
          "modify pending",
          "cancel pending",
        ].includes(orderStatus);
      }

      function renderOpenOrders(orders) {
        const openOrders = orders.filter(isOpenOrder);
        openOrderRows.replaceChildren();
        if (!openOrders.length) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 8;
          cell.textContent = "No open orders.";
          row.append(cell);
          openOrderRows.append(row);
          return 0;
        }

        for (const order of openOrders) {
          const row = document.createElement("tr");
          const fields = [
            ["nOrdNo", "orderId", "order_id"],
            ["trdSym", "tradingSymbol", "trading_symbol", "ts"],
            ["trnsTp", "transactionType", "transaction_type", "tt"],
            ["qty", "quantity", "qt"],
            ["prc", "price", "pr"],
            ["prcTp", "orderType", "order_type", "pt"],
            ["ordSt", "orderStatus", "status", "stat"],
          ];
          for (const keys of fields) {
            const cell = document.createElement("td");
            cell.textContent = orderValue(order, keys);
            row.append(cell);
          }
          const actionCell = document.createElement("td");
          const orderNumber = orderValue(order, ["nOrdNo", "orderId", "order_id"]);
          if (orderNumber !== "—") {
            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.textContent = "Cancel";
            cancelButton.setAttribute("aria-label", "Cancel order " + orderNumber);
            cancelButton.addEventListener("click", () => {
              void cancelOpenOrder(orderNumber, orderValue(order, ["trdSym", "tradingSymbol", "ts"]));
            });
            actionCell.append(cancelButton);
          } else {
            actionCell.textContent = "—";
          }
          row.append(actionCell);
          openOrderRows.append(row);
        }
        return openOrders.length;
      }

      async function cancelOpenOrder(orderNumber, tradingSymbol) {
        if (!window.confirm("Cancel open order " + orderNumber + " (" + tradingSymbol + ")?")) return;
        const cancelButton = [...openOrderRows.querySelectorAll("button")].find((button) =>
          button.getAttribute("aria-label") === "Cancel order " + orderNumber,
        );
        if (cancelButton) cancelButton.disabled = true;
        openOrdersStatus.textContent = "Submitting cancellation for order " + orderNumber + "…";
        openOrdersStatus.dataset.kind = "";
        try {
          const response = await fetch(
            "/api/orders/" + encodeURIComponent(orderNumber) + "/cancel",
            { method: "POST", headers: { Accept: "application/json" } },
          );
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not cancel this order.");
          await loadOpenOrders();
          openOrdersStatus.textContent =
            "Cancellation requested for order " + orderNumber + "; open orders refreshed.";
        } catch (error) {
          openOrdersStatus.textContent =
            error instanceof Error ? error.message : "Could not cancel this order.";
          openOrdersStatus.dataset.kind = "error";
          if (cancelButton) cancelButton.disabled = false;
        }
      }

      async function loadOpenOrders() {
        refreshOpenOrdersButton.disabled = true;
        openOrdersStatus.textContent = "Loading open orders…";
        openOrdersStatus.dataset.kind = "";
        try {
          const response = await fetch("/api/orders", { headers: { Accept: "application/json" } });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Could not load open orders.");
          const count = renderOpenOrders(extractOrders(payload));
          openOrdersStatus.textContent =
            count + " open order" + (count === 1 ? "" : "s") + ".";
        } catch (error) {
          openOrderRows.replaceChildren();
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 8;
          cell.textContent = "Open orders could not be loaded.";
          row.append(cell);
          openOrderRows.append(row);
          openOrdersStatus.textContent =
            error instanceof Error ? error.message : "Could not load open orders.";
          openOrdersStatus.dataset.kind = "error";
        } finally {
          refreshOpenOrdersButton.disabled = false;
        }
      }

      function setFeedStatus(state, text) {
        priceStatus.dataset.state = state;
        priceStatus.querySelector(".feed-label").textContent = text;
      }

      function makeInstrumentCell(row, contract, side) {
        const cell = document.createElement("td");
        cell.className = side + "-instrument";
        const name = document.createElement("span");
        name.className = "instrument-name";
        name.textContent = contract?.tradingSymbol ?? "—";
        cell.append(name);
        if (contract) {
          const swingButton = document.createElement("button");
          swingButton.className = "swing-button";
          swingButton.type = "button";
          swingButton.textContent = "SW";
          swingButton.title = "View liquidity swings for " + contract.tradingSymbol;
          swingButton.setAttribute("aria-label", "View liquidity swings for " + contract.tradingSymbol);
          swingButton.addEventListener("click", () => {
            void openSwingModal(contract);
          });
          cell.append(swingButton);

          const button = document.createElement("button");
          button.className = "buy-button";
          button.type = "button";
          button.disabled = orderSubmissionUncertain;
          button.textContent = "BUY";
          button.title = orderSubmissionUncertain
            ? "Check your Kotak Neo order book before retrying"
            : "Open a live BUY order ticket for " + contract.tradingSymbol;
          button.setAttribute("aria-label", "Buy " + contract.tradingSymbol);
          button.addEventListener("click", () => {
            void openOrderTicket(contract);
          });
          cell.append(button);
        }
        row.append(cell);
      }

      function todayInIndia() {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date());
        const part = (type) => parts.find((item) => item.type === type).value;
        return part("year") + "-" + part("month") + "-" + part("day");
      }

      function dateBefore(date, days) {
        const result = new Date(date + "T00:00:00Z");
        result.setUTCDate(result.getUTCDate() - days);
        return result.toISOString().slice(0, 10);
      }

      function setSwingStatus(message, kind = "") {
        swingStatus.textContent = message;
        swingStatus.dataset.kind = kind;
      }

      function updateSwingLtp(price = optionPrices.get(selectedSwingContract?.tradingSymbol)) {
        swingLtpLabel.textContent =
          Number.isFinite(price) && price > 0
            ? "LTP ₹" + numberFormat.format(price)
            : "LTP unavailable";
      }

      function setSwingEmpty(message) {
        swingRows.replaceChildren();
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.className = "swing-empty";
        cell.colSpan = 8;
        cell.textContent = message;
        row.append(cell);
        swingRows.append(row);
      }

      function addSwingCell(row, text, className = "") {
        const cell = document.createElement("td");
        cell.textContent = text;
        if (className) cell.className = className;
        row.append(cell);
      }

      function renderSwingRows() {
        const visibleSwings = analyzedSwings.filter((swing) =>
          swingSideSelect.value === "both" || swing.side === swingSideSelect.value,
        );
        swingRows.replaceChildren();
        if (!visibleSwings.length) {
          setSwingEmpty("No swings match this side in the selected date range.");
          return;
        }
        for (const swing of visibleSwings) {
          const row = document.createElement("tr");
          addSwingCell(row, swing.side === "high" ? "Swing high" : "Swing low", "swing-" + swing.side);
          const pivotDate = new Date(swing.pivotTime);
          addSwingCell(
            row,
            Number.isNaN(pivotDate.getTime())
              ? swing.pivotTime
              : pivotDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          );
          addSwingCell(row, numberFormat.format(swing.level));
          addSwingCell(
            row,
            numberFormat.format(swing.zoneBottom) + " – " + numberFormat.format(swing.zoneTop),
          );
          addSwingCell(row, String(swing.intersectionCount));
          addSwingCell(row, volumeFormat.format(swing.intersectionVolume));
          addSwingCell(
            row,
            swing.crossedAt ? "Broken" : swing.qualifiedAt ? "Qualified" : "Tracking",
          );
          const actionCell = document.createElement("td");
          const buyButton = document.createElement("button");
          buyButton.className = "swing-buy";
          buyButton.type = "button";
          buyButton.textContent = "BUY";
          const orderKey =
            selectedSwingContract.tradingSymbol + ":" + expirySelect.value + ":" +
            swing.side + ":" + swing.pivotTime;
          buyButton.disabled = orderSubmissionUncertain || swingOrderAttempts.has(orderKey);
          if (buyButton.disabled) buyButton.textContent = orderSubmissionUncertain ? "Check order" : "Sent";
          buyButton.title =
            "Place live BUY stop-limit · 65 MIS units · limit and trigger ₹" +
            numberFormat.format(swing.level);
          buyButton.setAttribute(
            "aria-label",
            "Place BUY stop-limit order for " + selectedSwingContract.tradingSymbol +
              " at " + numberFormat.format(swing.level),
          );
          buyButton.addEventListener("click", () => {
            const contract = selectedSwingContract;
            if (!contract) return;
            void placeSwingBuyOrder(contract, swing, orderKey, buyButton);
          });
          actionCell.append(buyButton);
          row.append(actionCell);
          swingRows.append(row);
        }
      }

      async function openSwingModal(contract) {
        selectedSwingContract = contract;
        swingRequestId += 1;
        analyzedSwings = [];
        swingInstrumentLabel.textContent = contract.tradingSymbol + " · " + expirySelect.value;
        updateSwingLtp();
        swingIntervalSelect.value = "1min";
        swingLookbackSelect.value = "5";
        swingSideSelect.value = "high";
        swingToInput.value = todayInIndia();
        swingFromInput.value = swingToInput.value;
        setSwingStatus("Loading historical candles…");
        setSwingEmpty("Loading swings…");
        swingDialog.showModal();
        await loadContractSwings();
      }

      async function loadContractSwings() {
        if (!selectedSwingContract) return;
        const from = swingFromInput.value;
        const to = swingToInput.value;
        const maxDays = swingMaxDays[swingIntervalSelect.value];
        const range = (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000;
        if (!from || !to || !Number.isFinite(range) || range < 0 || range > maxDays) {
          setSwingStatus("Select a valid date range within " + maxDays + " days for this interval.", "error");
          return;
        }

        const requestId = ++swingRequestId;
        swingAnalyzeButton.disabled = true;
        setSwingStatus("Loading historical candles and analyzing swings…");
        setSwingEmpty("Loading swings…");
        const query = new URLSearchParams({
          instrument: selectedSwingContract.tradingSymbol,
          interval: swingIntervalSelect.value,
          pivotLookback: swingLookbackSelect.value,
          fromdate: from,
          todate: to,
        });
        try {
          const response = await fetch(
            "/api/auto-trade/liquidity-swings?" + query,
            { headers: { Accept: "application/json" } },
          );
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Could not load liquidity swings.");
          if (requestId !== swingRequestId) return;
          analyzedSwings = payload.swings;
          renderSwingRows();
          setSwingStatus(
            payload.candleCount + " candles analyzed for " + payload.instrument + " (" + payload.interval + ").",
          );
        } catch (error) {
          if (requestId !== swingRequestId) return;
          analyzedSwings = [];
          setSwingEmpty("No swing results available.");
          setSwingStatus(
            error instanceof Error ? error.message : "Could not load liquidity swings.",
            "error",
          );
        } finally {
          if (requestId === swingRequestId) swingAnalyzeButton.disabled = false;
        }
      }

      async function placeSwingBuyOrder(contract, swing, orderKey, button) {
        if (button.disabled || orderSubmissionUncertain || swingOrderAttempts.has(orderKey)) return;
        const price = Number(swing.level.toFixed(4));
        if (!Number.isFinite(price) || price <= 0) {
          setSwingStatus("Cannot place an order: swing level must be a positive price.", "error");
          return;
        }

        swingOrderAttempts.add(orderKey);
        button.disabled = true;
        button.textContent = "Sending…";
        setSwingStatus(
          "Placing BUY stop-limit · 65 MIS units · limit and trigger ₹" +
            numberFormat.format(price) + "…",
        );
        const orderPayload = {
          expiry: expirySelect.value,
          tradingSymbol: contract.tradingSymbol,
          transactionType: "B",
          quantity: "65",
          product: "MIS",
          orderType: "SL",
          price: String(price),
          triggerPrice: String(price),
          validity: "DAY",
          amo: "NO",
          disclosedQuantity: "0",
          marketProtection: "0",
        };
        try {
          const response = await fetch("/api/options/nifty/order", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(orderPayload),
          });
          const result = await response.json();
          if (!response.ok) {
            if (
              typeof result.error === "string" &&
              result.error.startsWith("Order outcome could not be confirmed")
            ) {
              orderSubmissionUncertain = true;
              disableSwingBuyButtons();
              renderChain();
              button.textContent = "Check order";
              const message =
                result.error + "; do not retry until you check your Kotak Neo order book.";
              setSwingStatus(message, "error");
              setStatus(message, "error");
              return;
            }
            swingOrderAttempts.delete(orderKey);
            button.disabled = false;
            button.textContent = "BUY";
            setSwingStatus(result.error || "Kotak Neo could not place the order.", "error");
            return;
          }

          button.textContent = "Sent";
          const orderNumber = result.nOrdNo || result.orderId;
          const message =
            "BUY stop-limit sent · 65 MIS units · ₹" + numberFormat.format(price) +
            (orderNumber ? " · " + orderNumber : "") +
            ". Check the Kotak Neo order book for its status.";
          setSwingStatus(message);
          setStatus(message);
          void loadOpenOrders();
        } catch (error) {
          orderSubmissionUncertain = true;
          disableSwingBuyButtons();
          renderChain();
          button.textContent = "Check order";
          const message =
            "Order outcome is uncertain; check your Kotak Neo order book before retrying." +
            (error instanceof Error ? " " + error.message : "");
          setSwingStatus(message, "error");
          setStatus(message, "error");
        }
      }

      function disableSwingBuyButtons() {
        for (const buyButton of swingRows.querySelectorAll(".swing-buy")) {
          buyButton.disabled = true;
          buyButton.textContent = "Check order";
        }
      }

      swingForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void loadContractSwings();
      });
      swingSideSelect.addEventListener("change", renderSwingRows);
      swingIntervalSelect.addEventListener("change", () => {
        const days = swingMaxDays[swingIntervalSelect.value];
        const range = (Date.parse(swingToInput.value + "T00:00:00Z") -
          Date.parse(swingFromInput.value + "T00:00:00Z")) / 86400000;
        if (range > days) swingFromInput.value = dateBefore(swingToInput.value, days);
      });
      document.querySelector("#swing-close").addEventListener("click", () => {
        swingRequestId += 1;
        swingDialog.close();
      });
      document.querySelector("#swing-done").addEventListener("click", () => {
        swingRequestId += 1;
        swingDialog.close();
      });

      async function openOrderTicket(contract) {
        orderError.textContent = "";
        try {
          const response = await fetch("/api/auth/session", {
            headers: { Accept: "application/json" },
          });
          if (!response.ok) throw new Error("Could not check your Kotak Neo session.");
          const session = await response.json();
          if (session.authenticated !== true) {
            setStatus("Sign in before placing an order.", "error");
            return;
          }
          selectedOrderContract = contract;
          orderContractLabel.textContent = contract.tradingSymbol + " · " + expirySelect.value;
          updateOrderLtp();
          orderQuantityInput.value = String(contract.lotSize);
          orderSideSelect.value = "B";
          orderProductSelect.value = "MIS";
          orderTypeSelect.value = "SL";
          orderValiditySelect.value = "DAY";
          orderAmoSelect.value = "NO";
          orderTriggerInput.value = "";
          orderPriceInput.value = "";
          orderDisclosedQuantityInput.value = "0";
          orderMarketProtectionInput.value = "0";
          orderTagInput.value = "";
          orderSquareOffValueInput.value = "";
          orderStopLossValueInput.value = "";
          orderTrailingStopSelect.value = "N";
          orderTrailingValueInput.value = "0";
          updateOrderFields();
          orderDialog.showModal();
          orderQuantityInput.focus();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not open the order ticket.", "error");
        }
      }

      function updateOrderLtp(price = optionPrices.get(selectedOrderContract?.tradingSymbol)) {
        orderLtpLabel.textContent =
          Number.isFinite(price) && price > 0
            ? "LTP ₹" + numberFormat.format(price)
            : "LTP unavailable";
      }

      function updateOrderFields() {
        const orderType = orderTypeSelect.value;
        const product = orderProductSelect.value;
        const marketOrder = orderType === "MKT" || orderType === "SL-M";
        const triggerRequired =
          orderType === "SL" || orderType === "SL-M" || product === "CO";
        orderPriceField.hidden = marketOrder;
        orderPriceInput.required = !marketOrder;
        orderPriceInput.disabled = marketOrder;
        if (marketOrder) orderPriceInput.value = "0";
        else if (orderPriceInput.value === "0") orderPriceInput.value = "";
        orderTriggerField.hidden = !triggerRequired;
        orderTriggerInput.required = triggerRequired;
        if (!triggerRequired) orderTriggerInput.value = "";
        orderBracketFields.hidden = product !== "BO";
        orderSquareOffValueInput.required = product === "BO";
        orderStopLossValueInput.required = product === "BO";
        orderTrailingValueInput.required = product === "BO" && orderTrailingStopSelect.value === "Y";
        if (product === "BO" && orderTrailingStopSelect.value === "N") {
        orderTrailingValueInput.value = "0";
        }
      }

      orderTypeSelect.addEventListener("change", updateOrderFields);
      orderProductSelect.addEventListener("change", updateOrderFields);
      orderTrailingStopSelect.addEventListener("change", updateOrderFields);

      orderForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!selectedOrderContract || !orderForm.reportValidity()) return;

        const quantity = Number(orderQuantityInput.value);
        const lotSize = Number(selectedOrderContract.lotSize);
        const triggerPrice = Number(orderTriggerInput.value);
        const orderType = orderTypeSelect.value;
        const product = orderProductSelect.value;
        const side = orderSideSelect.value;
        const isMarketOrder = orderType === "MKT" || orderType === "SL-M";
        const price = isMarketOrder ? 0 : Number(orderPriceInput.value);
        const triggerRequired =
          orderType === "SL" || orderType === "SL-M" || product === "CO";
        if (
          !Number.isSafeInteger(quantity) ||
          !Number.isSafeInteger(lotSize) ||
          lotSize < 1 ||
          quantity % lotSize !== 0
        ) {
          orderError.textContent = "Quantity must be a whole number of lots (" + lotSize + " units per lot).";
          return;
        }
        if (Number(orderDisclosedQuantityInput.value) > quantity) {
          orderError.textContent = "Disclosed quantity cannot exceed order quantity.";
          return;
        }
        if (!isMarketOrder && (!Number.isFinite(price) || price <= 0)) {
          orderError.textContent = "Enter a positive price for a limit order.";
          return;
        }
        if (triggerRequired && (!Number.isFinite(triggerPrice) || triggerPrice <= 0)) {
          orderError.textContent = "Enter a positive trigger price for this order.";
          return;
        }
        if (
          orderType === "SL" &&
          (side === "B" ? price < triggerPrice : price > triggerPrice)
        ) {
          orderError.textContent =
            side === "B"
              ? "For a BUY stop-limit order, the limit price must be at least the trigger price."
              : "For a SELL stop-limit order, the limit price must be at most the trigger price.";
          return;
        }
        if (
          product === "BO" &&
          (Number(orderSquareOffValueInput.value) <= 0 ||
            Number(orderStopLossValueInput.value) <= 0 ||
            (orderTrailingStopSelect.value === "Y" && Number(orderTrailingValueInput.value) <= 0))
        ) {
          orderError.textContent = "Bracket order values must be positive; trailing value is required when enabled.";
          return;
        }

        const lots = quantity / lotSize;
        const sideLabel = side === "B" ? "BUY" : "SELL";
        const orderTypeLabel = orderTypeSelect.selectedOptions[0].textContent;
        const productLabel = orderProductSelect.selectedOptions[0].textContent;
        const autoSellNote =
          side !== "B"
            ? ""
            : product === "MIS" || product === "NRML"
              ? "\\nAuto-sell: after full fill, place an SL-limit SELL 5 points below the average fill price."
              : "\\nAuto-sell is not enabled for " + product + " BUY orders.";
        const confirmation =
          "Place a LIVE " + sideLabel + " order?\\n\\n" +
          selectedOrderContract.tradingSymbol + " · " + expirySelect.value + "\\n" +
          quantity + " units (" + lots + " lot" + (lots === 1 ? "" : "s") + ") · " +
          productLabel + " · " + orderTypeLabel + " · " + orderValiditySelect.value +
          "\\nPrice ₹" + numberFormat.format(price) +
          (triggerRequired ? " · Trigger ₹" + numberFormat.format(triggerPrice) : "") +
          autoSellNote;
        if (!window.confirm(confirmation)) return;

        orderSubmitButton.disabled = true;
        orderSubmitButton.textContent = "Submitting…";
        orderError.textContent = "";
        const orderTag = orderTagInput.value.trim();
        const orderPayload = {
          expiry: expirySelect.value,
          tradingSymbol: selectedOrderContract.tradingSymbol,
          transactionType: side,
          quantity: String(quantity),
          product,
          orderType,
          price: String(price),
          validity: orderValiditySelect.value,
          amo: orderAmoSelect.value,
          disclosedQuantity: orderDisclosedQuantityInput.value,
          marketProtection: orderMarketProtectionInput.value,
          triggerPrice: triggerRequired ? String(triggerPrice) : "0",
          ...(product === "BO"
            ? {
                squareOffType: orderSquareOffTypeSelect.value,
                stopLossType: orderStopLossTypeSelect.value,
                stopLossValue: orderStopLossValueInput.value,
                squareOffValue: orderSquareOffValueInput.value,
                trailingStopLoss: orderTrailingStopSelect.value,
                trailingSlValue:
                  orderTrailingStopSelect.value === "Y" ? orderTrailingValueInput.value : "0",
                ...(optionPrices.has(selectedOrderContract.tradingSymbol)
                  ? { lastTradedPrice: String(optionPrices.get(selectedOrderContract.tradingSymbol)) }
                  : {}),
              }
            : {}),
          ...(orderTag ? { tag: orderTag } : {}),
        };
        try {
          const response = await fetch("/api/options/nifty/order", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(orderPayload),
          });
          const result = await response.json();
          if (!response.ok) {
            if (
              typeof result.error === "string" &&
              result.error.startsWith("Order outcome could not be confirmed")
            ) {
              orderSubmissionUncertain = true;
              orderDialog.close();
              renderChain();
              setStatus(
                result.error || "Order outcome is uncertain; check your Kotak Neo order book before retrying.",
                "error",
              );
              return;
            }
            orderError.textContent = result.error || "Kotak Neo could not place the order.";
            return;
          }

          orderDialog.close();
          const orderNumber = result.nOrdNo || result.orderId;
          setStatus(
            "Order request sent" + (orderNumber ? " · " + orderNumber : "") +
            ". Check your Kotak Neo order book for its status.",
          );
          void loadOpenOrders();
        } catch (error) {
          orderSubmissionUncertain = true;
          orderDialog.close();
          renderChain();
          setStatus(
            "Order outcome is uncertain; check your Kotak Neo order book before retrying. " +
              (error instanceof Error ? error.message : ""),
            "error",
          );
        } finally {
          orderSubmitButton.disabled = false;
          orderSubmitButton.textContent = "Review & place live " + (orderSideSelect.value === "B" ? "BUY" : "SELL");
        }
      });

      updateOrderFields();

      document.querySelector("#order-cancel").addEventListener("click", () => {
        orderDialog.close();
      });

      function makePriceCell(row, contract, side) {
        const cell = document.createElement("td");
        cell.className = side + "-price";
        const price = document.createElement("span");
        price.className = "option-price";
        price.dataset.symbol = contract.tradingSymbol;
        price.textContent = optionPrices.has(contract.tradingSymbol)
          ? "₹" + numberFormat.format(optionPrices.get(contract.tradingSymbol))
          : "—";
        cell.append(price);
        row.append(cell);
      }

      function connectNiftyPriceStream(expiry) {
        marketFeed?.close();
        setFeedStatus("connecting", "Connecting");
        const source = new EventSource(
          "/api/market/nifty/stream?expiry=" + encodeURIComponent(expiry),
        );
        marketFeed = source;
        source.onopen = () => setFeedStatus("connecting", "Connecting");
        source.addEventListener("feed-connected", () => setFeedStatus("live", "Live"));
        source.addEventListener("price", (event) => {
          if (!(event instanceof MessageEvent)) return;
          try {
            const tick = JSON.parse(event.data);
            if (!Number.isFinite(tick.price) || tick.price <= 0) {
              throw new Error("Kotak returned an invalid NIFTY price");
            }
            liveSpotPrice = tick.price;
            const niftyPrice = document.querySelector("#nifty-spot-price");
            if (niftyPrice) niftyPrice.textContent = "₹" + numberFormat.format(tick.price);
            setFeedStatus("live", "Live");
            renderChain();
          } catch {
            setFeedStatus("disconnected", "Invalid index update");
          }
        });
        source.addEventListener("option-price", (event) => {
          if (!(event instanceof MessageEvent)) return;
          try {
            const tick = JSON.parse(event.data);
            if (
              typeof tick.tradingSymbol !== "string" ||
              !Number.isFinite(tick.price) ||
              tick.price <= 0
            ) {
              throw new Error("Kotak returned an invalid option price");
            }
            optionPrices.set(tick.tradingSymbol, tick.price);
            setFeedStatus("live", "Live");
            if (selectedSwingContract?.tradingSymbol === tick.tradingSymbol) {
              updateSwingLtp(tick.price);
            }
            if (selectedOrderContract?.tradingSymbol === tick.tradingSymbol) {
              updateOrderLtp(tick.price);
            }
            for (const price of document.querySelectorAll(".option-price")) {
              if (price.dataset.symbol === tick.tradingSymbol) {
                price.textContent = "LTP ₹" + numberFormat.format(tick.price);
              }
            }
          } catch {
            setFeedStatus("disconnected", "Invalid option update");
          }
        });
        source.addEventListener("market-error", (event) => {
          if (!(event instanceof MessageEvent)) return;
          try {
            const data = JSON.parse(event.data);
            setFeedStatus("disconnected", data.error || "Feed disconnected");
          } catch {
            setFeedStatus("disconnected", "Feed disconnected");
          }
        });
        source.onerror = () => {
          setFeedStatus("reconnecting", "Reconnecting");
          void fetch("/api/auth/session", { headers: { Accept: "application/json" } })
            .then((response) => response.json())
            .then((data) => {
              if (data.authenticated !== true) {
                source.close();
                setFeedStatus("idle", "Sign in for live price");
              }
            })
            .catch(() => {
              setFeedStatus("disconnected", "Session check failed");
            });
        };
      }

      function renderChain() {
        if (liveSpotPrice === undefined) {
          tableWrap.hidden = true;
          if (loadedContracts.length > 0) {
            setStatus("Waiting for live price…");
          }
          return;
        }

        const strikes = new Map();
        for (const contract of loadedContracts) {
          const pair = strikes.get(contract.strike) ?? {};
          pair[contract.optionType] = contract;
          strikes.set(contract.strike, pair);
        }
        const pairedStrikes = [...strikes.entries()]
          .filter(([, pair]) => pair.CE && pair.PE)
          .map(([strike]) => strike);
        const belowStrikes = pairedStrikes
          .filter((strike) => strike < liveSpotPrice)
          .sort((left, right) => right - left)
          .slice(0, 5);
        const aboveStrikes = pairedStrikes
          .filter((strike) => strike > liveSpotPrice)
          .sort((left, right) => left - right)
          .slice(0, 5);
        const sorted = [...belowStrikes, ...aboveStrikes].sort((left, right) => right - left);
        const selectedSymbols = new Set(
          sorted.flatMap((strike) => [
            strikes.get(strike).CE.tradingSymbol,
            strikes.get(strike).PE.tradingSymbol,
          ]),
        );
        for (const symbol of optionPrices.keys()) {
          if (!selectedSymbols.has(symbol)) optionPrices.delete(symbol);
        }
        const strikesKey = sorted.join(",") || "none";
        if (strikesKey === displayedStrikesKey) {
          for (const button of tableBody.querySelectorAll(".buy-button")) {
            button.disabled = orderSubmissionUncertain;
          }
          return;
        }
        displayedStrikesKey = strikesKey;

        tableBody.replaceChildren();
        const spotRow = document.createElement("tr");
        spotRow.className = "spot-row";
        const spotCell = document.createElement("td");
        spotCell.colSpan = 5;
        const spotMarker = document.createElement("div");
        spotMarker.className = "spot-marker";
        const spotPill = document.createElement("div");
        spotPill.className = "spot-pill";
        const spotLabel = document.createElement("span");
        spotLabel.className = "spot-label";
        spotLabel.textContent = "Spot price";
        const spotPrice = document.createElement("span");
        spotPrice.className = "spot-price";
        spotPrice.id = "nifty-spot-price";
        spotPrice.setAttribute("aria-label", "Live NIFTY 50 spot price");
        spotPrice.textContent = "₹" + numberFormat.format(liveSpotPrice);
        spotPill.append(spotLabel, spotPrice);
        spotMarker.append(spotPill);
        spotCell.append(spotMarker);
        spotRow.append(spotCell);

        for (const [index, strike] of sorted.entries()) {
          if (index === aboveStrikes.length) tableBody.append(spotRow);
          const pair = strikes.get(strike);
          const row = document.createElement("tr");
          row.className = "option-row";
          const call = pair.CE;
          const put = pair.PE;
          makeInstrumentCell(row, call, "call");
          makePriceCell(row, call, "call");
          const strikeCell = document.createElement("td");
          strikeCell.className = "strike-cell";
          strikeCell.textContent = numberFormat.format(strike);
          row.append(strikeCell);
          makePriceCell(row, put, "put");
          makeInstrumentCell(row, put, "put");
          tableBody.append(row);
        }
        if (sorted.length === 0) tableBody.prepend(spotRow);
        else if (aboveStrikes.length >= sorted.length) tableBody.append(spotRow);
        if (sorted.length === 0) {
          tableWrap.hidden = true;
          setStatus("No nearby contracts for this expiry.", "error");
          return;
        }
        tableWrap.hidden = false;
        setStatus(sorted.length + " strikes around NIFTY");
      }

      async function loadChain() {
        const expiry = expirySelect.value;
        if (!expiry) return;
        expirySelect.disabled = true;
        tableWrap.hidden = true;
        displayedStrikesKey = "";
        loadedContracts = [];
        optionPrices.clear();
        marketFeed?.close();
        setStatus("Loading local option contracts…");
        try {
          const response = await fetch("/api/options/nifty/chain?expiry=" + encodeURIComponent(expiry), {
            headers: { Accept: "application/json" },
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not load the option chain.");
          loadedContracts = data.contracts;
          renderChain();
          await initializeLivePrice(expiry);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not load the option chain.", "error");
        } finally {
          expirySelect.disabled = false;
        }
      }

      async function initialize() {
        try {
          const response = await fetch("/api/options/nifty/expiries", { headers: { Accept: "application/json" } });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not load option expiries.");
          expiryValues = data.expiries;
          expirySelect.replaceChildren();
          for (const expiry of expiryValues) {
            const option = document.createElement("option");
            option.value = expiry;
            option.textContent = expiry;
            expirySelect.append(option);
          }
          if (expiryValues.length === 0) throw new Error("No upcoming NIFTY option expiries were found in the Scrip Master.");
          expirySelect.disabled = false;
          await loadChain();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not initialize the option chain.", "error");
        }
      }

      async function initializeLivePrice(expiry = expirySelect.value) {
        if (!expiry) return;
        try {
          const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error("Could not check your Kotak Neo session.");
          const session = await response.json();
          if (session.authenticated !== true) {
            setFeedStatus("idle", "Sign in for live price");
            return;
          }
          connectNiftyPriceStream(expiry);
        } catch (error) {
          setFeedStatus("disconnected", error instanceof Error ? error.message : "Could not load live NIFTY price.");
        }
      }

      expirySelect.addEventListener("change", loadChain);
      refreshOpenOrdersButton.addEventListener("click", () => {
        void loadOpenOrders();
      });
      refreshPriceButton.addEventListener("click", () => {
        void initializeLivePrice(expirySelect.value);
      });
      window.addEventListener("beforeunload", () => {
        marketFeed?.close();
        activityEventSource?.close();
      });
      initialize();
      void loadOpenOrders();
      void connectActivityStream();
    </script>
  </body>
</html>`;
}
