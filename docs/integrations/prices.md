# Prices

Status: Implemented (Aave oracle USD + CoinGecko)

Planned approach
- Primary: Aave v3 oracle (USD) for Aave positions.
- Secondary: CoinGecko simple price for assets with `coingeckoId`.
- Cache: reuse recent `snapshot_prices` to reduce latency.
- Missing prices remain null; positions keep quantities.

Configuration
- Optional `COINGECKO_API_KEY` (Pro). Free tier works without a key.

Data handling
- Store `snapshot_prices` per snapshot + asset + quote currency.
- Update positions with `priceQuote` and `valueQuote`.
