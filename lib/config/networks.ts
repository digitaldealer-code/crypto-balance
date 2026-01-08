import { env } from '@/lib/config/env';
import { base, mainnet } from 'viem/chains';
import { defineChain } from 'viem';

export type EvmNetworkConfig = {
  chainId: number;
  chainKey: string;
  name: string;
  rpcUrl: string;
  viemChain: typeof mainnet;
  nativeSymbol: string;
  nativeName: string;
  nativeDecimals: number;
  nativeCoingeckoId: string | null;
};

export const EVM_NETWORKS: EvmNetworkConfig[] = [
  {
    chainId: 1,
    chainKey: 'evm:1',
    name: 'Ethereum',
    rpcUrl: env.rpcEthereum,
    viemChain: mainnet,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeDecimals: 18,
    nativeCoingeckoId: 'ethereum'
  },
  {
    chainId: 8453,
    chainKey: 'evm:8453',
    name: 'Base',
    rpcUrl: env.rpcBase,
    viemChain: base,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeDecimals: 18,
    nativeCoingeckoId: 'ethereum'
  },
  {
    chainId: env.hyperEvmChainId,
    chainKey: `evm:${env.hyperEvmChainId}`,
    name: 'HyperEVM',
    rpcUrl: env.rpcHyperEvm,
    viemChain: defineChain({
      id: env.hyperEvmChainId,
      name: 'HyperEVM',
      nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
      rpcUrls: {
        default: { http: [env.rpcHyperEvm] }
      }
    }),
    nativeSymbol: 'HYPE',
    nativeName: 'HYPE',
    nativeDecimals: 18,
    nativeCoingeckoId: null
  }
].filter((item) => item.rpcUrl);
