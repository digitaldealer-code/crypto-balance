'use client';

import { useCallback, useEffect, useState } from 'react';

type PositionAsset = {
  id: string;
  assetId: string;
  chainKey: string;
  quantityDecimal: string;
  priceQuote: string | null;
  valueQuote: string | null;
  asset?: { symbol: string | null; name: string | null } | null;
  wallet?: { label: string } | null;
};

type PositionLiability = {
  id: string;
  debtAssetId: string;
  chainKey: string;
  amountDecimal: string;
  priceQuote: string | null;
  valueQuote: string | null;
  asset?: { symbol: string | null; name: string | null } | null;
  wallet?: { label: string } | null;
};

const chainLabel = (chainKey: string) => {
  if (chainKey === 'solana:mainnet-beta') return 'Solana';
  return chainKey;
};

const formatNumber = (value?: string | null) => {
  if (!value) return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return number.toFixed(4);
};

export default function KaminoPositionsClient() {
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [assets, setAssets] = useState<PositionAsset[]>([]);
  const [liabilities, setLiabilities] = useState<PositionLiability[]>([]);

  const loadLatestSnapshot = useCallback(async () => {
    const response = await fetch('/api/snapshots/latest/summary');
    const data = await response.json();
    if (data.snapshot?.id) {
      setSnapshotId(data.snapshot.id);
    }
  }, []);

  const loadPositions = useCallback(async (id: string) => {
    const response = await fetch(`/api/snapshots/${id}/positions/kamino`);
    const data = await response.json();
    setAssets(data.assets ?? []);
    setLiabilities(data.liabilities ?? []);
  }, []);

  useEffect(() => {
    loadLatestSnapshot();
  }, [loadLatestSnapshot]);

  useEffect(() => {
    if (snapshotId) {
      loadPositions(snapshotId);
    }
  }, [snapshotId, loadPositions]);

  return (
    <div className="grid" style={{ gap: 24 }}>
      <section className="panel">
        <h2>Kamino Deposits</h2>
        {assets.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No deposits yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="numeric">Deposited</th>
                <th>Chain</th>
                <th>Wallet</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <strong>{asset.asset?.symbol ?? asset.assetId}</strong>
                  </td>
                  <td className="numeric">{formatNumber(asset.quantityDecimal)}</td>
                  <td>{chainLabel(asset.chainKey)}</td>
                  <td>{asset.wallet?.label ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Kamino Borrows</h2>
        {liabilities.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No borrows yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="numeric">Borrowed</th>
                <th>Chain</th>
                <th>Wallet</th>
              </tr>
            </thead>
            <tbody>
              {liabilities.map((liability) => (
                <tr key={liability.id}>
                  <td>
                    <strong>{liability.asset?.symbol ?? liability.debtAssetId}</strong>
                  </td>
                  <td className="numeric">{formatNumber(liability.amountDecimal)}</td>
                  <td>{chainLabel(liability.chainKey)}</td>
                  <td>{liability.wallet?.label ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
