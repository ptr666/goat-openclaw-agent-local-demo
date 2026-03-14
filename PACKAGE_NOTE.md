# Goat OpenClaw Agent - Local Demo Package

This package is prepared for local use and handoff.

## Included
- agent-api backend with single-port local demo page
- paid-agent skill
- plugin scaffold
- contracts source + Foundry config/scripts (without build artifacts)

## Excluded intentionally
- .env secrets
- Vercel deployment files
- node_modules
- contract build/broadcast/cache outputs

## Local run
1. Copy `.env.example` to `.env`
2. Fill your GOAT x402 credentials and testnet values
3. Run:
   - `pnpm install`
   - `pnpm --filter agent-api dev`
4. Open `http://localhost:8787`

## Payment status note
`payment_required` is normal after order creation. It means the x402 order is waiting for user payment. After payment is detected and confirmed, the blessing can be unlocked.
