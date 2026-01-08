# HyperLend

Status: In progress (adapter wiring + validation)

Discovery checklist
- [x] Confirm HyperEVM chainId via `eth_chainId` (0x3e7 / 999).
- [x] Identify HyperLend contract addresses:
  - UiPoolDataProvider: `0x3Bb92CF81E38484183cc96a4Fb8fBd2d73535807`
  - ProtocolDataProvider: `0x5481bf8d3946E6A3168640c1D7523eB59F055a29`
  - PoolAddressesProvider: `0x72c98246a98bFe64022a3190e7710E157497170C`
- [ ] Identify any official API or subgraph for fallback.
- [x] Pick one test wallet with a known HyperLend position and expected outcomes.

Notes
- Test wallet: `0x2215F02ae20D438AAfa1b923b5E2979A67e4e36c`.
- Next step: run a refresh and confirm HyperLend assets + liabilities persist and price.
