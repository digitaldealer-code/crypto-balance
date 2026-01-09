import type { Wallet } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { env } from '@/lib/config/env';
import {
  SnapshotStatus,
  SourceKey,
  SourceRunStatus,
  SOURCE_KEYS
} from '@/lib/domain/constants';
import { fetchCoingeckoPrices, fetchCoingeckoTokenPrices } from '@/lib/adapters/prices/coingecko';
import { formatDecimal, parseDecimal } from '@/lib/normalization/decimal';
import { AssetKind, LiabilityProtocol, PositionProtocol } from '@/lib/domain/constants';
import { CANONICAL_COINGECKO_IDS, getAssetOverride } from '@/lib/domain/asset-overrides';
import {
  runMockAave,
  runMockHyperlend,
  runMockKamino,
  runMockWalletEvmBalances,
  runMockWalletSolanaBalances
} from '@/lib/refresh/sources/mock';
import { runEvmWalletBalances } from '@/lib/adapters/evm/balances';
import { runSolanaWalletBalances } from '@/lib/adapters/solana/balances';
import { fetchAaveV3UsdPrices, runAaveV3Positions } from '@/lib/adapters/evm/aaveV3';
import { runKaminoPositions } from '@/lib/adapters/solana/kamino';
import { runHyperlendPositions } from '@/lib/adapters/evm/hyperlend';

export const ALL_SOURCES: SourceKey[] = [...SOURCE_KEYS];

const DEFAULT_CONCURRENCY = 1;
const PRICE_CACHE_MS = 30 * 60 * 1000;

const toJson = (value: unknown): string => JSON.stringify(value);

export type RefreshStartOptions = {
  quoteCurrency: string;
  enabledSources?: SourceKey[];
};

type MockRunner = typeof runMockWalletEvmBalances;
type RealRunner =
  | typeof runEvmWalletBalances
  | typeof runAaveV3Positions
  | typeof runKaminoPositions
  | typeof runHyperlendPositions;

const mockRunners: Record<Exclude<SourceKey, 'prices'>, MockRunner> = {
  [SourceKey.wallet_evm_balances]: runMockWalletEvmBalances,
  [SourceKey.wallet_solana_balances]: runMockWalletSolanaBalances,
  [SourceKey.aave_v3]: runMockAave,
  [SourceKey.kamino]: runMockKamino,
  [SourceKey.hyperlend]: runMockHyperlend
};

export const createSnapshot = async (options: RefreshStartOptions) => {
  const snapshot = await prisma.snapshot.create({
    data: {
      quoteCurrency: options.quoteCurrency,
      status: SnapshotStatus.RUNNING,
      startedAt: new Date()
    }
  });

  await prisma.snapshotSourceRun.createMany({
    data: ALL_SOURCES.map((sourceKey) => ({
      snapshotId: snapshot.id,
      sourceKey,
      status: SourceRunStatus.PENDING
    }))
  });

  return snapshot;
};

export const runSnapshot = async (snapshotId: string, options: RefreshStartOptions) => {
  const enabledSources = options.enabledSources ?? ALL_SOURCES;
  const enabledSet = new Set(enabledSources);
  const wallets = await prisma.wallet.findMany({
    where: { isArchived: false }
  });

  await markDisabledSources(snapshotId, enabledSet);

  const runnableSources = ALL_SOURCES.filter(
    (sourceKey) => sourceKey !== SourceKey.prices && enabledSet.has(sourceKey)
  ) as Exclude<SourceKey, SourceKey.prices>[];

  await runWithLimit(
    runnableSources.map((sourceKey) => async () => {
      await runSource(snapshotId, sourceKey, wallets);
    }),
    DEFAULT_CONCURRENCY
  );

  if (enabledSet.has(SourceKey.prices)) {
    await runPrices(snapshotId, options.quoteCurrency);
  }

  await computeSummary(snapshotId, options.quoteCurrency);
  await finalizeSnapshot(snapshotId, enabledSet);
};

