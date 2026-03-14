# contracts

Minimal contract set for the GOAT paid-agent MVP.

## Contracts
- `ActionCatalog.sol` — on-chain action pricing/config display
- `MerchantCallbackAdapter.sol` — records payment-entitlement from x402 callback flow
- `ExecutionReceipt.sol` — optional execution receipt anchoring

## Foundry setup

This folder now includes a minimal Foundry deployment setup:
- `foundry.toml`
- `script/DeployTestnet.s.sol`
- `.env.example`

## Expected env
Copy `.env.example` to `.env` and fill:
- `GOAT_RPC_URL`
- `PRIVATE_KEY`
- `AUTHORIZED_CORE`
- `PAYMENT_TOKEN_USDC`

## Deploy

```bash
cd contracts
forge install foundry-rs/forge-std
source .env
forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url "$GOAT_RPC_URL" \
  --broadcast
```

## What gets deployed
- `ActionCatalog`
- `MerchantCallbackAdapter`
- `ExecutionReceipt`

## Default pricing seeded by deploy script
- `analyze_url` → 0.10 USDC (`100000` with 6 decimals)
- `generate_report` → 0.25 USDC (`250000`)
- `chain_brief` → 0.15 USDC (`150000`)
- `premium_execute` → 0.50 USDC (`500000`, delegate mode)

## Notes
- `AUTHORIZED_CORE` should be your x402 core/callback caller address.
- `PAYMENT_TOKEN_USDC` should be the token address you actually use on GOAT Testnet3.
- If GOAT Testnet3 uses a different test token layout for your merchant environment, update the deploy script before broadcast.
