# Deploy scripts

## DeployTestnet.s.sol
Deploys:
- `ActionCatalog`
- `MerchantCallbackAdapter`
- `ExecutionReceipt`

And seeds 4 default paid actions.

Run from `contracts/`:

```bash
forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url "$GOAT_RPC_URL" \
  --broadcast
```
