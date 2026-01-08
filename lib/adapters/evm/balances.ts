import type { Prisma, PrismaClient } from '@prisma/client';
import { createPublicClient, formatUnits, http, erc20Abi } from 'viem';
import type { Chain } from 'viem';
import { getAddress } from 'viem';
import { env } from '@/lib/config/env';
import { EVM_NETWORKS } from '@/lib/config/networks';
import {
  AssetKind,
  PositionProtocol,
  SourceKey,
  WalletType
} from '@/lib/domain/constants';
import { getAssetOverride } from '@/lib/domain/asset-overrides';
import {
  canonicalErc20AssetId,
  canonicalEvmNativeAssetId
} from '@/lib/normalization/ids';

const toJson = (value: unknown): string => JSON.stringify(value);

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

type TokenMeta = {
  address: string;
  decimals: number;
  symbol: string | null;
  name: string | null;
};

type AlchemyTokenBalance = {
  contractAddress: string;
  tokenBalance: string;
};

type AlchemyTokenBalancesResponse = {
  tokenBalances: AlchemyTokenBalance[];
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

const loadTokenMeta = async (
  client: ReturnType<typeof buildClient>,
  token: string,
  useMulticall: boolean
) => {
  if (useMulticall) {
    const [decimals, symbol, name] = await client.multicall({
      contracts: [
        {
          address: token,
          abi: erc20Abi,
          functionName: 'decimals'
        },
        {
          address: token,
          abi: erc20Abi,
          functionName: 'symbol'
        },
        {
          address: token,
          abi: erc20Abi,
          functionName: 'name'
        }
      ],
      allowFailure: true
    });

    return {
      address: token,
      decimals: Number(decimals.result ?? 18),
      symbol: typeof symbol.result === 'string' ? symbol.result : null,
      name: typeof name.result === 'string' ? name.result : null
    } satisfies TokenMeta;
  }

  const [decimals, symbol, name] = await Promise.all([
    client
      .readContract({ address: token, abi: erc20Abi, functionName: 'decimals' })
      .catch(() => 18),
    client
      .readContract({ address: token, abi: erc20Abi, functionName: 'symbol' })
      .catch(() => null),
    client
      .readContract({ address: token, abi: erc20Abi, functionName: 'name' })
      .catch(() => null)
  ]);

  return {
    address: token,
    decimals: Number(decimals ?? 18),
    symbol: typeof symbol === 'string' ? symbol : null,
    name: typeof name === 'string' ? name : null
  } satisfies TokenMeta;
};

const loadWatchlist = (chainId: number): string[] => {
  if (chainId === 1) return env.ethereumErc20Watchlist.map((addr) => getAddress(addr));
  if (chainId === 8453) return env.baseErc20Watchlist.map((addr) => getAddress(addr));
  if (chainId === env.hyperEvmChainId) {
    return env.hyperEvmErc20WatchlistJson.map((addr) => getAddress(addr));
  }
  return [];
};

const isAlchemyRpc = (rpcUrl: string) => rpcUrl.includes('alchemy.com');

const loadAlchemyTokenBalances = async (
  client: ReturnType<typeof buildClient>,
  walletAddress: string
): Promise<AlchemyTokenBalance[]> => {
  const response = await client.request<AlchemyTokenBalancesResponse>({
    method: 'alchemy_getTokenBalances',
    params: [walletAddress, 'erc20']
  });
  return response?.tokenBalances ?? [];
};

export const runEvmWalletBalances = async (
  tx: Tx,
  { snapshotId, wallets }: SourceInput
): Promise<SourceResult> => {
  const evmWallets = wallets.filter((wallet) => wallet.type === WalletType.EVM);
  if (evmWallets.length === 0) {
    return {
      positionsAssetCount: 0,
      positionsLiabilityCount: 0,
      meta: { walletCount: 0, chainCount: 0 }
    };
  }

  const positions: Prisma.PositionsAssetCreateManyInput[] = [];
  const meta: Record<string, unknown> = {
    walletCount: evmWallets.length,
    chains: [] as Array<{ chainKey: string; blockNumber: string; tokenCount: number }>
  };

  for (const network of EVM_NETWORKS.filter((item) => item.rpcUrl)) {
    const client = buildClient(network.viemChain, network.rpcUrl);
    const supportsMulticall = Boolean(
      (network.viemChain as Chain).contracts?.multicall3?.address
    );
    let blockNumber: bigint | null = null;
    try {
      blockNumber = await client.getBlockNumber();
    } catch {
      blockNumber = null;
    }
    const watchlist = loadWatchlist(network.chainId);

    const nativeAssetId = canonicalEvmNativeAssetId(network.chainId);
    const nativeOverride = getAssetOverride({
      chainKey: network.chainKey,
      kind: AssetKind.NATIVE
    });
    await tx.asset.upsert({
      where: { id: nativeAssetId },
      update: {
        symbol: nativeOverride?.symbol ?? network.nativeSymbol,
        name: nativeOverride?.name ?? network.nativeName,
        decimals: network.nativeDecimals,
        coingeckoId: nativeOverride?.coingeckoId ?? network.nativeCoingeckoId
      },
      create: {
        id: nativeAssetId,
        chainKey: network.chainKey,
        kind: AssetKind.NATIVE,
        symbol: nativeOverride?.symbol ?? network.nativeSymbol,
        name: nativeOverride?.name ?? network.nativeName,
        decimals: network.nativeDecimals,
        coingeckoId: nativeOverride?.coingeckoId ?? network.nativeCoingeckoId
      }
    });

    for (const wallet of evmWallets) {
      const balance = await client.getBalance({
        address: getAddress(wallet.address)
      });
      if (balance > 0n) {
        positions.push({
          snapshotId,
          walletId: wallet.id,
          chainKey: network.chainKey,
          protocol: PositionProtocol.WALLET,
          sourceKey: SourceKey.wallet_evm_balances,
          assetId: nativeAssetId,
          quantityRaw: balance.toString(),
          quantityDecimal: formatUnits(balance, network.nativeDecimals),
          isCollateral: null,
          priceQuote: null,
          valueQuote: null,
          metaJson: toJson({ blockNumber: blockNumber ? blockNumber.toString() : null })
        });
      }
    }

    const tokenBalancesByWallet = new Map<string, AlchemyTokenBalance[]>();
    const tokenAddresses = new Set<string>(watchlist);

    if (isAlchemyRpc(network.rpcUrl)) {
      for (const wallet of evmWallets) {
        const checksum = getAddress(wallet.address);
        const balances = await loadAlchemyTokenBalances(client, checksum);
        tokenBalancesByWallet.set(wallet.id, balances);
        balances.forEach((item) => {
          if (item.tokenBalance && item.tokenBalance !== '0x0') {
            tokenAddresses.add(getAddress(item.contractAddress));
          }
        });
      }
    }

    let tokenMeta: TokenMeta[] = [];
    if (tokenAddresses.size > 0) {
      tokenMeta = await Promise.all(
        Array.from(tokenAddresses).map((token) =>
          loadTokenMeta(client, token, supportsMulticall)
        )
      );

      for (const token of tokenMeta) {
        const override = getAssetOverride({
          chainKey: network.chainKey,
          kind: AssetKind.ERC20,
          addressOrMint: token.address
        });
        const assetId = canonicalErc20AssetId(network.chainId, token.address);
        await tx.asset.upsert({
          where: { id: assetId },
          update: {
            symbol: override?.symbol ?? token.symbol,
            name: override?.name ?? token.name,
            decimals: token.decimals,
            ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
          },
          create: {
            id: assetId,
            chainKey: network.chainKey,
            kind: AssetKind.ERC20,
            addressOrMint: token.address,
            symbol: override?.symbol ?? token.symbol,
            name: override?.name ?? token.name,
            decimals: token.decimals,
            ...(override?.coingeckoId ? { coingeckoId: override.coingeckoId } : {})
          }
        });
      }
    }

    for (const wallet of evmWallets) {
      const checksum = getAddress(wallet.address);
      const alchemyBalances = tokenBalancesByWallet.get(wallet.id) ?? [];
      const balanceMap = new Map<string, string>();
      alchemyBalances.forEach((item) => {
        balanceMap.set(getAddress(item.contractAddress), item.tokenBalance);
      });

      const multicallTargets = tokenMeta
        .filter((token) => !balanceMap.has(token.address))
        .map((token) => ({
          address: token.address,
          abi: erc20Abi,
          functionName: 'balanceOf' as const,
          args: [checksum] as const
        }));

      if (multicallTargets.length > 0 && supportsMulticall) {
        const balances = await client.multicall({
          contracts: multicallTargets,
          allowFailure: true
        });

        balances.forEach((result, index) => {
          const raw = result.result as bigint | undefined;
          if (!raw || raw === 0n) return;
          const address = multicallTargets[index].address;
          balanceMap.set(getAddress(address), `0x${raw.toString(16)}`);
        });
      } else if (multicallTargets.length > 0) {
        for (const target of multicallTargets) {
          const raw = await client
            .readContract({
              address: target.address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [checksum]
            })
            .catch(() => null);
          if (!raw || raw === 0n) continue;
          balanceMap.set(getAddress(target.address), `0x${raw.toString(16)}`);
        }
      }

      for (const token of tokenMeta) {
        const rawHex = balanceMap.get(token.address);
        if (!rawHex) continue;
        const raw = BigInt(rawHex);
        if (raw === 0n) continue;
        const assetId = canonicalErc20AssetId(network.chainId, token.address);
        positions.push({
          snapshotId,
          walletId: wallet.id,
          chainKey: network.chainKey,
          protocol: PositionProtocol.WALLET,
          sourceKey: SourceKey.wallet_evm_balances,
          assetId,
          quantityRaw: raw.toString(),
          quantityDecimal: formatUnits(raw, token.decimals),
          isCollateral: null,
          priceQuote: null,
          valueQuote: null,
          metaJson: toJson({ blockNumber: blockNumber ? blockNumber.toString() : null })
        });
      }
    }

    (meta.chains as Array<{ chainKey: string; blockNumber: string; tokenCount: number }>).push({
      chainKey: network.chainKey,
      blockNumber: blockNumber ? blockNumber.toString() : 'unknown',
      tokenCount: tokenMeta.length
    });
  }

  if (positions.length > 0) {
    await tx.positionsAsset.createMany({ data: positions });
  }

  return {
    positionsAssetCount: positions.length,
    positionsLiabilityCount: 0,
    meta
  };
};
