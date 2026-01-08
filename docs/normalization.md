# Normalization

## Canonical assetId

EVM
- Native: `evm:<chainId>:native`
- ERC-20: `evm:<chainId>:erc20:<checksumAddress>`

Solana
- Native SOL: `solana:mainnet-beta:native`
- SPL: `solana:mainnet-beta:spl:<mintAddress>`

## Amount storage

Every position stores both:
- `quantityRaw` / `amountRaw`: integer string in base units
- `quantityDecimal` / `amountDecimal`: decimal string normalized by decimals
