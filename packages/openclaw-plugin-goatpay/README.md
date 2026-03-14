# openclaw-plugin-goatpay

Minimal OpenClaw plugin scaffold for the GOAT paid-agent MVP.

Current scope:
- exposes a simple status RPC
- exposes `/goatpay/health`
- ships the `paid-agent` skill
- exposes optional agent tools for quote, entitlement, order creation, proof lookup, execution, and registration JSON lookup

Current tool list:
- `goatpay_quote_action`
- `goatpay_check_entitlement`
- `goatpay_create_order`
- `goatpay_get_order_status`
- `goatpay_get_order_proof`
- `goatpay_mock_confirm_order`
- `goatpay_execute_paid_action`
- `goatpay_get_registration`

Next step:
- replace mock payment flow with real x402 createOrder / status / proof integration
- add writeback into on-chain callback and receipt contracts
