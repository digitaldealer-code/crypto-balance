import type { Prisma, PrismaClient } from '@prisma/client';
import { Connection, PublicKey } from '@solana/web3.js';
import { env } from '@/lib/config/env';
import { AssetKind, PositionProtocol, SourceKey, WalletType } from '@/lib/domain/constants';
import { getAssetOverride } from '@/lib/domain/asset-overrides';
import {
  canonicalSolNativeAssetId,
  canonicalSplAssetId
} from '@/lib/normalization/ids';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey(
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
);

const SOLANA_CHAIN_KEY = 'solana:mainnet-beta';
const SOL_DECIMALS = 9;

const toJson = (value: unknown): string => JSON.stringify(value);

type Tx = Prisma.TransactionClient;

type SourceInput = {
  snapshotId: string;
  wallets: { id: string; address: string; type: string }[];
};

type SourceResult = {
  positionsAssetCount: number;
  positionsLiabilityCount: number;
  meta: Record<string, unknown>;
};

export const runSolanaWalletBalances = async (
  prisma: PrismaClient,
  { snapshotId, wallets }: SourceInput
): Promise<SourceResult> => {
  const solWallets = wallets.filter((wallet) => wallet.type === WalletType.SOLANA);
  if (solWallets.length === 0) {
    return {
      positionsAssetCount: 0,
      positionsLiabilityCount: 0,
      meta: { walletCount: 0, slot: null }
    };
  }

  if (!env.rpcSolana) {
    throw new Error('RPC_SOLANA is not configured');
  }

  const connection = new Connection(env.rpcSolana, 'confirmed');
  const slot = await connection.getSlot('confirmed');

  const positions: Prisma.PositionsAssetCreateManyInput[] = [];
  const assetUpserts: Prisma.AssetUpsertArgs[] = [];

  const solAssetId = canonicalSolNativeAssetId();
  const solOverride = getAssetOverride({
    chainKey: SOLANA_CHAIN_KEY,
    kind: AssetKind.NATIVE
  });
  assetUpserts.push({
    where: { id: solAssetId },
    update: {
      symbol: solOverride?.symbol ?? 'SOL',
      name: solOverride?.name ?? 'Solana',
      decimals: SOL_DECIMALS,
      coingeckoId: solOverride?.coingeckoId ?? 'solana'
    },
    create: {
      id: solAssetId,
      chainKey: SOLANA_CHAIN_KEY,
      kind: AssetKind.NATIVE,
      symbol: solOverride?.symbol ?? 'SOL',
      name: solOverride?.name ?? 'Solana',
      decimals: SOL_DECIMALS,
      coingeckoId: solOverride?.coingeckoId ?? 'solana'
    }
  });

  for (const wallet of solWallets) {
    const owner = new PublicKey(wallet.address);
    const lamports = await connection.getBalance(owner, 'confirmed');
    if (lamports > 0) {
      positions.push({
        snapshotId,
        walletId: wallet.id,
        chainKey: SOLANA_CHAIN_KEY,
        protocol: PositionProtocol.WALLET,
        sourceKey: SourceKey.wallet_solana_balances,
        assetId: solAssetId,
        quantityRaw: lamports.toString(),
        quantityDecimal: (lamports / 10 ** SOL_DECIMALS).toString(),
        isCollateral: null,
        priceQuote: null,
        valueQuote: null,
        metaJson: toJson({ slot })
      });
    }

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID
    });
    const token2022Accounts = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_2022_PROGRAM_ID
    });

    const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];

    for (const account of allAccounts) {
      const parsed = account.account.data.parsed;
      if (!parsed || parsed.type !== 'account') continue;
      const info = parsed.info;
      const mint = String(info.mint);
      const tokenAmount = info.tokenAmount;
      const amountRaw = String(tokenAmount.amount ?? '0');
      const decimals = Number(tokenAmount.decimals ?? 0);
      const amountDecimal = String(tokenAmount.uiAmountString ?? '0');
      if (amountRaw === '0') continue;

      const assetId = canonicalSplAssetId(mint);
      const override = getAssetOverride({
        chainKey: SOLANA_CHAIN_KEY,
        kind: AssetKind.SPL,
        addressOrMint: mint
      });
      assetUpserts.push({
        where: { id: assetId },
        update: {
          decimals,
          ...(override?.symbol ? { symbol: override.symbol } : {}),
          ...(override?.name ? { name: override.name } : {}),
          ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
        },
        create: {
          id: assetId,
          chainKey: SOLANA_CHAIN_KEY,
          kind: AssetKind.SPL,
          addressOrMint: mint,
          symbol: override?.symbol ?? null,
          name: override?.name ?? null,
          decimals,
          ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
        }
      });

      positions.push({
        snapshotId,
        walletId: wallet.id,
        chainKey: SOLANA_CHAIN_KEY,
        protocol: PositionProtocol.WALLET,
        sourceKey: SourceKey.wallet_solana_balances,
        assetId,
        quantityRaw: amountRaw,
        quantityDecimal: amountDecimal,
        isCollateral: null,
        priceQuote: null,
        valueQuote: null,
        metaJson: toJson({ slot })
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const upsertArgs of assetUpserts) {
      await tx.asset.upsert(upsertArgs);
    }
    if (positions.length > 0) {
      await tx.positionsAsset.createMany({ data: positions });
    }
  });

  return {
    positionsAssetCount: positions.length,
    positionsLiabilityCount: 0,
    meta: {
      walletCount: solWallets.length,
      slot
    }
  };
};
