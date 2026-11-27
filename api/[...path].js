import app from "../src/app.js";

export default function handler(request, response) {
  const requestUrl = request.url ?? "/";
  if (requestUrl !== "/api" && !requestUrl.startsWith("/api/")) {
    request.url = `/api${requestUrl.startsWith("/") ? "" : "/"}${requestUrl}`;
  }
  return app(request, response);
}
