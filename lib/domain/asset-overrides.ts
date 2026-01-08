import { AssetKind } from '@/lib/domain/constants';

export type AssetOverride = {
  symbol: string;
  name: string;
  coingeckoId: string;
};

type AssetLookup = {
  chainKey: string;
  kind: string;
  addressOrMint?: string | null;
};

const NATIVE_OVERRIDES = new Map<string, AssetOverride>([
  ['evm:1', { symbol: 'ETH', name: 'Ether', coingeckoId: 'ethereum' }],
  ['evm:8453', { symbol: 'ETH', name: 'Ether', coingeckoId: 'ethereum' }],
  ['solana:mainnet-beta', { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana' }],
  ['evm:999', { symbol: 'HYPE', name: 'Hyperliquid', coingeckoId: 'hyperliquid' }]
]);

const EVM_OVERRIDES = new Map<string, AssetOverride>([
  ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', { symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin' }],
  ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', { symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin' }],
  ['0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', coingeckoId: 'coinbase-wrapped-btc' }],
  ['0xfd739d4e423301ce9385c1fb8850539d657c296d', { symbol: 'kHYPE', name: 'Kinetiq Staked HYPE', coingeckoId: 'hyperliquid' }]
]);

const SPL_OVERRIDES = new Map<string, AssetOverride>([
  ['epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v', { symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin' }],
  ['cbbtcf3aa214zxhbiazqwf4122fbybrandfqgw4imij', { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', coingeckoId: 'coinbase-wrapped-btc' }],
  ['so11111111111111111111111111111111111111112', { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana' }]
]);

export const getAssetOverride = (asset: AssetLookup): AssetOverride | null => {
  if (asset.kind === AssetKind.NATIVE) {
    return NATIVE_OVERRIDES.get(asset.chainKey) ?? null;
  }

  const address = asset.addressOrMint?.toLowerCase();
  if (!address) return null;

  if (asset.kind === AssetKind.ERC20) {
    return EVM_OVERRIDES.get(address) ?? null;
  }

  if (asset.kind === AssetKind.SPL) {
    return SPL_OVERRIDES.get(address) ?? null;
  }

  return null;
};

export const CANONICAL_COINGECKO_IDS = new Set<string>([
  'usd-coin',
  'coinbase-wrapped-btc',
  'ethereum',
  'solana',
  'hyperliquid'
]);
