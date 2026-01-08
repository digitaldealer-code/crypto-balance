import type { Prisma, PrismaClient } from '@prisma/client';
import { createPublicClient, formatUnits, http, erc20Abi } from 'viem';
import { getAddress } from 'viem';
import type { Chain } from 'viem';
import { AAVE_V3_MARKETS } from '@/lib/config/aave';
import { EVM_NETWORKS } from '@/lib/config/networks';
import { AssetKind, LiabilityProtocol, PositionProtocol, SourceKey, WalletType } from '@/lib/domain/constants';
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
    inputs: [],
    name: 'getAllReservesTokens',
    outputs: [
      {
        components: [
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'address', name: 'tokenAddress', type: 'address' }
        ],
        internalType: 'struct DataTypes.TokenData[]',
        name: '',
        type: 'tuple[]'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
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
      { internalType: 'uint40', name: 'stableRateLastUpdated', type: 'uint40' },
      { internalType: 'bool', name: 'usageAsCollateralEnabled', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
    name: 'getReserveTokensAddresses',
    outputs: [
      { internalType: 'address', name: 'aTokenAddress', type: 'address' },
      { internalType: 'address', name: 'stableDebtTokenAddress', type: 'address' },
      { internalType: 'address', name: 'variableDebtTokenAddress', type: 'address' }
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
  aTokenAddress?: string | null;
  stableDebtTokenAddress?: string | null;
  variableDebtTokenAddress?: string | null;
};

export type AaveOraclePriceInput = {
  assetId: string;
  chainKey: string;
  address: string;
};

export type AaveOraclePriceResult = {
  prices: Map<string, string>;
  errors: string[];
};

const buildClient = (chain: Chain, rpcUrl: string) => {
  return createPublicClient({
    chain,
    transport: http(rpcUrl, {
      fetchOptions: {
        headers: {
          'User-Agent': 'CryptoFinancials/1.0'
        }
      }
    })
  });
};

export const fetchAaveV3UsdPrices = async (
  assets: AaveOraclePriceInput[]
): Promise<AaveOraclePriceResult> => {
  const prices = new Map<string, string>();
  const errors: string[] = [];
  const assetsByChain = new Map<string, AaveOraclePriceInput[]>();

  for (const asset of assets) {
    const bucket = assetsByChain.get(asset.chainKey);
    if (bucket) {
      bucket.push(asset);
    } else {
      assetsByChain.set(asset.chainKey, [asset]);
    }
  }

  for (const market of AAVE_V3_MARKETS) {
    const marketAssets = assetsByChain.get(market.chainKey);
    if (!marketAssets || marketAssets.length === 0) continue;
    if (!market.uiPoolDataProvider) continue;

    const network = EVM_NETWORKS.find((item) => item.chainKey === market.chainKey);
    if (!network) continue;

    const client = buildClient(network.viemChain, network.rpcUrl);
    try {
      const reservesResponse = await client.readContract({
        address: getAddress(market.uiPoolDataProvider),
        abi: uiPoolDataProviderAbi,
        functionName: 'getReservesData',
        args: [getAddress(market.poolAddressesProvider)]
      });

      const reservesData = reservesResponse[0] as Array<{
        underlyingAsset: string;
        priceInMarketReferenceCurrency: bigint;
      }>;
      const baseCurrencyInfo = reservesResponse[1] as {
        marketReferenceCurrencyUnit: bigint;
        marketReferenceCurrencyPriceInUsd: bigint;
        networkBaseTokenPriceDecimals: number;
      };

      const referenceUnit = baseCurrencyInfo.marketReferenceCurrencyUnit;
      const referencePriceInUsd = baseCurrencyInfo.marketReferenceCurrencyPriceInUsd;
      const usdDecimals = Number(baseCurrencyInfo.networkBaseTokenPriceDecimals ?? 8);

      const reservePriceMap = new Map<string, string>();
      for (const reserve of reservesData) {
        if (!reserve.priceInMarketReferenceCurrency || referenceUnit === 0n) continue;
        const priceInUsdRaw =
          (reserve.priceInMarketReferenceCurrency * referencePriceInUsd) / referenceUnit;
        const priceInUsd = formatUnits(priceInUsdRaw, usdDecimals);
        reservePriceMap.set(reserve.underlyingAsset.toLowerCase(), priceInUsd);
      }

      for (const asset of marketAssets) {
        const price = reservePriceMap.get(asset.address.toLowerCase());
        if (!price) continue;
        prices.set(asset.assetId, price);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Aave price fetch failed';
      errors.push(`${market.chainKey}: ${message}`);
    }
  }

  return { prices, errors };
};

const enrichReserveTokenAddresses = async (
  client: ReturnType<typeof buildClient>,
  protocolProviderAddress: string | null | undefined,
  reserveMap: Map<string, ReserveMetadata>
) => {
  if (!protocolProviderAddress || reserveMap.size === 0) return;
  const underlyingAssets = Array.from(reserveMap.keys());

  const results = await client.multicall({
    contracts: underlyingAssets.map((underlying) => ({
      address: getAddress(protocolProviderAddress),
      abi: protocolDataProviderAbi,
      functionName: 'getReserveTokensAddresses',
      args: [underlying]
    })),
    allowFailure: true
  });

  results.forEach((result, index) => {
    if (!result.result) return;
    const metadata = reserveMap.get(underlyingAssets[index]);
    if (!metadata) return;
    const [aTokenAddress, stableDebtTokenAddress, variableDebtTokenAddress] =
      result.result as readonly [string, string, string];
    metadata.aTokenAddress = getAddress(aTokenAddress);
    metadata.stableDebtTokenAddress = getAddress(stableDebtTokenAddress);
    metadata.variableDebtTokenAddress = getAddress(variableDebtTokenAddress);
  });
};

export const runAaveV3Positions = async (
  tx: Tx,
  { snapshotId, wallets }: SourceInput
): Promise<SourceResult> => {
  const evmWallets = wallets.filter((wallet) => wallet.type === WalletType.EVM);
  if (evmWallets.length === 0) {
    return {
      positionsAssetCount: 0,
      positionsLiabilityCount: 0,
      meta: { walletCount: 0, marketCount: 0 }
    };
  }

  const positionsAssets: Prisma.PositionsAssetCreateManyInput[] = [];
  const positionsLiabilities: Prisma.PositionsLiabilityCreateManyInput[] = [];
  const meta: Array<Record<string, unknown>> = [];
  let marketsSucceeded = 0;

  for (const market of AAVE_V3_MARKETS) {
    const network = EVM_NETWORKS.find((item) => item.chainKey === market.chainKey);
    if (!network) continue;
    const client = buildClient(network.viemChain, network.rpcUrl);
    const blockNumber = await client.getBlockNumber();

    const reserveMap = new Map<string, ReserveMetadata>();
    let reserveCount = 0;
    let marketError: string | null = null;

    const tryUiProvider = async () => {
      if (!market.uiPoolDataProvider) return false;
      const reservesResponse = await client.readContract({
        address: getAddress(market.uiPoolDataProvider),
        abi: uiPoolDataProviderAbi,
        functionName: 'getReservesData',
        args: [getAddress(market.poolAddressesProvider)]
      });

      const reservesData = reservesResponse[0] as Array<{
        underlyingAsset: string;
        name: string;
        symbol: string;
        decimals: bigint;
      }>;

      for (const reserve of reservesData) {
        const underlying = getAddress(reserve.underlyingAsset);
        const decimals = Number(reserve.decimals);
        reserveMap.set(underlying, {
          underlyingAsset: underlying,
          symbol: reserve.symbol,
          name: reserve.name,
          decimals
        });

        const assetId = canonicalErc20AssetId(network.chainId, underlying);
        const override = getAssetOverride({
          chainKey: network.chainKey,
          kind: AssetKind.ERC20,
          addressOrMint: underlying
        });
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
            chainKey: network.chainKey,
            kind: AssetKind.ERC20,
            addressOrMint: underlying,
            symbol: override?.symbol ?? reserve.symbol,
            name: override?.name ?? reserve.name,
            decimals,
            ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
          }
        });
      }

      reserveCount = reservesData.length;
      await enrichReserveTokenAddresses(client, protocolProviderAddress, reserveMap);
      return true;
    };

    const protocolProviderAddress = market.protocolDataProvider;

    const tryProtocolProvider = async () => {
      if (!protocolProviderAddress) return false;
      const reservesData = await client.readContract({
        address: getAddress(protocolProviderAddress),
        abi: protocolDataProviderAbi,
        functionName: 'getAllReservesTokens'
      });

      for (const reserve of reservesData as Array<{ symbol: string; tokenAddress: string }>) {
        const underlying = getAddress(reserve.tokenAddress);
        const [decimals, name] = await client.multicall({
          contracts: [
            {
              address: underlying,
              abi: erc20Abi,
              functionName: 'decimals'
            },
            {
              address: underlying,
              abi: erc20Abi,
              functionName: 'name'
            }
          ],
          allowFailure: true
        });

        const decimalsValue = Number(decimals.result ?? 18);
        const nameValue = typeof name.result === 'string' ? name.result : reserve.symbol;

        reserveMap.set(underlying, {
          underlyingAsset: underlying,
          symbol: reserve.symbol,
          name: nameValue,
          decimals: decimalsValue
        });

        const assetId = canonicalErc20AssetId(network.chainId, underlying);
        const override = getAssetOverride({
          chainKey: network.chainKey,
          kind: AssetKind.ERC20,
          addressOrMint: underlying
        });
        await tx.asset.upsert({
          where: { id: assetId },
          update: {
            symbol: override?.symbol ?? reserve.symbol,
            name: override?.name ?? nameValue,
            decimals: decimalsValue,
            ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
          },
          create: {
            id: assetId,
            chainKey: network.chainKey,
            kind: AssetKind.ERC20,
            addressOrMint: underlying,
            symbol: override?.symbol ?? reserve.symbol,
            name: override?.name ?? nameValue,
            decimals: decimalsValue,
            ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
          }
        });
      }

      reserveCount = reserveMap.size;
      await enrichReserveTokenAddresses(client, protocolProviderAddress, reserveMap);
      return true;
    };

    try {
      const uiOk = await tryUiProvider();
      if (!uiOk) {
        await tryProtocolProvider();
      }

      for (const wallet of evmWallets) {
        if (market.uiPoolDataProvider) {
          try {
            const userReservesResponse = await client.readContract({
              address: getAddress(market.uiPoolDataProvider),
              abi: uiPoolDataProviderAbi,
              functionName: 'getUserReservesData',
              args: [getAddress(market.poolAddressesProvider), getAddress(wallet.address)]
            });

            const userReserves = userReservesResponse[0] as Array<{
              underlyingAsset: string;
              usageAsCollateralEnabledOnUser: boolean;
              currentATokenBalance: bigint;
              currentStableDebt: bigint;
              currentVariableDebt: bigint;
            }>;

            for (const reserve of userReserves) {
              const underlying = getAddress(reserve.underlyingAsset);
              const metadata = reserveMap.get(underlying);
              if (!metadata) continue;
              const assetId = canonicalErc20AssetId(network.chainId, underlying);

              if (reserve.currentATokenBalance > 0n) {
                positionsAssets.push({
                  snapshotId,
                  walletId: wallet.id,
                  chainKey: network.chainKey,
                  protocol: PositionProtocol.AAVE_V3,
                  sourceKey: SourceKey.aave_v3,
                  assetId,
                  quantityRaw: reserve.currentATokenBalance.toString(),
                  quantityDecimal: formatUnits(reserve.currentATokenBalance, metadata.decimals),
                  isCollateral: reserve.usageAsCollateralEnabledOnUser,
                  priceQuote: null,
                  valueQuote: null,
                  metaJson: toJson({
                    market: market.chainKey,
                    blockNumber: blockNumber.toString(),
                    underlyingAsset: metadata.underlyingAsset,
                    aTokenAddress: metadata.aTokenAddress ?? null,
                    stableDebtTokenAddress: metadata.stableDebtTokenAddress ?? null,
                    variableDebtTokenAddress: metadata.variableDebtTokenAddress ?? null
                  })
                });
              }

              const totalDebt = reserve.currentStableDebt + reserve.currentVariableDebt;
              if (totalDebt > 0n) {
                positionsLiabilities.push({
                  snapshotId,
                  walletId: wallet.id,
                  chainKey: network.chainKey,
                  protocol: LiabilityProtocol.AAVE_V3,
                  sourceKey: SourceKey.aave_v3,
                  debtAssetId: assetId,
                  amountRaw: totalDebt.toString(),
                  amountDecimal: formatUnits(totalDebt, metadata.decimals),
                  priceQuote: null,
                  valueQuote: null,
                  metaJson: toJson({
                    market: market.chainKey,
                    blockNumber: blockNumber.toString(),
                    stableDebtRaw: reserve.currentStableDebt.toString(),
                    variableDebtRaw: reserve.currentVariableDebt.toString(),
                    underlyingAsset: metadata.underlyingAsset,
                    aTokenAddress: metadata.aTokenAddress ?? null,
                    stableDebtTokenAddress: metadata.stableDebtTokenAddress ?? null,
                    variableDebtTokenAddress: metadata.variableDebtTokenAddress ?? null
                  })
                });
              }
            }

            continue;
          } catch {
            // fall through to protocol provider
          }
        }

        if (!protocolProviderAddress) continue;

        for (const [underlying, metadata] of reserveMap) {
          const userReserve = await client.readContract({
            address: getAddress(protocolProviderAddress),
            abi: protocolDataProviderAbi,
            functionName: 'getUserReserveData',
            args: [underlying, getAddress(wallet.address)]
          });

          const currentATokenBalance = userReserve[0] as bigint;
          const currentStableDebt = userReserve[1] as bigint;
          const currentVariableDebt = userReserve[2] as bigint;
          const usageAsCollateralEnabled = userReserve[8] as boolean;

          const assetId = canonicalErc20AssetId(network.chainId, underlying);

          if (currentATokenBalance > 0n) {
            positionsAssets.push({
              snapshotId,
              walletId: wallet.id,
              chainKey: network.chainKey,
              protocol: PositionProtocol.AAVE_V3,
              sourceKey: SourceKey.aave_v3,
              assetId,
              quantityRaw: currentATokenBalance.toString(),
              quantityDecimal: formatUnits(currentATokenBalance, metadata.decimals),
              isCollateral: usageAsCollateralEnabled,
              priceQuote: null,
              valueQuote: null,
              metaJson: toJson({
                market: market.chainKey,
                blockNumber: blockNumber.toString(),
                underlyingAsset: metadata.underlyingAsset,
                aTokenAddress: metadata.aTokenAddress ?? null,
                stableDebtTokenAddress: metadata.stableDebtTokenAddress ?? null,
                variableDebtTokenAddress: metadata.variableDebtTokenAddress ?? null
              })
            });
          }

          const totalDebt = currentStableDebt + currentVariableDebt;
          if (totalDebt > 0n) {
            positionsLiabilities.push({
              snapshotId,
              walletId: wallet.id,
              chainKey: network.chainKey,
              protocol: LiabilityProtocol.AAVE_V3,
              sourceKey: SourceKey.aave_v3,
              debtAssetId: assetId,
              amountRaw: totalDebt.toString(),
              amountDecimal: formatUnits(totalDebt, metadata.decimals),
              priceQuote: null,
              valueQuote: null,
              metaJson: toJson({
                market: market.chainKey,
                blockNumber: blockNumber.toString(),
                stableDebtRaw: currentStableDebt.toString(),
                variableDebtRaw: currentVariableDebt.toString(),
                underlyingAsset: metadata.underlyingAsset,
                aTokenAddress: metadata.aTokenAddress ?? null,
                stableDebtTokenAddress: metadata.stableDebtTokenAddress ?? null,
                variableDebtTokenAddress: metadata.variableDebtTokenAddress ?? null
              })
            });
          }
        }
      }

      marketsSucceeded += 1;
    } catch (error) {
      marketError = error instanceof Error ? error.message : 'Unknown error';
    }

    meta.push({
      chainKey: market.chainKey,
      blockNumber: blockNumber.toString(),
      reserveCount,
      error: marketError
    });
  }

  if (marketsSucceeded === 0 && meta.some((item) => item.error)) {
    const errorMessage = meta.map((item) => item.error).filter(Boolean).join('; ');
    throw new Error(errorMessage || 'Aave v3 failed on all markets');
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
      markets: meta
    }
  };
};
