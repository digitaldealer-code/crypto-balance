'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

const WALLET_TYPES = ['EVM', 'SOLANA'] as const;

type Wallet = {
  id: string;
  label: string;
  address: string;
  type: 'EVM' | 'SOLANA';
  isArchived: boolean;
};

export default function WalletsClient() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<Wallet['type']>('EVM');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadWallets = async () => {
    const response = await fetch('/api/wallets');
    const data = await response.json();
    setWallets(data);
  };

  useEffect(() => {
    loadWallets();
  }, []);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    const response = await fetch('/api/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, type, address })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? 'Failed to add wallet');
    } else {
      setError('');
      setLabel('');
      setAddress('');
      await loadWallets();
    }
    setSaving(false);
  };

  const updateWallet = async (id: string, updates: Partial<Wallet>) => {
    const response = await fetch(`/api/wallets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? 'Failed to update wallet');
    } else {
      setError('');
      await loadWallets();
    }
  };

  const deleteWallet = async (id: string) => {
    const response = await fetch(`/api/wallets/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? 'Failed to delete wallet');
    } else {
      setError('');
      await loadWallets();
    }
  };

  return (
    <div className="grid" style={{ gap: 24 }}>
      <section className="panel">
        <h2>Add Wallet</h2>
        <form onSubmit={handleAdd}>
          <label className="field">
            <span className="field-label">Label</span>
            <input
              placeholder="e.g. Treasury"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Type</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as Wallet['type'])}
            >
              {WALLET_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Address</span>
            <input
              placeholder={type === 'EVM' ? '0x...' : 'Solana address'}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              required
            />
            <span className="help">
              {type === 'EVM'
                ? 'Use a 0x… EVM address.'
                : 'Use a base58 Solana address.'}
            </span>
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Add wallet'}
          </button>
          {error ? <span className="error">{error}</span> : null}
        </form>
      </section>

      <section className="panel">
        <h2>Wallets</h2>
        {wallets.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No wallets yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Address</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((wallet) => (
                  <tr key={wallet.id}>
                    <td>
                      <input
                        className="table-input"
                        value={wallet.label}
                        onChange={(event) => {
                          const next = wallets.map((item) =>
                            item.id === wallet.id
                              ? { ...item, label: event.target.value }
                              : item
                          );
                          setWallets(next);
                        }}
                        onBlur={(event) =>
                          updateWallet(wallet.id, { label: event.target.value })
                        }
                      />
                  </td>
                  <td className="mono wrap-anywhere">{wallet.address}</td>
                  <td>{wallet.type}</td>
                  <td>{wallet.isArchived ? 'Archived' : 'Active'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="secondary"
                          onClick={() =>
                            updateWallet(wallet.id, { isArchived: !wallet.isArchived })
                          }
                        >
                          {wallet.isArchived ? 'Unarchive' : 'Archive'}
                        </button>
                        <button
                          className="secondary danger"
                          onClick={() => deleteWallet(wallet.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
