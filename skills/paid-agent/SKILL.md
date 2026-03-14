---
name: paid-agent
description: Charge for specific agent actions before execution, then continue once payment is confirmed.
---

# Paid Agent

Use this skill when the user asks for one of these paid actions:
- `analyze_url`
- `generate_report`
- `chain_brief`
- `premium_execute`

## Behavior

1. Identify the requested action.
2. Before doing the action, check whether payment has already been confirmed for the exact user + action + input combination.
3. If payment is not confirmed, create or show a payment request instead of executing the action.
4. Only execute after payment confirmation exists.
5. When execution finishes, present:
   - the result
   - the order id
   - the proof id if available

## Preferred tool flow in OpenClaw

If the GoatPay plugin tools are enabled, use this sequence:

1. `goatpay_check_entitlement`
2. If not entitled: `goatpay_quote_action`
3. Then `goatpay_create_order`
4. Wait for payment
5. `goatpay_get_order_status`
6. `goatpay_get_order_proof`
7. `goatpay_execute_paid_action`

For local MVP demos only, `goatpay_mock_confirm_order` may be used to simulate payment confirmation.

## MVP HTTP mapping

For the current backend:
- Quote action: `GET /api/actions/:actionId/quote`
- Check entitlement: `POST /api/entitlements/check`
- Create order: `POST /api/payments/create-order`
- Check status: `GET /api/payments/:orderId/status`
- Confirm payment in demo mode: `POST /api/payments/:orderId/mock-confirm`
- Get proof: `GET /api/payments/:orderId/proof`
- Execute paid action: `POST /api/actions/run`
- Registration JSON: `GET /api/registration`

Base URL defaults to `http://localhost:8787`.

## Important rule

Do not perform the paid action first and discuss payment later.
Payment must gate execution.

## Current demo limitation

This MVP uses mock payment confirmation for local demo purposes. When the project is upgraded, replace mock confirmation with real GOAT x402 order creation, proof retrieval, and optional on-chain entitlement callback.
