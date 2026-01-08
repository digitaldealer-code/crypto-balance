# Milestones

## Milestone 1: Bootstrap + DB schema + docs skeleton

Status: Completed

Acceptance criteria
- App runs locally on `127.0.0.1`.
- Prisma schema and migration scaffolding exist.
- Docs skeleton created under `docs/`.

How to verify
- `pnpm dev`
- `pnpm prisma:migrate`
- Confirm `docs/` files exist.

## Milestone 2: Wallet CRUD (API + UI)

Status: Completed

Acceptance criteria
- Add/edit/archive wallets with validation.
- Wallets persisted to SQLite.

How to verify
- Create a wallet from `/wallets` and confirm it appears in `GET /api/wallets`.
- Edit a label and archive/unarchive it.

## Milestone 3: Snapshot + Refresh framework (mock adapters)

Status: Completed

Acceptance criteria
- Clicking refresh creates snapshot + source run rows.
- Status polling works.
- Snapshot finalizes with a status.

How to verify
- Click "Refresh now" on the dashboard.
- Poll `/api/refresh/:snapshotId/status`.
- Confirm a snapshot summary appears in `/api/snapshots/latest/summary`.

## Milestone 4: EVM wallet balances (ETH/Base) + prices + dashboard tables

Status: Completed

Acceptance criteria
- Assets table populated for ETH/Base wallets.
- Prices show for common assets; missing price handled.
- Coverage computed.

How to verify
- Refresh with an EVM wallet configured.
- Check dashboard assets and prices.

## Milestone 5: Solana balances

Status: Completed

Acceptance criteria
- SOL + SPL appear in assets table.
- RPC failures handled as partial snapshot.

How to verify
- Refresh with a Solana wallet configured.

## Milestone 6: Aave v3 adapter + drilldown page

Status: Completed

Acceptance criteria
- Aave supplied assets and borrowed liabilities appear correctly.
- Drilldown shows reserve-level breakdown.

How to verify
- Refresh with a wallet with Aave positions.

## Milestone 7: Kamino adapter + drilldown page

Status: Completed

Acceptance criteria
- Deposits and borrows appear for wallets with Kamino usage.
- Failure is graceful with error in per-source status.

How to verify
- Refresh with a wallet with Kamino usage.

## Milestone 8: HyperEVM + HyperLend adapter + drilldown page

Status: In progress

Acceptance criteria
- HyperEVM native + watchlist tokens appear.
- HyperLend positions appear.
- Discovery documented.
- HYPE + kHYPE price feed uses CoinGecko (`hyperliquid`).
- Stablecoins get 1 USD fallback pricing.

How to verify
- Refresh with the HyperEVM test wallet and confirm:
  - HyperEVM assets show in the assets table.
  - HyperLend assets and liabilities show.
  - HYPE/kHYPE price present.
  - Stablecoins display 1 USD.

Final steps
- Confirm HyperLend deposits display for the test wallet.
- If needed, add HyperEVM label to any remaining drilldown tables.
