export const WalletType = {
  EVM: 'EVM',
  SOLANA: 'SOLANA'
} as const;

export type WalletType = (typeof WalletType)[keyof typeof WalletType];

export const NetworkChainType = {
  EVM: 'EVM',
  SOLANA: 'SOLANA'
} as const;

export type NetworkChainType =
  (typeof NetworkChainType)[keyof typeof NetworkChainType];

export const AssetKind = {
  NATIVE: 'NATIVE',
  ERC20: 'ERC20',
  SPL: 'SPL'
} as const;

export type AssetKind = (typeof AssetKind)[keyof typeof AssetKind];

export const SnapshotStatus = {
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED'
} as const;

export type SnapshotStatus =
  (typeof SnapshotStatus)[keyof typeof SnapshotStatus];

export const SourceRunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED'
} as const;

export type SourceRunStatus =
  (typeof SourceRunStatus)[keyof typeof SourceRunStatus];

export const SourceKey = {
  wallet_evm_balances: 'wallet_evm_balances',
  wallet_solana_balances: 'wallet_solana_balances',
  aave_v3: 'aave_v3',
  kamino: 'kamino',
  hyperlend: 'hyperlend',
  prices: 'prices'
} as const;

export type SourceKey = (typeof SourceKey)[keyof typeof SourceKey];

export const PositionProtocol = {
  WALLET: 'WALLET',
  AAVE_V3: 'AAVE_V3',
  KAMINO: 'KAMINO',
  HYPERLEND: 'HYPERLEND'
} as const;

export type PositionProtocol =
  (typeof PositionProtocol)[keyof typeof PositionProtocol];

export const LiabilityProtocol = {
  AAVE_V3: 'AAVE_V3',
  KAMINO: 'KAMINO',
  HYPERLEND: 'HYPERLEND'
} as const;

export type LiabilityProtocol =
  (typeof LiabilityProtocol)[keyof typeof LiabilityProtocol];

export const SOURCE_KEYS = Object.values(SourceKey);
export const WALLET_TYPES = Object.values(WalletType);
export const POSITION_PROTOCOLS = Object.values(PositionProtocol);
export const LIABILITY_PROTOCOLS = Object.values(LiabilityProtocol);

export const isSourceKey = (value: string): value is SourceKey =>
  SOURCE_KEYS.includes(value as SourceKey);

export const isWalletType = (value: string): value is WalletType =>
  WALLET_TYPES.includes(value as WalletType);

export const isPositionProtocol = (value: string): value is PositionProtocol =>
  POSITION_PROTOCOLS.includes(value as PositionProtocol);

export const isLiabilityProtocol = (value: string): value is LiabilityProtocol =>
  LIABILITY_PROTOCOLS.includes(value as LiabilityProtocol);
