'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SnapshotSummary = {
  totalAssetsQuote: string;
  totalLiabilitiesQuote: string;
  netWorthQuote: string;
  pricedCoveragePct: number;
  pricedAssetsCount: number;
  totalAssetsCount: number;
  pricedLiabilitiesCount: number;
  totalLiabilitiesCount: number;
};

type SnapshotPayload = {
  id: string;
  status: string;
  quoteCurrency: string;
  startedAt: string;
  finishedAt: string | null;
  summary: SnapshotSummary | null;
};

type SourceRun = {
  sourceKey: string;
  status: string;
  finishedAt: string | null;
  errorMessage: string | null;
  metaJson: string | null;
};

type PositionAsset = {
  id: string;
  assetId: string;
  chainKey: string;
  quantityDecimal: string;
  priceQuote: string | null;
  valueQuote: string | null;
  protocol: string;
  sourceKey: string;
  asset?: {
    symbol: string | null;
    name: string | null;
    decimals: number | null;
  } | null;
  wallet?: {
    label: string;
  } | null;
};

type PositionLiability = {
  id: string;
  debtAssetId: string;
  chainKey: string;
  amountDecimal: string;
  priceQuote: string | null;
  valueQuote: string | null;
  protocol: string;
  sourceKey: string;
  asset?: {
    symbol: string | null;
    name: string | null;
    decimals: number | null;
  } | null;
};

const formatCurrency = (value?: string, currency = 'USD') => {
  if (!value) return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(number);
};

const formatQuantity = (value?: string) => {
  if (!value) return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  const rounded = Math.ceil(number * 1000) / 1000;
  return rounded.toFixed(3);
};

const formatAmount2 = (value?: string) => {
  if (!value) return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  const rounded = Math.ceil(number * 100) / 100;
  return rounded.toFixed(2);
};

