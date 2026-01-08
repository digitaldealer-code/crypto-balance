const getEnv = (key: string, fallback = ''): string => {
  const value = process.env[key];
  return value ?? fallback;
};

const getBool = (key: string, fallback = false): boolean => {
  const value = process.env[key];
  if (!value) return fallback;
  return value.toLowerCase() === 'true';
};

const getNumber = (key: string, fallback: number): number => {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getJsonArray = (key: string): string[] => {
  const value = process.env[key];
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export const env = {
  databaseUrl: getEnv('DATABASE_URL', 'file:./dev.db'),
  rpcEthereum: getEnv('RPC_ETHEREUM'),
  rpcBase: getEnv('RPC_BASE'),
  rpcSolana: getEnv('RPC_SOLANA'),
  rpcHyperEvm: getEnv('RPC_HYPEREVM'),
  hyperEvmChainId: getNumber('HYPEREVM_CHAIN_ID', 999),
  alchemyApiKey: getEnv('ALCHEMY_API_KEY'),
  coingeckoApiKey: getEnv('COINGECKO_API_KEY'),
  aaveV3EthPoolAddressesProvider: getEnv('AAVE_V3_ETH_POOL_ADDRESSES_PROVIDER'),
  aaveV3EthUiPoolDataProvider: getEnv('AAVE_V3_ETH_UI_POOL_DATA_PROVIDER'),
  aaveV3EthProtocolDataProvider: getEnv('AAVE_V3_ETH_PROTOCOL_DATA_PROVIDER'),
  aaveV3BasePoolAddressesProvider: getEnv('AAVE_V3_BASE_POOL_ADDRESSES_PROVIDER'),
  aaveV3BaseUiPoolDataProvider: getEnv('AAVE_V3_BASE_UI_POOL_DATA_PROVIDER'),
  aaveV3BaseProtocolDataProvider: getEnv('AAVE_V3_BASE_PROTOCOL_DATA_PROVIDER'),
  kaminoMarketsJson: getEnv('KAMINO_MARKETS_JSON'),
  hyperEvmErc20WatchlistJson: getJsonArray('HYPEREVM_ERC20_WATCHLIST_JSON'),
  hyperlendUiPoolDataProvider: getEnv('HYPERLEND_UI_POOL_DATA_PROVIDER'),
  hyperlendProtocolDataProvider: getEnv('HYPERLEND_PROTOCOL_DATA_PROVIDER'),
  hyperlendPoolAddressesProvider: getEnv('HYPERLEND_POOL_ADDRESSES_PROVIDER'),
  ethereumErc20Watchlist: getJsonArray('ETHEREUM_ERC20_WATCHLIST_JSON'),
  baseErc20Watchlist: getJsonArray('BASE_ERC20_WATCHLIST_JSON'),
  testWalletsJson: getEnv('TEST_WALLETS_JSON'),
  useMockSources: getBool('USE_MOCK_SOURCES', true)
};
