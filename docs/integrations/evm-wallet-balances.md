# EVM Wallet Balances

Status: Implemented for ETH/Base native + ERC-20 discovery (Alchemy) + watchlist fallback

Planned approach
- Use an indexer/enhanced RPC (Alchemy recommended) to enumerate ERC-20 holdings.
- Fallback to a token watchlist + multicall `balanceOf`.

Notes
- Native balances via `eth_getBalance`.
- ERC-20 asset ids follow `evm:<chainId>:erc20:<checksumAddress>`.
- Watchlist env keys: `ETHEREUM_ERC20_WATCHLIST_JSON`, `BASE_ERC20_WATCHLIST_JSON`.
