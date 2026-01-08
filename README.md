# Crypto Financials (V1)

Local-only crypto portfolio dashboard that consolidates a balance sheet across EVM + Solana wallets and DeFi protocols. Runs entirely on your machine and exposes a Next.js UI on `127.0.0.1`.

## V1 Scope

- Multi-wallet: EVM + Solana public addresses only.
- Multi-chain: Ethereum, Base, Solana mainnet-beta, HyperEVM (configurable chain id).
- Snapshot-based refresh with per-source statuses and partial failure tolerance.
- Read-only data collection (no signing, no transactions).

## Architecture

- **Next.js (App Router) + TypeScript** for UI and API routes under `/api/*`.
- **Prisma + SQLite** for local persistence (single DB file).
- **Refresh orchestrator** runs in-process and writes immutable snapshots + source run rows.
- **Adapters** (EVM, Solana, prices) live in `lib/adapters/` (mocked in milestones 1-3).

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

Fill out the required RPC values and optional API keys.

3. Create the database:

```bash
pnpm prisma:migrate
```

4. Seed test wallets (optional):

```bash
pnpm seed:wallets
```

5. Run the app:

```bash
pnpm dev
```

Open `http://127.0.0.1:3000`.

## Configuration

Required `.env.local` keys:

- `RPC_ETHEREUM`
- `RPC_BASE`
- `RPC_SOLANA`
- `RPC_HYPEREVM`

Optional:

- `HYPEREVM_CHAIN_ID` (default `999`)
- `ALCHEMY_API_KEY` (recommended for ERC-20 discovery)
- `COINGECKO_API_KEY`
- `AAVE_V3_ETH_POOL_ADDRESSES_PROVIDER`
- `AAVE_V3_ETH_UI_POOL_DATA_PROVIDER`
- `AAVE_V3_BASE_POOL_ADDRESSES_PROVIDER`
- `AAVE_V3_BASE_UI_POOL_DATA_PROVIDER`
- `KAMINO_MARKETS_JSON`
- `HYPEREVM_ERC20_WATCHLIST_JSON`
- `ETHEREUM_ERC20_WATCHLIST_JSON` (fallback ERC-20 watchlist)
- `BASE_ERC20_WATCHLIST_JSON` (fallback ERC-20 watchlist)
- `TEST_WALLETS_JSON`
- `USE_MOCK_SOURCES` (set `true` for mocked adapters in milestones 1-3)

Secrets can optionally be stored in your OS keychain via `keytar` (to be wired in a later milestone). `.env.local` remains the fallback.

## Refresh Semantics

- Refresh is **manual** only. Each click creates a new immutable snapshot.
- Per-source freshness is tracked in `snapshot_source_runs` with success/failure metadata.
- Partial snapshots are expected when any source fails or prices are missing.

## Troubleshooting

- **Rate limits:** Some RPC providers return 429. Refresh handles retries and marks the source as failed if the limit persists.
- **Missing prices:** Positions keep quantities; values show as `--` and priced coverage drops below 100%.
- **RPC issues:** If an RPC is slow/unresponsive, that source will fail while the snapshot continues.

## Milestones

Progress and acceptance criteria live in `docs/milestones.md`.
