import { env } from '@/lib/config/env';

export type AaveMarketConfig = {
  chainKey: string;
  name: string;
  poolAddressesProvider: string;
  uiPoolDataProvider?: string;
  protocolDataProvider?: string;
};

export const AAVE_V3_MARKETS: AaveMarketConfig[] = [
  {
    chainKey: 'evm:1',
    name: 'Ethereum',
    poolAddressesProvider: env.aaveV3EthPoolAddressesProvider,
    uiPoolDataProvider: env.aaveV3EthUiPoolDataProvider,
    protocolDataProvider: env.aaveV3EthProtocolDataProvider
  },
  {
    chainKey: 'evm:8453',
    name: 'Base',
    poolAddressesProvider: env.aaveV3BasePoolAddressesProvider,
    uiPoolDataProvider: env.aaveV3BaseUiPoolDataProvider,
    protocolDataProvider: env.aaveV3BaseProtocolDataProvider
  }
].filter((market) => market.poolAddressesProvider && (market.uiPoolDataProvider || market.protocolDataProvider));
