import type { Prisma, PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { createSolanaRpc, address } from '@solana/kit';
import { KaminoMarket, DEFAULT_RECENT_SLOT_DURATION_MS } from '@kamino-finance/klend-sdk';
import { env } from '@/lib/config/env';
import {
  AssetKind,
  LiabilityProtocol,
  PositionProtocol,
  SourceKey,
  WalletType
} from '@/lib/domain/constants';
import { getAssetOverride } from '@/lib/domain/asset-overrides';
import { canonicalSplAssetId } from '@/lib/normalization/ids';

const SOLANA_CHAIN_KEY = 'solana:mainnet-beta';
const DEFAULT_KAMINO_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
const RATE_LIMIT_DELAY_MS = 300;
const MAX_RETRIES = 3;

const toJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));

type SourceInput = {
  snapshotId: string;
  wallets: { id: string; address: string; type: string }[];
};

type SourceResult = {
  positionsAssetCount: number;
  positionsLiabilityCount: number;
  meta: Record<string, unknown>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('429') || message.toLowerCase().includes('too many requests');
};

const withRetries = async <T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error)) {
        throw error;
      }
      await sleep(RATE_LIMIT_DELAY_MS * (attempt + 1));
    }
  }
  const message =
    lastError instanceof Error ? lastError.message : `${label} failed with rate limit`;
  throw new Error(message);
};

const parseMarkets = (raw: string) => {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === '__FILL__') {
    return { markets: [DEFAULT_KAMINO_MARKET], invalid: [] };
  }

  let list: string[] = [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      list = parsed.map(String);
    } else {
      list = [trimmed];
    }
  } catch {
    list = [trimmed];
  }

  const markets: string[] = [];
  const invalid: string[] = [];
  for (const entry of list) {
    const value = String(entry).trim();
    if (!value || value === '__FILL__') continue;
    try {
      address(value);
      markets.push(value);
    } catch {
      invalid.push(value);
    }
  }

  if (markets.length === 0) {
    return { markets: [DEFAULT_KAMINO_MARKET], invalid };
  }

  return { markets, invalid };
};

const toDecimalString = (amountLamports: Decimal, decimals: number) => {
  const scale = new Decimal(10).pow(decimals);
  return amountLamports.div(scale).toString();
};