const markDisabledSources = async (snapshotId: string, enabledSet: Set<SourceKey>) => {
  const disabled = ALL_SOURCES.filter((sourceKey) => !enabledSet.has(sourceKey));
  if (disabled.length === 0) return;

  await prisma.snapshotSourceRun.updateMany({
    where: {
      snapshotId,
      sourceKey: { in: disabled }
    },
    data: {
      status: SourceRunStatus.SUCCESS,
      startedAt: new Date(),
      finishedAt: new Date(),
      metaJson: toJson({ skipped: true })
    }
  });
};

const runSource = async (
  snapshotId: string,
  sourceKey: Exclude<SourceKey, SourceKey.prices>,
  wallets: Wallet[]
) => {
  await prisma.snapshotSourceRun.update({
    where: { snapshotId_sourceKey: { snapshotId, sourceKey } },
    data: { status: SourceRunStatus.RUNNING, startedAt: new Date() }
  });

  try {
    if (sourceKey === SourceKey.wallet_solana_balances && !env.useMockSources) {
      const result = await runSolanaWalletBalances(prisma, { snapshotId, wallets });
      await prisma.snapshotSourceRun.update({
        where: { snapshotId_sourceKey: { snapshotId, sourceKey } },
        data: {
          status: SourceRunStatus.SUCCESS,
          finishedAt: new Date(),
          metaJson: toJson({
            ...(result.meta ?? {}),
            positionsAssetCount: result.positionsAssetCount,
            positionsLiabilityCount: result.positionsLiabilityCount
          })
        }
      });
      return;
    }

    const runner =
      sourceKey === SourceKey.wallet_evm_balances && !env.useMockSources
        ? runEvmWalletBalances
        : sourceKey === SourceKey.aave_v3 && !env.useMockSources
          ? runAaveV3Positions
          : sourceKey === SourceKey.kamino && !env.useMockSources
            ? runKaminoPositions
            : sourceKey === SourceKey.hyperlend && !env.useMockSources
              ? runHyperlendPositions
            : mockRunners[sourceKey];

    const useTransaction = env.useMockSources || runner === mockRunners[sourceKey];
    const result = useTransaction
      ? await prisma.$transaction(async (tx) => {
          return (runner as MockRunner)(tx, { snapshotId, wallets });
        })
      : await (runner as RealRunner)(prisma, {
          snapshotId,
          wallets
        });

    await prisma.snapshotSourceRun.update({
      where: { snapshotId_sourceKey: { snapshotId, sourceKey } },
      data: {
        status: SourceRunStatus.SUCCESS,
        finishedAt: new Date(),
        metaJson: toJson({
          ...(result.meta ?? {}),
          positionsAssetCount: result.positionsAssetCount,
          positionsLiabilityCount: result.positionsLiabilityCount
        })
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await prisma.snapshotSourceRun.update({
      where: { snapshotId_sourceKey: { snapshotId, sourceKey } },
      data: {
        status: SourceRunStatus.FAILED,
        finishedAt: new Date(),
        errorCode: 'ERR_SOURCE_RUN',
        errorMessage: message,
        metaJson: toJson({ mocked: env.useMockSources })
      }
    });
  }
};

const runPrices = async (snapshotId: string, quoteCurrency: string) => {
  const sourceKey = SourceKey.prices;
  await prisma.snapshotSourceRun.update({
    where: { snapshotId_sourceKey: { snapshotId, sourceKey } },
    data: { status: SourceRunStatus.RUNNING, startedAt: new Date() }
  });

  try {
  const positionsAssets = await prisma.positionsAsset.findMany({
    where: { snapshotId }
  });
  const positionsLiabilities = await prisma.positionsLiability.findMany({
    where: { snapshotId }
  });

  const assetIds = new Set<string>();
  positionsAssets.forEach((position) => assetIds.add(position.assetId));
  positionsLiabilities.forEach((position) => assetIds.add(position.debtAssetId));

  const assets = await prisma.asset.findMany({
    where: { id: { in: Array.from(assetIds) } }
  });

  const prices: Array<{
    assetId: string;
    price: string;
    quoteCurrency: string;
    source: string;
  }> = [];
  const priceErrors: string[] = [];

  const canonicalAssetIds = new Set<string>();
  if (!env.useMockSources && quoteCurrency === 'USD') {
    const aaveAssetIds = new Set<string>();
    positionsAssets
      .filter((position) => position.protocol === PositionProtocol.AAVE_V3)
      .forEach((position) => aaveAssetIds.add(position.assetId));
    positionsLiabilities
      .filter((position) => position.protocol === LiabilityProtocol.AAVE_V3)
      .forEach((position) => aaveAssetIds.add(position.debtAssetId));

    const aaveAssets = assets
      .filter(
        (asset) =>
          aaveAssetIds.has(asset.id) &&
          asset.kind === AssetKind.ERC20 &&
          asset.addressOrMint &&
          (asset.chainKey === 'evm:1' || asset.chainKey === 'evm:8453')
      )
      .map((asset) => ({
        assetId: asset.id,
        chainKey: asset.chainKey,
        address: asset.addressOrMint as string
      }));

    if (aaveAssets.length > 0) {
      const aaveResult = await fetchAaveV3UsdPrices(aaveAssets);
      for (const [assetId, price] of aaveResult.prices) {
        const asset = assets.find((item) => item.id === assetId);
        if (asset?.coingeckoId && CANONICAL_COINGECKO_IDS.has(asset.coingeckoId)) {
          canonicalAssetIds.add(assetId);
          continue;
        }
        prices.push({
          assetId,
          price,
          quoteCurrency,
          source: 'aave-oracle'
        });
      }
      priceErrors.push(...aaveResult.errors);
    }
  } else if (!env.useMockSources && quoteCurrency !== 'USD') {
    priceErrors.push('Aave oracle pricing only supports USD');
  }

  const refreshedAssets = await prisma.asset.findMany({
    where: { id: { in: Array.from(assetIds) } }
  });

  const pricedAssetIds = new Set(prices.map((item) => item.assetId));

  if (!env.useMockSources) {
    for (const asset of refreshedAssets) {
      const override = getAssetOverride({
        chainKey: asset.chainKey,
        kind: asset.kind,
        addressOrMint: asset.addressOrMint
      });
      if (!override) continue;
      const needsUpdate =
        asset.symbol !== override.symbol ||
        asset.name !== override.name ||
        asset.coingeckoId !== override.coingeckoId;
      if (!needsUpdate) continue;
      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          symbol: override.symbol,
          name: override.name,
          coingeckoId: override.coingeckoId
        }
      });
      asset.symbol = override.symbol;
      asset.name = override.name;
      asset.coingeckoId = override.coingeckoId;
    }
  }

  const cacheCutoff = new Date(Date.now() - PRICE_CACHE_MS);
  const cachedPrices = await prisma.snapshotPrice.findMany({
    where: {
      assetId: { in: Array.from(assetIds) },
      quoteCurrency,
      fetchedAt: { gte: cacheCutoff }
    },
    orderBy: { fetchedAt: 'desc' }
  });
  for (const cached of cachedPrices) {
    if (pricedAssetIds.has(cached.assetId)) continue;
    pricedAssetIds.add(cached.assetId);
    prices.push({
      assetId: cached.assetId,
      price: cached.price,
      quoteCurrency: cached.quoteCurrency,
      source: cached.priceSource || 'cache'
    });
  }

  const priceRequests = refreshedAssets
    .filter((asset) => asset.coingeckoId && !pricedAssetIds.has(asset.id))
    .map((asset) => ({ assetId: asset.id, coingeckoId: asset.coingeckoId as string }));

  const now = new Date();

  if (env.useMockSources) {
    prices.push(
      ...priceRequests.map((request) => ({
        assetId: request.assetId,
        price: '1',
        quoteCurrency,
        source: 'mock'
      }))
    );
  } else {
    try {
      const coingeckoPrices = await fetchCoingeckoPrices(priceRequests, quoteCurrency);
      prices.push(...coingeckoPrices);
      for (const item of coingeckoPrices) {
        pricedAssetIds.add(item.assetId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CoinGecko price fetch failed';
      priceErrors.push(message);
    }
  }

  if (!env.useMockSources && quoteCurrency === 'USD') {
    const stablecoinIds = new Map<string, string>([
      ['USDC', 'usd-coin'],
      ['USDT', 'tether'],
      ['USDHL', 'usd-coin'],
      ['USD0', 'usd-coin'],
      ['USDBC', 'usd-coin'],
      ['USDC.E', 'usd-coin'],
      ['USDT.E', 'tether'],
      ['DAI', 'dai']
    ]);

    for (const asset of refreshedAssets) {
      if (pricedAssetIds.has(asset.id)) continue;
      const symbol = asset.symbol?.toUpperCase();
      if (!symbol) continue;
      const normalizedSymbol = symbol.replace(/[^A-Z0-9.]/g, '');
      const coingeckoId = stablecoinIds.get(symbol) ?? stablecoinIds.get(normalizedSymbol);
      if (!coingeckoId) continue;
      prices.push({
        assetId: asset.id,
        price: '1',
        quoteCurrency,
        source: 'stablecoin-fallback'
      });
      pricedAssetIds.add(asset.id);
      if (!asset.coingeckoId) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: { coingeckoId }
        });
      }
    }
  }

  if (!env.useMockSources) {
    const missingSpl = refreshedAssets.filter(
      (asset) =>
        asset.kind === AssetKind.SPL &&
        asset.addressOrMint &&
        !asset.coingeckoId &&
        !pricedAssetIds.has(asset.id)
    );

    if (missingSpl.length > 0) {
      try {
        const contractPrices = await fetchCoingeckoTokenPrices(
          'solana',
          missingSpl.map((asset) => asset.addressOrMint as string),
          quoteCurrency
        );
        if (contractPrices.size > 0) {
          for (const asset of missingSpl) {
            const price = contractPrices.get(asset.addressOrMint?.toLowerCase() ?? '');
            if (!price) continue;
            prices.push({
              assetId: asset.id,
              price,
              quoteCurrency,
              source: 'coingecko-contract'
            });
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'CoinGecko token price failed';
        priceErrors.push(message);
      }
    }
  }

  const priceMap = new Map(prices.map((price) => [price.assetId, price.price]));

  if (prices.length > 0) {
    const existing = await prisma.snapshotPrice.findMany({
      where: {
        snapshotId,
        quoteCurrency,
        assetId: { in: prices.map((item) => item.assetId) }
      },
      select: { assetId: true }
    });
    const existingIds = new Set(existing.map((item) => item.assetId));
    const inserts = prices.filter((item) => !existingIds.has(item.assetId));

    if (inserts.length > 0) {
      await prisma.snapshotPrice.createMany({
        data: inserts.map((item) => ({
          snapshotId,
          assetId: item.assetId,
          quoteCurrency,
          price: item.price,
          priceSource: item.source,
          fetchedAt: now,
          metaJson: toJson({ provider: item.source })
        }))
      });
    }
  }

  for (const position of positionsAssets) {
    const price = priceMap.get(position.assetId);
    if (!price) continue;
    await prisma.positionsAsset.update({
      where: { id: position.id },
      data: {
        priceQuote: price,
        valueQuote: formatDecimal(parseDecimal(position.quantityDecimal) * Number(price))
      }
    });
  }

  for (const position of positionsLiabilities) {
    const price = priceMap.get(position.debtAssetId);
    if (!price) continue;
    await prisma.positionsLiability.update({
      where: { id: position.id },
      data: {
        priceQuote: price,
        valueQuote: formatDecimal(parseDecimal(position.amountDecimal) * Number(price))
      }
    });
  }

  await prisma.snapshotSourceRun.update({
    where: { snapshotId_sourceKey: { snapshotId, sourceKey } },
    data: {
      status: prices.length === 0 ? SourceRunStatus.FAILED : SourceRunStatus.SUCCESS,
      finishedAt: new Date(),
      errorMessage: prices.length === 0 ? priceErrors.join('; ') || 'No prices fetched' : null,
      metaJson: toJson({
        mocked: env.useMockSources,
        assetCount: assetIds.size,
        pricedCount: prices.length,
        quoteCurrency,
        warnings: priceErrors
      })
    }
  });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await prisma.snapshotSourceRun.update({
      where: { snapshotId_sourceKey: { snapshotId, sourceKey } },
      data: {
        status: SourceRunStatus.FAILED,
        finishedAt: new Date(),
        errorCode: 'ERR_PRICES',
        errorMessage: message,
        metaJson: toJson({ mocked: env.useMockSources })
      }
    });
  }
};

const computeSummary = async (snapshotId: string, quoteCurrency: string) => {
  const assets = await prisma.positionsAsset.findMany({
    where: { snapshotId }
  });
  const liabilities = await prisma.positionsLiability.findMany({
    where: { snapshotId }
  });

  const totalAssets = assets.reduce((sum, item) => sum + parseDecimal(item.valueQuote), 0);
  const totalLiabilities = liabilities.reduce(
    (sum, item) => sum + parseDecimal(item.valueQuote),
    0
  );

  const pricedAssetsCount = assets.filter((item) => item.priceQuote).length;
  const pricedLiabilitiesCount = liabilities.filter((item) => item.priceQuote).length;
  const totalAssetsCount = assets.length;
  const totalLiabilitiesCount = liabilities.length;
  const totalPositionsCount = totalAssetsCount + totalLiabilitiesCount;
  const pricedPositionsCount = pricedAssetsCount + pricedLiabilitiesCount;

  const pricedCoveragePct =
    totalPositionsCount === 0
      ? 0
      : (pricedPositionsCount / totalPositionsCount) * 100;

  await prisma.snapshotSummary.upsert({
    where: { snapshotId },
    update: {
      totalAssetsQuote: formatDecimal(totalAssets),
      totalLiabilitiesQuote: formatDecimal(totalLiabilities),
      netWorthQuote: formatDecimal(totalAssets - totalLiabilities),
      pricedCoveragePct,
      pricedAssetsCount,
      totalAssetsCount,
      pricedLiabilitiesCount,
      totalLiabilitiesCount
    },
    create: {
      snapshotId,
      totalAssetsQuote: formatDecimal(totalAssets),
      totalLiabilitiesQuote: formatDecimal(totalLiabilities),
      netWorthQuote: formatDecimal(totalAssets - totalLiabilities),
      pricedCoveragePct,
      pricedAssetsCount,
      totalAssetsCount,
      pricedLiabilitiesCount,
      totalLiabilitiesCount
    }
  });

  await prisma.snapshot.update({
    where: { id: snapshotId },
    data: { quoteCurrency }
  });
};

const finalizeSnapshot = async (snapshotId: string, enabledSet: Set<SourceKey>) => {
  const sourceRuns = await prisma.snapshotSourceRun.findMany({
    where: { snapshotId }
  });

  const enabledRuns = sourceRuns.filter((run) => enabledSet.has(run.sourceKey));
  const anySuccess = enabledRuns.some((run) => run.status === SourceRunStatus.SUCCESS);
  const allSuccess = enabledRuns.every((run) => run.status === SourceRunStatus.SUCCESS);
  const anyFailed = enabledRuns.some((run) => run.status === SourceRunStatus.FAILED);

  const positionsCount = await prisma.positionsAsset.count({
    where: { snapshotId }
  });
  const liabilitiesCount = await prisma.positionsLiability.count({
    where: { snapshotId }
  });
  const totalPositions = positionsCount + liabilitiesCount;

  const summary = await prisma.snapshotSummary.findUnique({
    where: { snapshotId }
  });

  let status: SnapshotStatus;

  if (!anySuccess || totalPositions === 0) {
    status = SnapshotStatus.FAILED;
  } else if (allSuccess && !anyFailed && (summary?.pricedCoveragePct ?? 0) >= 100) {
    status = SnapshotStatus.SUCCESS;
  } else {
    status = SnapshotStatus.PARTIAL;
  }

  await prisma.snapshot.update({
    where: { id: snapshotId },
    data: {
      status,
      finishedAt: new Date()
    }
  });
};

const runWithLimit = async (tasks: Array<() => Promise<void>>, limit: number) => {
  let index = 0;
  const workers = Array.from({ length: limit }).map(async () => {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      await tasks[current]();
    }
  });

  await Promise.all(workers);
};
