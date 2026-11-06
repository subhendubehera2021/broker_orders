export function renderAccessPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0b0f14">
    <title>Web App Access · Neo Desk</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0f14; color: #e6edf3; --muted: #8d9aaa; --accent: #70d6bd; }
      * { box-sizing: border-box; }
      body { display: grid; min-width: 320px; min-height: 100vh; margin: 0; place-items: center; padding: 20px; background: radial-gradient(ellipse at 18% 0%, rgb(112 214 189 / 6%), transparent 34rem), #0b0f14; }
      main { width: min(100%, 420px); padding: 28px; border: 1px solid #26313d; border-radius: 14px; background: linear-gradient(145deg, #131a22, #10161d 80%); box-shadow: 0 18px 48px rgb(0 0 0 / 24%); }
      h1 { margin: 0; font-size: 24px; }
      p { color: var(--muted); font-size: 13px; line-height: 1.6; }
      label { display: grid; gap: 8px; margin-top: 20px; color: #a9b6c4; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      input, button { width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid #303d4b; border-radius: 7px; background: #0e141b; color: #e3eaf1; font: inherit; font-size: 14px; }
      button { margin-top: 14px; border-color: #416b60; background: #1b302a; color: #9ce0cb; font-weight: 750; cursor: pointer; }
      button:disabled { cursor: wait; opacity: .6; }
      input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .message { min-height: 20px; margin-bottom: 0; }
      .message[data-kind="error"] { color: #f0a3a3; }
    </style>
  </head>
  <body>
    <main>
      <h1>Enter access passcode</h1>
      <p>Access remains unlocked in this browser until midnight India time. Enter the configured passcode to continue.</p>
      <form id="access-form">
        <label for="passcode">Passcode
          <input id="passcode" name="passcode" type="password" autocomplete="one-time-code" required autofocus>
        </label>
        <button id="submit" type="submit">Unlock web app</button>
        <p class="message" id="message" role="status" aria-live="polite"></p>
      </form>
    </main>
    <script>
      const form = document.querySelector("#access-form");
      const input = document.querySelector("#passcode");
      const button = document.querySelector("#submit");
      const message = document.querySelector("#message");
      const params = new URLSearchParams(location.search);
      const requestedPath = params.get("next") || "/";
      const next = requestedPath.startsWith("/") && !requestedPath.startsWith("//")
        ? requestedPath
        : "/";

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        button.disabled = true;
        message.textContent = "";
        message.dataset.kind = "";
        try {
          const response = await fetch("/api/access/unlock", {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ passcode: input.value, next }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not unlock the web app.");
          location.assign(result.redirectTo);
        } catch (error) {
          message.textContent = error instanceof Error ? error.message : "Could not unlock the web app.";
          message.dataset.kind = "error";
          input.select();
        } finally {
          button.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
}
