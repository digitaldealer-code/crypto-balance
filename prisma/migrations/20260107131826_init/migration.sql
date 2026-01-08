-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "networks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chainType" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "evmChainId" INTEGER,
    "solanaCluster" TEXT,
    "rpcUrl" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chainKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "addressOrMint" TEXT,
    "symbol" TEXT,
    "name" TEXT,
    "decimals" INTEGER,
    "coingeckoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteCurrency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "snapshot_source_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metaJson" TEXT,
    CONSTRAINT "snapshot_source_runs_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "positions_assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantityRaw" TEXT NOT NULL,
    "quantityDecimal" TEXT NOT NULL,
    "isCollateral" BOOLEAN,
    "priceQuote" TEXT,
    "valueQuote" TEXT,
    "metaJson" TEXT,
    CONSTRAINT "positions_assets_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "positions_assets_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "positions_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "positions_liabilities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "debtAssetId" TEXT NOT NULL,
    "amountRaw" TEXT NOT NULL,
    "amountDecimal" TEXT NOT NULL,
    "priceQuote" TEXT,
    "valueQuote" TEXT,
    "metaJson" TEXT,
    CONSTRAINT "positions_liabilities_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "positions_liabilities_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "positions_liabilities_debtAssetId_fkey" FOREIGN KEY ("debtAssetId") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "snapshot_prices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "priceSource" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "metaJson" TEXT,
    CONSTRAINT "snapshot_prices_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "snapshot_prices_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "snapshot_summaries" (
    "snapshotId" TEXT NOT NULL PRIMARY KEY,
    "totalAssetsQuote" TEXT NOT NULL,
    "totalLiabilitiesQuote" TEXT NOT NULL,
    "netWorthQuote" TEXT NOT NULL,
    "pricedCoveragePct" REAL NOT NULL,
    "pricedAssetsCount" INTEGER NOT NULL DEFAULT 0,
    "totalAssetsCount" INTEGER NOT NULL DEFAULT 0,
    "pricedLiabilitiesCount" INTEGER NOT NULL DEFAULT 0,
    "totalLiabilitiesCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "snapshot_summaries_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_type_address_key" ON "wallets"("type", "address");

-- CreateIndex
CREATE UNIQUE INDEX "networks_chainKey_key" ON "networks"("chainKey");

-- CreateIndex
CREATE UNIQUE INDEX "snapshot_source_runs_snapshotId_sourceKey_key" ON "snapshot_source_runs"("snapshotId", "sourceKey");

-- CreateIndex
CREATE INDEX "positions_assets_snapshotId_idx" ON "positions_assets"("snapshotId");

-- CreateIndex
CREATE INDEX "positions_assets_snapshotId_walletId_idx" ON "positions_assets"("snapshotId", "walletId");

-- CreateIndex
CREATE INDEX "positions_assets_snapshotId_chainKey_idx" ON "positions_assets"("snapshotId", "chainKey");

-- CreateIndex
CREATE INDEX "positions_assets_snapshotId_protocol_idx" ON "positions_assets"("snapshotId", "protocol");

-- CreateIndex
CREATE INDEX "positions_assets_snapshotId_assetId_idx" ON "positions_assets"("snapshotId", "assetId");

-- CreateIndex
CREATE INDEX "positions_liabilities_snapshotId_idx" ON "positions_liabilities"("snapshotId");

-- CreateIndex
CREATE INDEX "positions_liabilities_snapshotId_walletId_idx" ON "positions_liabilities"("snapshotId", "walletId");

-- CreateIndex
CREATE INDEX "positions_liabilities_snapshotId_chainKey_idx" ON "positions_liabilities"("snapshotId", "chainKey");

-- CreateIndex
CREATE INDEX "positions_liabilities_snapshotId_protocol_idx" ON "positions_liabilities"("snapshotId", "protocol");

-- CreateIndex
CREATE INDEX "positions_liabilities_snapshotId_debtAssetId_idx" ON "positions_liabilities"("snapshotId", "debtAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "snapshot_prices_snapshotId_assetId_quoteCurrency_key" ON "snapshot_prices"("snapshotId", "assetId", "quoteCurrency");
