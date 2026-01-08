import type { Prisma, Wallet } from '@prisma/client';
import { AssetKind, PositionProtocol, WalletType } from '@/lib/domain/constants';
import {
  canonicalEvmNativeAssetId,
  canonicalSolNativeAssetId
} from '@/lib/normalization/ids';

export type MockSourceResult = {
  positionsAssetCount: number;
  positionsLiabilityCount: number;
  meta: Record<string, unknown>;
};

type Tx = Prisma.TransactionClient;

type SourceInput = {
  snapshotId: string;
  wallets: Wallet[];
};

const MOCK_BLOCK_NUMBER = 0;
const MOCK_SLOT = 0;

export const runMockWalletEvmBalances = async (
  tx: Tx,
  { snapshotId, wallets }: SourceInput
): Promise<MockSourceResult> => {
  const evmWallets = wallets.filter((wallet) => wallet.type === WalletType.EVM);
  if (evmWallets.length === 0) {
    return {
      positionsAssetCount: 0,
      positionsLiabilityCount: 0,
    meta: { mocked: true, walletCount: 0, blockNumber: MOCK_BLOCK_NUMBER }
    };
  }

  const assetId = canonicalEvmNativeAssetId(1);
  await tx.asset.upsert({
    where: { id: assetId },
    update: {},
    create: {
      id: assetId,
      chainKey: 'evm:1',
      kind: AssetKind.NATIVE,
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18
    }
  });

  const positions = evmWallets.map((wallet) => ({
    snapshotId,
    walletId: wallet.id,
    chainKey: 'evm:1',
    protocol: PositionProtocol.WALLET,
    sourceKey: 'wallet_evm_balances',
    assetId,
    quantityRaw: '1000000000000000000',
    quantityDecimal: '1',
    isCollateral: null,
    priceQuote: null,
    valueQuote: null,
    metaJson: JSON.stringify({ mocked: true })
  }));

  await tx.positionsAsset.createMany({ data: positions });

  return {
    positionsAssetCount: positions.length,
    positionsLiabilityCount: 0,
    meta: {
      mocked: true,
      walletCount: evmWallets.length,
      blockNumber: MOCK_BLOCK_NUMBER
    }
  };
};

export const runMockWalletSolanaBalances = async (
  tx: Tx,
  { snapshotId, wallets }: SourceInput
): Promise<MockSourceResult> => {
  const solWallets = wallets.filter((wallet) => wallet.type === WalletType.SOLANA);
  if (solWallets.length === 0) {
    return {
      positionsAssetCount: 0,
      positionsLiabilityCount: 0,
    meta: { mocked: true, walletCount: 0, slot: MOCK_SLOT }
    };
  }

  const assetId = canonicalSolNativeAssetId();
  await tx.asset.upsert({
    where: { id: assetId },
    update: {},
    create: {
      id: assetId,
      chainKey: 'solana:mainnet-beta',
      kind: AssetKind.NATIVE,
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9
    }
  });

  const positions = solWallets.map((wallet) => ({
    snapshotId,
    walletId: wallet.id,
    chainKey: 'solana:mainnet-beta',
    protocol: PositionProtocol.WALLET,
    sourceKey: 'wallet_solana_balances',
    assetId,
    quantityRaw: '1000000000',
    quantityDecimal: '1',
    isCollateral: null,
    priceQuote: null,
    valueQuote: null,
    metaJson: JSON.stringify({ mocked: true })
  }));

  await tx.positionsAsset.createMany({ data: positions });

  return {
    positionsAssetCount: positions.length,
    positionsLiabilityCount: 0,
    meta: {
      mocked: true,
      walletCount: solWallets.length,
      slot: MOCK_SLOT
    }
  };
};

export const runMockAave = async (
  _tx: Tx,
  { wallets }: SourceInput
): Promise<MockSourceResult> => {
  return {
    positionsAssetCount: 0,
    positionsLiabilityCount: 0,
    meta: { mocked: true, walletCount: wallets.length }
  };
};

export const runMockKamino = async (
  _tx: Tx,
  { wallets }: SourceInput
): Promise<MockSourceResult> => {
  return {
    positionsAssetCount: 0,
    positionsLiabilityCount: 0,
    meta: { mocked: true, walletCount: wallets.length }
  };
};

export const runMockHyperlend = async (
  _tx: Tx,
  { wallets }: SourceInput
): Promise<MockSourceResult> => {
  return {
    positionsAssetCount: 0,
    positionsLiabilityCount: 0,
    meta: { mocked: true, walletCount: wallets.length }
  };
};