export const runKaminoPositions = async (
  prisma: PrismaClient,
  { snapshotId, wallets }: SourceInput
): Promise<SourceResult> => {
  const solWallets = wallets.filter((wallet) => wallet.type === WalletType.SOLANA);
  if (solWallets.length === 0) {
    return {
      positionsAssetCount: 0,
      positionsLiabilityCount: 0,
      meta: { walletCount: 0, marketCount: 0 }
    };
  }

  if (!env.rpcSolana) {
    throw new Error('RPC_SOLANA is not configured');
  }

  const { markets: marketAddresses, invalid: invalidMarkets } = parseMarkets(
    env.kaminoMarketsJson
  );
  const rpc = createSolanaRpc(env.rpcSolana);
  const slot = await rpc.getSlot().send();
  const slotValue = typeof slot === 'bigint' ? slot.toString() : String(slot);
  const markets: KaminoMarket[] = [];
  const marketErrors: Array<{ market: string; error: string }> = [];
  let anySuccess = false;

  for (const marketAddress of marketAddresses) {
    try {
      const market = await withRetries(
        () =>
          KaminoMarket.load(
            rpc,
            address(marketAddress),
            DEFAULT_RECENT_SLOT_DURATION_MS,
            undefined,
            true
          ),
        `load market ${marketAddress}`
      );
      if (!market) {
        marketErrors.push({ market: marketAddress, error: 'Market not found' });
        continue;
      }
      await withRetries(
        () => market.loadReserves(),
        `load reserves ${marketAddress}`
      );
      markets.push(market);
      anySuccess = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Market load failed';
      marketErrors.push({ market: marketAddress, error: message });
    }
  }

  if (markets.length === 0) {
    const message =
      marketErrors.length > 0
        ? marketErrors.map((item) => `${item.market}: ${item.error}`).join('; ')
        : 'No Kamino markets available';
    throw new Error(message);
  }

  const positionsAssets: Prisma.PositionsAssetCreateManyInput[] = [];
  const positionsLiabilities: Prisma.PositionsLiabilityCreateManyInput[] = [];
  const assetUpserts: Prisma.AssetUpsertArgs[] = [];

  for (const wallet of solWallets) {
    const owner = address(wallet.address);
    for (const market of markets) {
      let obligations;
      try {
        obligations = await withRetries(
          () => market.getAllUserObligations(owner),
          `get obligations ${market.getAddress().toString()}`
        );
        anySuccess = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Obligations fetch failed';
        marketErrors.push({ market: market.getAddress().toString(), error: message });
        continue;
      }
      if (obligations.length === 0) continue;

      for (const obligation of obligations) {
        const obligationAddress = String(obligation.obligationAddress);

        for (const deposit of obligation.getDeposits()) {
          const reserve = market.getReserveByAddress(deposit.reserveAddress);
          if (!reserve) continue;

          const mint = String(reserve.getLiquidityMint());
          const decimals = reserve.getMintDecimals();
          const override = getAssetOverride({
            chainKey: SOLANA_CHAIN_KEY,
            kind: AssetKind.SPL,
            addressOrMint: mint
          });
          const symbol = override?.symbol ?? reserve.getTokenSymbol();
          const assetId = canonicalSplAssetId(mint);
          const amountRaw = deposit.amount.toFixed(0);

          assetUpserts.push({
            where: { id: assetId },
            update: {
              symbol,
              decimals,
              name: override?.name ?? symbol,
              ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
            },
            create: {
              id: assetId,
              chainKey: SOLANA_CHAIN_KEY,
              kind: AssetKind.SPL,
              addressOrMint: mint,
              symbol,
              name: override?.name ?? symbol,
              decimals,
              ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
            }
          });

          positionsAssets.push({
            snapshotId,
            walletId: wallet.id,
            chainKey: SOLANA_CHAIN_KEY,
            protocol: PositionProtocol.KAMINO,
            sourceKey: SourceKey.kamino,
            assetId,
            quantityRaw: amountRaw,
            quantityDecimal: toDecimalString(deposit.amount, decimals),
            isCollateral: null,
            priceQuote: null,
            valueQuote: null,
            metaJson: toJson({
              market: market.getAddress().toString(),
              obligation: obligationAddress,
              reserve: deposit.reserveAddress.toString(),
              slot: slotValue,
              marketValueUsd: deposit.marketValueRefreshed?.toString() ?? null
            })
          });
        }

        for (const borrow of obligation.getBorrows()) {
          const reserve = market.getReserveByAddress(borrow.reserveAddress);
          if (!reserve) continue;

          const mint = String(reserve.getLiquidityMint());
          const decimals = reserve.getMintDecimals();
          const override = getAssetOverride({
            chainKey: SOLANA_CHAIN_KEY,
            kind: AssetKind.SPL,
            addressOrMint: mint
          });
          const symbol = override?.symbol ?? reserve.getTokenSymbol();
          const assetId = canonicalSplAssetId(mint);
          const amountRaw = borrow.amount.toFixed(0);

          assetUpserts.push({
            where: { id: assetId },
            update: {
              symbol,
              decimals,
              name: override?.name ?? symbol,
              ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
            },
            create: {
              id: assetId,
              chainKey: SOLANA_CHAIN_KEY,
              kind: AssetKind.SPL,
              addressOrMint: mint,
              symbol,
              name: override?.name ?? symbol,
              decimals,
              ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
            }
          });

          positionsLiabilities.push({
            snapshotId,
            walletId: wallet.id,
            chainKey: SOLANA_CHAIN_KEY,
            protocol: LiabilityProtocol.KAMINO,
            sourceKey: SourceKey.kamino,
            debtAssetId: assetId,
            amountRaw: amountRaw,
            amountDecimal: toDecimalString(borrow.amount, decimals),
            priceQuote: null,
            valueQuote: null,
            metaJson: toJson({
              market: market.getAddress().toString(),
              obligation: obligationAddress,
              reserve: borrow.reserveAddress.toString(),
              slot: slotValue,
              marketValueUsd: borrow.marketValueRefreshed?.toString() ?? null
            })
          });
        }
      }
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const upsertArgs of assetUpserts) {
      await tx.asset.upsert(upsertArgs);
    }
    if (positionsAssets.length > 0) {
      await tx.positionsAsset.createMany({ data: positionsAssets });
    }
    if (positionsLiabilities.length > 0) {
      await tx.positionsLiability.createMany({ data: positionsLiabilities });
    }
  });

  if (!anySuccess && marketErrors.length > 0) {
    throw new Error(marketErrors.map((item) => `${item.market}: ${item.error}`).join('; '));
  }

  return {
    positionsAssetCount: positionsAssets.length,
    positionsLiabilityCount: positionsLiabilities.length,
    meta: {
      walletCount: solWallets.length,
      marketCount: markets.length,
      slot: slotValue,
      invalidMarkets,
      marketErrors
    }
  };
};
