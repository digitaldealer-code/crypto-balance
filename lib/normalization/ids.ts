import { getAddress } from 'viem';

const SOLANA_CHAIN_KEY = 'solana:mainnet-beta';

export const canonicalEvmNativeAssetId = (chainId: number): string => {
  return `evm:${chainId}:native`;
};

export const canonicalErc20AssetId = (chainId: number, address: string): string => {
  return `evm:${chainId}:erc20:${getAddress(address)}`;
};

export const canonicalSolNativeAssetId = (): string => {
  return `${SOLANA_CHAIN_KEY}:native`;
};

export const canonicalSplAssetId = (mintAddress: string): string => {
  return `${SOLANA_CHAIN_KEY}:spl:${mintAddress}`;
};