const sumQuantity = (values: Array<string | null | undefined>) => {
  const total = values.reduce((sum, value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  return formatQuantity(total.toString());
};

const sumValue = (values: Array<string | null | undefined>) => {
  const total = values.reduce((sum, value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  return total.toString();
};

const chainLabel = (chainKey: string) => {
  if (chainKey === 'evm:1') return 'Ethereum';
  if (chainKey === 'evm:8453') return 'Base';
  if (chainKey === 'evm:999') return 'HyperEVM';
  if (chainKey === 'solana:mainnet-beta') return 'Solana';
  return chainKey;
};

const meetsValueThreshold = (value?: string | null, min = 0.1) => {
  if (!value) return false;
  const number = Number(value);
  if (!Number.isFinite(number)) return false;
  return number >= min;
};

export default function DashboardClient() {
  const [summary, setSummary] = useState<SnapshotPayload | null>(null);
  const [sourceRuns, setSourceRuns] = useState<SourceRun[]>([]);
  const [assets, setAssets] = useState<PositionAsset[]>([]);
  const [liabilities, setLiabilities] = useState<PositionLiability[]>([]);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'EUR'>('USD');
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [fxError, setFxError] = useState<string | null>(null);
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());
  const [expandedLiabilities, setExpandedLiabilities] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPositions = useCallback(async (snapshotId: string) => {
    const [assetsResponse, liabilitiesResponse] = await Promise.all([
      fetch(`/api/snapshots/${snapshotId}/assets`),
      fetch(`/api/snapshots/${snapshotId}/liabilities`)
    ]);
    const assetsData = await assetsResponse.json();
    const liabilitiesData = await liabilitiesResponse.json();
    setAssets(assetsData.assets ?? []);
    setLiabilities(liabilitiesData.liabilities ?? []);
  }, []);

  const loadStatus = useCallback(async (snapshotId: string) => {
    const response = await fetch(`/api/refresh/${snapshotId}/status`);
    const data = await response.json();
    setSnapshotStatus(data.snapshotStatus);
    setSourceRuns(data.sources ?? []);
    return data.snapshotStatus as string;
  }, []);

  const loadLatest = useCallback(async () => {
    const response = await fetch('/api/snapshots/latest/summary');
    const data = await response.json();
    if (data.snapshot) {
      setSummary(data.snapshot);
      setSnapshotStatus(data.snapshot.status);
      await loadStatus(data.snapshot.id);
      await loadPositions(data.snapshot.id);
    }
  }, [loadPositions, loadStatus]);

  const loadFxRate = useCallback(async () => {
    try {
      const response = await fetch('/api/fx/usd-eur');
      const data = await response.json();
      if (!response.ok) {
        setFxError(data.error ?? 'FX rate unavailable');
        setFxRate(null);
        return;
      }
      setFxRate(Number(data.rate));
      setFxError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FX rate unavailable';
      setFxError(message);
      setFxRate(null);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (snapshotId: string) => {
      const status = await loadStatus(snapshotId);
      await loadPositions(snapshotId);
      if (['SUCCESS', 'PARTIAL', 'FAILED'].includes(status)) {
        setRefreshing(false);
        stopPolling();
        await loadLatest();
        return;
      }
      pollRef.current = setTimeout(() => pollStatus(snapshotId), 2000);
    },
    [loadLatest, loadPositions, loadStatus, stopPolling]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const postRefresh = async (url: string) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quoteCurrency: 'USD' })
        });
        const contentType = response.headers.get('content-type') ?? '';
        let data: any = null;
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          data = { error: text || `Refresh failed (${response.status})` };
        }
        return { response, data };
      };

      let result = await postRefresh('/api/refresh');
      if (result.response.status === 404) {
        result = await postRefresh('/api/refresh/start');
      }

      if (!result.response.ok) {
        setRefreshError(result.data?.error ?? `Refresh failed (${result.response.status})`);
        setRefreshing(false);
        return;
      }

      const data = result.data;
      if (data.snapshotId) {
        await loadStatus(data.snapshotId);
        await loadPositions(data.snapshotId);
        pollStatus(data.snapshotId);
      } else {
        setRefreshError('Refresh failed: no snapshot created');
        setRefreshing(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refresh request failed';
      setRefreshError(message);
      setRefreshing(false);
    }
  }, [loadPositions, loadStatus, pollStatus]);

  useEffect(() => {
    loadLatest();
    return () => stopPolling();
  }, [loadLatest, stopPolling]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('displayCurrency');
    if (stored === 'EUR') {
      setDisplayCurrency('EUR');
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ currency?: string }>).detail;
      if (detail?.currency === 'EUR' || detail?.currency === 'USD') {
        setDisplayCurrency(detail.currency);
      }
    };
    window.addEventListener('currency-change', handler as EventListener);
    return () => window.removeEventListener('currency-change', handler as EventListener);
  }, []);

  useEffect(() => {
    if (displayCurrency === 'EUR' && summary?.quoteCurrency === 'USD') {
      loadFxRate();
    }
  }, [displayCurrency, loadFxRate, summary?.quoteCurrency]);

  useEffect(() => {
    if (displayCurrency === 'USD') {
      setFxError(null);
    }
  }, [displayCurrency]);

  const convertValue = useCallback(
    (value?: string | null) => {
      if (!value) return undefined;
      const number = Number(value);
      if (!Number.isFinite(number)) return undefined;
      if (displayCurrency === 'EUR' && summary?.quoteCurrency === 'USD') {
        if (!fxRate) return undefined;
        return (number * fxRate).toString();
      }
      return value;
    },
    [displayCurrency, fxRate, summary?.quoteCurrency]
  );

  const coverage = useMemo(() => {
    if (!summary?.summary) return '--';
    return `${summary.summary.pricedCoveragePct.toFixed(1)}%`;
  }, [summary]);

  const groupedAssets = useMemo(() => {
    const filtered = assets.filter(
      (asset) =>
        asset.protocol === 'KAMINO' ||
        (asset.valueQuote && meetsValueThreshold(asset.valueQuote))
    );
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        name?: string | null;
        rows: PositionAsset[];
      }
    >();

    filtered.forEach((asset) => {
      const symbol = asset.asset?.symbol ?? asset.assetId;
      const name = asset.asset?.name ?? null;
      const key = `${symbol}|${name ?? ''}`;
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(asset);
      } else {
        groups.set(key, { key, label: symbol, name, rows: [asset] });
      }
    });

    return Array.from(groups.values());
  }, [assets]);

  const groupedLiabilities = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        name?: string | null;
        rows: PositionLiability[];
      }
    >();

    liabilities.forEach((liability) => {
      const symbol = liability.asset?.symbol ?? liability.debtAssetId;
      const name = liability.asset?.name ?? null;
      const key = `${symbol}|${name ?? ''}`;
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(liability);
      } else {
        groups.set(key, { key, label: symbol, name, rows: [liability] });
      }
    });

    return Array.from(groups.values());
  }, [liabilities]);

  const toggleAssetGroup = (key: string) => {
    setExpandedAssets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleLiabilityGroup = (key: string) => {
    setExpandedLiabilities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="grid" style={{ gap: 24 }}>
      <section className="panel">
        <div className="summary-header">
          <div className="summary-meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2>Overview</h2>
            </div>
            <div className="summary-actions">
              <p className="tagline">
                Last updated:{' '}
                {summary?.finishedAt
                  ? new Date(summary.finishedAt).toLocaleString()
                  : 'No snapshots yet'}
              </p>
              {snapshotStatus ? (
                <span className="status-pill compact" data-status={snapshotStatus}>
                  {snapshotStatus}
                </span>
              ) : null}
            </div>
          </div>
          <div className="summary-actions">
            <button className="button-primary" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Sync'}
            </button>
            <a className="button-link" href="/wallets">
              Add wallet
            </a>
          </div>
        </div>
        {fxError ? <div className="error-block">{fxError}</div> : null}
        {refreshError ? <div className="error-block">{refreshError}</div> : null}
        <div className="grid grid-3" style={{ marginTop: 20 }}>
          <div className="stat">
            <span>Total Assets</span>
            <strong className="numeric">
              {summary?.summary
                ? formatCurrency(
                    convertValue(summary.summary.totalAssetsQuote),
                    displayCurrency
                  )
                : '--'}
            </strong>
          </div>
          <div className="stat">
            <span>Total Liabilities</span>
            <strong className="numeric">
              {summary?.summary
                ? formatCurrency(
                    convertValue(summary.summary.totalLiabilitiesQuote),
                    displayCurrency
                  )
                : '--'}
            </strong>
          </div>
          <div className="stat">
            <span>Net Worth</span>
            <strong className="numeric">
              {summary?.summary
                ? formatCurrency(convertValue(summary.summary.netWorthQuote), displayCurrency)
                : '--'}
            </strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Assets</h2>
        {assets.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No assets yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table align-right">
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="numeric">Amount</th>
                  <th className="numeric">Price</th>
                  <th className="numeric">Value</th>
                  <th>Chain</th>
                  <th>Wallet</th>
                </tr>
              </thead>
              <tbody>
                {groupedAssets.map((group) => {
                  const totalValue = sumValue(group.rows.map((row) => row.valueQuote));
                  const totalQuantity = sumQuantity(group.rows.map((row) => row.quantityDecimal));
                  const expanded = expandedAssets.has(group.key);
                  const rowCount = group.rows.length;
                  return (
                    <Fragment key={group.key}>
                      <tr>
                        <td>
                          <div style={{ display: 'grid', gap: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <strong>{group.label}</strong>
                              <button
                                className="secondary"
                                style={{
                                  width: 14,
                                  height: 14,
                                  padding: 0,
                                  borderRadius: 999,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  lineHeight: 1
                                }}
                                onClick={() => toggleAssetGroup(group.key)}
                                title={expanded ? 'Hide details' : `Show details (${rowCount})`}
                              >
                                {expanded ? '–' : '+'}
                              </button>
                            </div>
                            {group.name ? (
                              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                                {group.name}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="numeric">{totalQuantity}</td>
                        <td className="numeric">--</td>
                        <td className="numeric">
                          {formatCurrency(convertValue(totalValue), displayCurrency)}
                        </td>
                        <td>--</td>
                        <td>--</td>
                      </tr>
                      {expanded
                        ? group.rows.map((asset) => {
                            const symbol = asset.asset?.symbol ?? asset.assetId;
                            const name = asset.asset?.name;
                            return (
                              <tr key={asset.id} data-subrow>
                                <td>
                                  <div style={{ display: 'grid', gap: 2 }}>
                                    <strong>{symbol}</strong>
                                    {name ? (
                                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                                        {name}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="numeric">
                                  {formatQuantity(asset.quantityDecimal)}
                                </td>
                                <td className="numeric">
                                  {formatCurrency(
                                    convertValue(asset.priceQuote ?? undefined),
                                    displayCurrency
                                  )}
                                </td>
                                <td className="numeric">
                                  {formatCurrency(
                                    convertValue(asset.valueQuote ?? undefined),
                                    displayCurrency
                                  )}
                                </td>
                                <td>{chainLabel(asset.chainKey)}</td>
                                <td>{asset.wallet?.label ?? '--'}</td>
                              </tr>
                            );
                          })
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Liabilities</h2>
        {liabilities.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No liabilities yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table align-right">
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Debt Asset</th>
                  <th className="numeric">Amount</th>
                  <th className="numeric">Price</th>
                  <th className="numeric">Value</th>
                  <th>Chain</th>
                  <th>Protocol</th>
                </tr>
              </thead>
              <tbody>
                {groupedLiabilities.map((group) => {
                  const totalValue = sumValue(group.rows.map((row) => row.valueQuote));
                  const totalAmount = sumValue(group.rows.map((row) => row.amountDecimal));
                  const expanded = expandedLiabilities.has(group.key);
                  const rowCount = group.rows.length;
                  return (
                    <Fragment key={group.key}>
                      <tr>
                        <td>
                          <div style={{ display: 'grid', gap: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <strong>{group.label}</strong>
                              <button
                                className="secondary"
                                style={{
                                  width: 14,
                                  height: 14,
                                  padding: 0,
                                  borderRadius: 999,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  lineHeight: 1
                                }}
                                onClick={() => toggleLiabilityGroup(group.key)}
                                title={expanded ? 'Hide details' : `Show details (${rowCount})`}
                              >
                                {expanded ? '–' : '+'}
                              </button>
                            </div>
                            {group.name ? (
                              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                                {group.name}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="numeric">{formatAmount2(totalAmount)}</td>
                        <td className="numeric">--</td>
                        <td className="numeric">
                          {formatCurrency(convertValue(totalValue), displayCurrency)}
                        </td>
                        <td>--</td>
                        <td>--</td>
                      </tr>
                      {expanded
                        ? group.rows.map((liability) => {
                            const symbol = liability.asset?.symbol ?? liability.debtAssetId;
                            const name = liability.asset?.name;
                            return (
                              <tr key={liability.id} data-subrow>
                                <td>
                                  <div style={{ display: 'grid', gap: 2 }}>
                                    <strong>{symbol}</strong>
                                    {name ? (
                                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                                        {name}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="numeric">
                                  {formatAmount2(liability.amountDecimal)}
                                </td>
                                <td className="numeric">
                                  {formatCurrency(
                                    convertValue(liability.priceQuote ?? undefined),
                                    displayCurrency
                                  )}
                                </td>
                                <td className="numeric">
                                  {formatCurrency(
                                    convertValue(liability.valueQuote ?? undefined),
                                    displayCurrency
                                  )}
                                </td>
                                <td>{chainLabel(liability.chainKey)}</td>
                                <td>{liability.protocol}</td>
                              </tr>
                            );
                          })
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
