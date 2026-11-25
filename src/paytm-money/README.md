# Paytm Money module

This module contains the Paytm Money client and routes, registered by
`src/app.ts` independently from the Kotak Neo module.

The app exposes these routes:

- `GET /api/paytm-money/auth/login` starts login and returns the broker URL.
- `GET /api/paytm-money/auth/callback` validates the login state and exchanges
  the request token.
- `GET /api/paytm-money/user-details` fetches account details using the stored
  read token; it requires the app's `x-api-key`.
- `POST /api/paytm-money/auth/logout` clears locally stored tokens and requires
  the app's `x-api-key`.

Access tokens are valid until midnight according to the official documentation.
Tokens are stored in process memory and are not returned to the browser. Keep
API credentials and tokens server-side; do not put credentials in source
control.

These methods follow the official
[Login](https://developer.paytmmoney.com/docs/api/login),
[Generate Access Token](https://developer.paytmmoney.com/docs/api/generate-access-token),
and [User details](https://developer.paytmmoney.com/docs/api/user-details)
documents. Keep future Paytm Money configuration, API client code, broker types,
and related implementation in this folder; keep client tests in
`tests/paytm-money-client.test.ts`.
