# agent-api

Paid-action backend for the GOAT + OpenClaw MVP.

## Endpoints
- `GET /health`
- `GET /api/catalog`
- `GET /api/actions/:actionId/quote`
- `POST /api/entitlements/check`
- `POST /api/payments/create-order`
- `GET /api/payments/:orderId/status`
- `POST /api/payments/:orderId/mock-confirm`
- `POST /api/payments/:orderId/sync`
- `GET /api/payments/:orderId/proof`
- `POST /api/actions/run`
- `GET /api/registration`

## Payment modes

### 1) Mock mode
Set:

```bash
PAYMENT_PROVIDER=mock
```

Behavior:
- returns HTTP 402 for unpaid actions
- uses `/mock-confirm` for demo confirmation
- execution unlocks only after confirmation

### 2) Real x402 mode
Set:

```bash
PAYMENT_PROVIDER=x402
GOATX402_API_URL=http://localhost:8286
GOATX402_API_KEY=...
```

Behavior:
- `create-order` forwards to GOAT x402 createOrder
- `status` syncs against the remote order
- `proof` fetches remote payment proof
- execution only unlocks after remote status becomes paid/confirmed

## Notes
- The x402 adapter is intentionally tolerant of response shape differences by checking common field names like `order_id`, `status`, and `proof_id`.
- Keep `mock` as the safe fallback until your merchant environment is confirmed.
- This backend is still execution-mock on the action side; payment gating is now split into `mock` and `x402` providers.
