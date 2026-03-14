# goat-openclaw-agent

A minimal pay-per-action AI app scaffold based on your architecture:
- OpenClaw = agent runtime / orchestration
- x402 = per-action payment gate
- ERC-8004 = agent identity / discovery
- GOAT Testnet3 = chain deployment / demo

## What exists now

### 1) Backend with provider-based payment layer
Location: `apps/agent-api`

Current behavior:
- action catalog with four paid actions
- quote endpoint per action
- entitlement check keyed by `userId + actionId + inputHash`
- provider switch: `PAYMENT_PROVIDER=mock | x402`
- unpaid execution returns HTTP 402
- mock payment confirmation endpoint for local demo mode
- real x402 order creation / status sync / proof fetch in x402 mode
- delegate-mode callback hooks for high-value actions like `premium_execute`
- ERC-8004 registration JSON template endpoint

### 2) OpenClaw plugin scaffold
Location: `packages/openclaw-plugin-goatpay`

Current behavior:
- status RPC
- status slash command
- health route
- optional agent tools for quote / order / proof / execution / registration
- supports optional `walletAddress` when creating real x402 orders
- ships `paid-agent` skill

### 3) OpenClaw skill
Location: `skills/paid-agent`

Current behavior:
- teaches the agent that payment gates execution
- documents the preferred tool sequence
- documents current MVP endpoints

### 4) Solidity contracts + Foundry deployment scaffold
Location: `contracts`

Current contracts:
- `ActionCatalog.sol`
- `MerchantCallbackAdapter.sol`
- `ExecutionReceipt.sol`

Deployment scaffold:
- `foundry.toml`
- `script/DeployTestnet.s.sol`
- `contracts/.env.example`

## Provider modes

### Mock mode
```bash
PAYMENT_PROVIDER=mock
```
Flow:
1. Quote action price
2. Check entitlement
3. Create order
4. Receive HTTP 402 payment request
5. Confirm payment in mock mode
6. Retrieve proof
7. Execute action

### Real x402 mode
```bash
PAYMENT_PROVIDER=x402
GOATX402_API_URL=http://localhost:8286
GOATX402_API_KEY=...
```
Flow:
1. Quote action price
2. Check entitlement
3. Create order through x402
4. Poll/sync remote order status
5. Fetch order proof
6. Execute action after confirmation

## Delegate / callback mode
For `delegateMode=true` actions like `premium_execute`, you can prepare callback mode with:

```bash
X402_ENABLE_CALLBACK=true
X402_CALLBACK_ADAPTER=0xYourMerchantCallbackAdapter
X402_CALLBACK_CALLDATA_TEMPLATE=delegate:{orderId}:{actionId}:{inputHash}
```

Current implementation supports:
- attaching `callback_calldata` during real x402 order creation
- auto-building ABI calldata for `onX402Callback(bytes32,address,bytes32,uint256)` when no template override is provided
- attaching callback adapter metadata for delegate actions
- keeping the app architecture ready for the real on-chain callback contract flow

If your merchant/core expects a different callback payload shape, override it with `X402_CALLBACK_CALLDATA_TEMPLATE` or adjust the callback builder.

## Run locally

```bash
cd goat-openclaw-agent
pnpm install
cp .env.example .env
pnpm dev:api
```

## Quick test: mock mode

```bash
curl http://localhost:8787/api/catalog
curl http://localhost:8787/api/actions/generate_report/quote

curl -i -X POST http://localhost:8787/api/entitlements/check \
  -H 'content-type: application/json' \
  -d '{"userId":"demo-user","actionId":"generate_report","input":{"topic":"GOAT hackathon MVP"}}'

curl -i -X POST http://localhost:8787/api/payments/create-order \
  -H 'content-type: application/json' \
  -d '{"userId":"demo-user","actionId":"generate_report","input":{"topic":"GOAT hackathon MVP"}}'
```

Use the returned `orderId`:

```bash
curl -X POST http://localhost:8787/api/payments/<ORDER_ID>/mock-confirm
curl http://localhost:8787/api/payments/<ORDER_ID>/proof
curl -X POST http://localhost:8787/api/actions/run \
  -H 'content-type: application/json' \
  -d '{"orderId":"<ORDER_ID>"}'
```

## Quick test: real x402 mode

Create order with a wallet address:

```bash
curl -i -X POST http://localhost:8787/api/payments/create-order \
  -H 'content-type: application/json' \
  -d '{"userId":"demo-user","walletAddress":"0xYourWallet","actionId":"generate_report","input":{"topic":"GOAT hackathon MVP"}}'
```

Then sync and inspect:

```bash
curl http://localhost:8787/api/payments/<ORDER_ID>/status
curl -X POST http://localhost:8787/api/payments/<ORDER_ID>/sync
curl http://localhost:8787/api/payments/<ORDER_ID>/proof
curl -X POST http://localhost:8787/api/actions/run \
  -H 'content-type: application/json' \
  -d '{"orderId":"<ORDER_ID>"}'
```

## Plugin tools

The GoatPay plugin exposes these optional tools:
- `goatpay_quote_action`
- `goatpay_check_entitlement`
- `goatpay_create_order`
- `goatpay_get_order_status`
- `goatpay_get_order_proof`
- `goatpay_mock_confirm_order` (demo only)
- `goatpay_execute_paid_action`
- `goatpay_get_registration`

Enable them through the plugin/tool allowlist in OpenClaw config.

## Immediate build status

Current target:
- `corepack pnpm -r build`

## Best next step after this

1. confirm the exact GOAT x402 merchant payload/headers you will use
2. replace placeholder callback template with ABI-encoded calldata builder
3. run the Foundry deploy script on GOAT Testnet3
4. deploy or reuse an ERC-8004 registry on Testnet3
5. add mint/register script for the agent identity
