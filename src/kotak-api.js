export function createKotakApiUrl(baseUrl, path, query) {
  let endpoint;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    throw new Error("Kotak base URL must be a valid HTTPS Kotak Securities URL");
  }

  if (
    endpoint.protocol !== "https:" ||
    (endpoint.hostname !== "kotaksecurities.com" &&
      !endpoint.hostname.endsWith(".kotaksecurities.com"))
  ) {
    throw new Error("Kotak base URL must be a valid HTTPS Kotak Securities URL");
  }

  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  endpoint.search = new URLSearchParams(query).toString();
  endpoint.hash = "";
  return endpoint;
}
