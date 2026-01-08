# Data Model

## wallets
Stores user-managed public wallet addresses.

Fields
- `id` (uuid)
- `label`
- `address`
- `type`: `EVM` | `SOLANA`
- `isArchived`
- `createdAt`, `updatedAt`

Unique: `(type, address)`

## networks
Configurable RPC endpoints per chain.

## assets
Canonical metadata registry keyed by canonical `assetId`.

## snapshots
Immutable refresh sessions with status + timestamps.

## snapshot_source_runs
Per-source refresh status with error + metadata.

Unique: `(snapshotId, sourceKey)`

## positions_assets
Asset positions (wallet + protocol).

Indexes: `(snapshotId)`, `(snapshotId,walletId)`, `(snapshotId,chainKey)`,
`(snapshotId,protocol)`, `(snapshotId,assetId)`

## positions_liabilities
Debt positions for lending protocols.

Indexes: `(snapshotId)`, `(snapshotId,walletId)`, `(snapshotId,chainKey)`,
`(snapshotId,protocol)`, `(snapshotId,debtAssetId)`

## snapshot_prices
Per-snapshot price quotes.

Unique: `(snapshotId, assetId, quoteCurrency)`

## snapshot_summaries
Aggregated totals and coverage counts per snapshot.
