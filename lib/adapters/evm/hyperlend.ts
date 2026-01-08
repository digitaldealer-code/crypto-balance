import type { Prisma, PrismaClient } from '@prisma/client';
import { createPublicClient, formatUnits, http, getAddress } from 'viem';
import { defineChain } from 'viem';
import { env } from '@/lib/config/env';
import { HYPERLEND_CONFIG } from '@/lib/config/hyperlend';
import {
  AssetKind,
  LiabilityProtocol,
  PositionProtocol,
  SourceKey,
  WalletType
} from '@/lib/domain/constants';
import { getAssetOverride } from '@/lib/domain/asset-overrides';
import { canonicalErc20AssetId } from '@/lib/normalization/ids';

const toJson = (value: unknown): string => JSON.stringify(value);

const uiPoolDataProviderAbi = [
  {
    inputs: [{ internalType: 'address', name: 'provider', type: 'address' }],
    name: 'getReservesData',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'underlyingAsset', type: 'address' },
          { internalType: 'string', name: 'name', type: 'string' },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint256', name: 'decimals', type: 'uint256' },
          { internalType: 'uint256', name: 'priceInMarketReferenceCurrency', type: 'uint256' }
        ],
        internalType: 'struct IUiPoolDataProviderV3.ReserveData[]',
        name: 'reservesData',
        type: 'tuple[]'
      },
      {
        components: [
          { internalType: 'uint256', name: 'marketReferenceCurrencyUnit', type: 'uint256' },
          { internalType: 'uint256', name: 'marketReferenceCurrencyPriceInUsd', type: 'uint256' },
          { internalType: 'uint256', name: 'networkBaseTokenPriceInUsd', type: 'uint256' },
          { internalType: 'uint8', name: 'networkBaseTokenPriceDecimals', type: 'uint8' }
        ],
        internalType: 'struct IUiPoolDataProviderV3.BaseCurrencyInfo',
        name: 'baseCurrencyInfo',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'provider', type: 'address' },
      { internalType: 'address', name: 'user', type: 'address' }
    ],
    name: 'getUserReservesData',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'underlyingAsset', type: 'address' },
          { internalType: 'uint256', name: 'scaledATokenBalance', type: 'uint256' },
          { internalType: 'bool', name: 'usageAsCollateralEnabledOnUser', type: 'bool' },
          { internalType: 'uint256', name: 'stableBorrowRate', type: 'uint256' },
          { internalType: 'uint256', name: 'scaledVariableDebt', type: 'uint256' },
          { internalType: 'uint256', name: 'principalStableDebt', type: 'uint256' },
          { internalType: 'uint256', name: 'stableBorrowLastUpdateTimestamp', type: 'uint256' },
          { internalType: 'bool', name: 'usageAsCollateralEnabledOnUserScaled', type: 'bool' },
          { internalType: 'uint256', name: 'currentATokenBalance', type: 'uint256' },
          { internalType: 'uint256', name: 'currentStableDebt', type: 'uint256' },
          { internalType: 'uint256', name: 'currentVariableDebt', type: 'uint256' }
        ],
        internalType: 'struct IUiPoolDataProviderV3.UserReserveData[]',
        name: 'userReservesData',
        type: 'tuple[]'
      },
      { internalType: 'uint8', name: 'userEmodeCategoryId', type: 'uint8' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

const protocolDataProviderAbi = [
  {
    inputs: [
      { internalType: 'address', name: 'asset', type: 'address' },
      { internalType: 'address', name: 'user', type: 'address' }
    ],
    name: 'getUserReserveData',
    outputs: [
      { internalType: 'uint256', name: 'currentATokenBalance', type: 'uint256' },
      { internalType: 'uint256', name: 'currentStableDebt', type: 'uint256' },
      { internalType: 'uint256', name: 'currentVariableDebt', type: 'uint256' },
      { internalType: 'uint256', name: 'principalStableDebt', type: 'uint256' },
      { internalType: 'uint256', name: 'scaledVariableDebt', type: 'uint256' },
      { internalType: 'uint256', name: 'stableBorrowRate', type: 'uint256' },
      { internalType: 'uint256', name: 'liquidityRate', type: 'uint256' },
      { internalType: 'uint256', name: 'stableBorrowLastUpdateTimestamp', type: 'uint256' },
      { internalType: 'uint256', name: 'usageAsCollateralEnabled', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

type Tx = Prisma.TransactionClient | PrismaClient;

type SourceInput = {
  snapshotId: string;
  wallets: { id: string; address: string; type: string }[];
};

type SourceResult = {
  positionsAssetCount: number;
  positionsLiabilityCount: number;
  meta: Record<string, unknown>;
};

type ReserveMetadata = {
  underlyingAsset: string;
  symbol: string;
  name: string;
  decimals: number;
};

const buildClient = () => {
  return createPublicClient({
    chain: defineChain({
      id: env.hyperEvmChainId,
      name: 'HyperEVM',
      nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
      rpcUrls: { default: { http: [env.rpcHyperEvm] } }
    }),
    transport: http(env.rpcHyperEvm, {
      fetchOptions: {
        headers: {
          'User-Agent': 'CryptoFinancials/1.0'
        }
      }
    })
  });
};

export const runHyperlendPositions = async (
  tx: Tx,
  { snapshotId, wallets }: SourceInput
): Promise<SourceResult> => {
  const evmWallets = wallets.filter((wallet) => wallet.type === WalletType.EVM);
  if (evmWallets.length === 0) {
    return {
      positionsAssetCount: 0,
      positionsLiabilityCount: 0,
      meta: { walletCount: 0 }
    };
  }

  if (!env.rpcHyperEvm) {
    throw new Error('RPC_HYPEREVM is not configured');
  }
  if (!HYPERLEND_CONFIG) {
    throw new Error('HyperLend config is not set');
  }

  const client = buildClient();
  const blockNumber = await client.getBlockNumber();

  const reservesResponse = await client.readContract({
    address: getAddress(HYPERLEND_CONFIG.uiPoolDataProvider),
    abi: uiPoolDataProviderAbi,
    functionName: 'getReservesData',
    args: [getAddress(HYPERLEND_CONFIG.poolAddressesProvider)]
  });

  const reservesData = reservesResponse[0] as Array<{
    underlyingAsset: string;
    name: string;
    symbol: string;
    decimals: bigint;
  }>;

  const reserveMap = new Map<string, ReserveMetadata>();
  for (const reserve of reservesData) {
    const underlying = getAddress(reserve.underlyingAsset);
    const decimals = Number(reserve.decimals);
    const override = getAssetOverride({
      chainKey: HYPERLEND_CONFIG.chainKey,
      kind: AssetKind.ERC20,
      addressOrMint: underlying
    });

    reserveMap.set(underlying, {
      underlyingAsset: underlying,
      symbol: override?.symbol ?? reserve.symbol,
      name: override?.name ?? reserve.name,
      decimals
    });

    const assetId = canonicalErc20AssetId(env.hyperEvmChainId, underlying);
    await tx.asset.upsert({
      where: { id: assetId },
      update: {
        symbol: override?.symbol ?? reserve.symbol,
        name: override?.name ?? reserve.name,
        decimals,
        ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
      },
      create: {
        id: assetId,
        chainKey: HYPERLEND_CONFIG.chainKey,
        kind: AssetKind.ERC20,
        addressOrMint: underlying,
        symbol: override?.symbol ?? reserve.symbol,
        name: override?.name ?? reserve.name,
        decimals,
        ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
      }
    });
  }

  const positionsAssets: Prisma.PositionsAssetCreateManyInput[] = [];
  const positionsLiabilities: Prisma.PositionsLiabilityCreateManyInput[] = [];

  for (const wallet of evmWallets) {
    const userAddress = getAddress(wallet.address);
    for (const metadata of reserveMap.values()) {
      const [currentATokenBalance, currentStableDebt, currentVariableDebt, , , , , , usage] =
        (await client.readContract({
          address: getAddress(HYPERLEND_CONFIG.protocolDataProvider),
          abi: protocolDataProviderAbi,
          functionName: 'getUserReserveData',
          args: [metadata.underlyingAsset, userAddress]
        })) as [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint
        ];

      const usageAsCollateralEnabledOnUser = usage > 0n;
      const assetId = canonicalErc20AssetId(env.hyperEvmChainId, metadata.underlyingAsset);

      if (currentATokenBalance > 0n) {
        positionsAssets.push({
          snapshotId,
          walletId: wallet.id,
          chainKey: HYPERLEND_CONFIG.chainKey,
          protocol: PositionProtocol.HYPERLEND,
          sourceKey: SourceKey.hyperlend,
          assetId,
          quantityRaw: currentATokenBalance.toString(),
          quantityDecimal: formatUnits(currentATokenBalance, metadata.decimals),
          isCollateral: usageAsCollateralEnabledOnUser,
          priceQuote: null,
          valueQuote: null,
          metaJson: toJson({
            blockNumber: blockNumber.toString()
          })
        });
      }

      const totalDebt = currentStableDebt + currentVariableDebt;
      if (totalDebt > 0n) {
        positionsLiabilities.push({
          snapshotId,
          walletId: wallet.id,
          chainKey: HYPERLEND_CONFIG.chainKey,
          protocol: LiabilityProtocol.HYPERLEND,
          sourceKey: SourceKey.hyperlend,
          debtAssetId: assetId,
          amountRaw: totalDebt.toString(),
          amountDecimal: formatUnits(totalDebt, metadata.decimals),
          priceQuote: null,
          valueQuote: null,
          metaJson: toJson({
            blockNumber: blockNumber.toString()
          })
        });
      }
    }
  }

  if (positionsAssets.length > 0) {
    await tx.positionsAsset.createMany({ data: positionsAssets });
  }
  if (positionsLiabilities.length > 0) {
    await tx.positionsLiability.createMany({ data: positionsLiabilities });
  }

  return {
    positionsAssetCount: positionsAssets.length,
    positionsLiabilityCount: positionsLiabilities.length,
    meta: {
      walletCount: evmWallets.length,
      reserveCount: reserveMap.size
    }
  };
};
