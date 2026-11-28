import {
  getDeltaExchangeAuthStatus,
  testDeltaExchangeAuthentication,
} from "../services/deltaexchange-client.js";

export function getAuthStatus(_request, response) {
  response.json(getDeltaExchangeAuthStatus());
}

export async function testAuth(_request, response) {
  try {
    const result = await testDeltaExchangeAuthentication();
    response.json(result);
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 502;
    response.status(statusCode).json({
      authenticated: false,
      error: error.message,
    });
  }
}
