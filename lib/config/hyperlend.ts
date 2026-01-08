import { env } from '@/lib/config/env';

export type HyperlendConfig = {
  chainKey: string;
  poolAddressesProvider: string;
  uiPoolDataProvider: string;
  protocolDataProvider: string;
};

export const HYPERLEND_CONFIG: HyperlendConfig | null =
  env.hyperlendPoolAddressesProvider &&
  env.hyperlendUiPoolDataProvider &&
  env.hyperlendProtocolDataProvider
    ? {
        chainKey: `evm:${env.hyperEvmChainId}`,
        poolAddressesProvider: env.hyperlendPoolAddressesProvider,
        uiPoolDataProvider: env.hyperlendUiPoolDataProvider,
        protocolDataProvider: env.hyperlendProtocolDataProvider
      }
    : null;
