export const orderWebSocketDashboard = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <title>Kotak Order WebSocket</title>
    <style>
      :root { font-family: system-ui, sans-serif; color: #e8edf5; background: #101722; }
      body { max-width: 720px; margin: 10vh auto; padding: 24px; }
      main { padding: 28px; border: 1px solid #293648; border-radius: 16px; background: #172231; }
      h1 { margin-top: 0; font-size: 1.6rem; }
      p { color: #aebbd0; line-height: 1.5; }
      label { display: block; margin: 24px 0 16px; font-size: .9rem; }
      input { box-sizing: border-box; display: block; width: 100%; margin-top: 8px; padding: 12px; color: inherit; background: #0e1621; border: 1px solid #3a4b61; border-radius: 8px; }
      button { margin: 0 8px 8px 0; padding: 10px 16px; color: #07131d; background: #69d6b1; border: 0; border-radius: 8px; font-weight: 700; cursor: pointer; }
      button.secondary { color: #e8edf5; background: #33445a; }
      button:disabled { opacity: .55; cursor: wait; }
      dl { display: grid; grid-template-columns: minmax(140px, 1fr) 2fr; gap: 12px; margin-top: 28px; }
      dt { color: #aebbd0; }
      dd { margin: 0; overflow-wrap: anywhere; }
      #state[data-state="connected"] { color: #69d6b1; }
      #state[data-state="connecting"], #state[data-state="reconnecting"] { color: #ffd479; }
      #state[data-state="disconnected"] { color: #ff8f8f; }
      #message { min-height: 1.5em; color: #ffd479; }
      @media (max-width: 520px) { body { margin: 3vh auto; padding: 12px; } main { padding: 20px; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Kotak order WebSocket</h1>
      <p>Connect or inspect the Worker-managed Kotak stream. The control token is kept in this tab only.</p>
      <label for="token">Worker control token
        <input id="token" type="password" autocomplete="off" spellcheck="false">
      </label>
      <button id="connect" type="button">Connect</button>
      <button id="refresh" class="secondary" type="button">Check status</button>
      <p id="message" role="status" aria-live="polite"></p>
      <dl>
        <dt>Connection</dt><dd id="state" data-state="unknown">Unknown</dd>
        <dt>Authenticated</dt><dd id="authenticated">Unknown</dd>
        <dt>Last message type</dt><dd id="last-type">None</dd>
        <dt>Last message received</dt><dd id="last-message">None</dd>
        <dt>Status checked</dt><dd id="checked-at">Never</dd>
      </dl>
    </main>
    <script>
      const tokenInput = document.querySelector("#token");
      const stateOutput = document.querySelector("#state");
      const messageOutput = document.querySelector("#message");
      const connectButton = document.querySelector("#connect");

      async function request(path, method = "GET") {
        const token = tokenInput.value.trim();
        if (!token) throw new Error("Enter the Worker control token first.");
        const response = await fetch(path, {
          method,
          headers: { Authorization: "Bearer " + token }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Request failed: " + response.status);
        return result;
      }

      function renderStatus(status) {
        stateOutput.textContent = status.state;
        stateOutput.dataset.state = status.state;
        document.querySelector("#authenticated").textContent = status.authenticated ? "Yes" : "No";
        document.querySelector("#last-type").textContent = status.lastMessageType || "None";
        document.querySelector("#last-message").textContent = status.lastMessageAt || "None";
        document.querySelector("#checked-at").textContent = new Date().toLocaleTimeString();
      }

      async function checkStatus() {
        renderStatus(await request("/internal/order-stream/status"));
        messageOutput.textContent = "";
      }

      connectButton.addEventListener("click", async () => {
        connectButton.disabled = true;
        messageOutput.textContent = "Starting connection…";
        try {
          await request("/internal/order-stream/start", "POST");
          await checkStatus();
          messageOutput.textContent = "Connection start requested.";
        } catch (error) {
          messageOutput.textContent = error.message;
        } finally {
          connectButton.disabled = false;
        }
      });

      document.querySelector("#refresh").addEventListener("click", async () => {
        try {
          await checkStatus();
        } catch (error) {
          messageOutput.textContent = error.message;
          stateOutput.textContent = "Status unavailable";
          stateOutput.dataset.state = "unknown";
        }
      });
      setInterval(() => {
        if (tokenInput.value.trim()) {
          checkStatus().catch((error) => {
            messageOutput.textContent = error.message;
            stateOutput.textContent = "Status unavailable";
            stateOutput.dataset.state = "unknown";
          });
        }
      }, 5000);
    </script>
  </body>
</html>`;
