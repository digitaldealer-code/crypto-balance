# Refresh Flow

1. Create a new snapshot with status `RUNNING`.
2. Create `snapshot_source_runs` rows for every source (default `PENDING`).
3. Run enabled sources with bounded concurrency:
   - Mark the source run `RUNNING` with timestamps.
   - Write positions transactionally.
   - Mark `SUCCESS` or `FAILED` with error details + metadata.
4. Run prices:
   - Collect distinct assetIds from positions.
   - Apply Aave oracle USD prices for Aave assets (if quote currency is USD).
   - Reuse recent cached prices to reduce API calls.
   - Fetch CoinGecko prices only for assets with `coingeckoId`.
   - Write `snapshot_prices`.
   - Update positions with `priceQuote` and `valueQuote`.
5. Compute `snapshot_summaries`.
6. Finalize snapshot:
   - `SUCCESS` when all enabled sources succeed and coverage is 100%.
   - `PARTIAL` when any enabled source fails or prices are missing.
   - `FAILED` when no positions were created.

Refresh is manual-only; no background polling unless a user clicks "Refresh now".
