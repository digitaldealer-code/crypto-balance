# Solana Wallet Balances

Status: Implemented (SOL + SPL + Token-2022)

Planned approach
- `getBalance` for SOL.
- `getParsedTokenAccountsByOwner` for SPL (include Token-2022 if feasible).

Fallback
- Use an indexer (Helius) only if RPC limitations block progress.
