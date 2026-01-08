# Aave v3

Status: Implemented (ETH + Base v3 markets)

Planned approach
- Use on-chain `UiPoolDataProvider` for per-wallet supplied/borrowed positions.
- Fallback to subgraph only if needed.

Notes
- Positions stored as protocol `AAVE_V3` in assets + liabilities tables.

Configuration (required for adapter)
- `AAVE_V3_ETH_POOL_ADDRESSES_PROVIDER`
- `AAVE_V3_ETH_UI_POOL_DATA_PROVIDER`
- `AAVE_V3_ETH_PROTOCOL_DATA_PROVIDER` (fallback)
- `AAVE_V3_BASE_POOL_ADDRESSES_PROVIDER`
- `AAVE_V3_BASE_UI_POOL_DATA_PROVIDER`
- `AAVE_V3_BASE_PROTOCOL_DATA_PROVIDER` (fallback)
