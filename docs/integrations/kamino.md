# Kamino

Status: Implemented (Solana Kamino Lend)

Planned approach
- Use `@kamino-finance/klend-sdk` to load obligations per wallet + market.
- Parse deposits/collateral and borrows.

Configuration
- `RPC_SOLANA` is required.
- `KAMINO_MARKETS_JSON` (optional) JSON array of market addresses. Defaults to main market.

Fallback
- Fail gracefully with error surfaced in `snapshot_source_runs`.
