'use client';

import { useEffect, useState } from 'react';

export default function CurrencyToggle() {
  const [currency, setCurrency] = useState<'USD' | 'EUR'>('USD');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('displayCurrency');
    if (stored === 'EUR') {
      setCurrency('EUR');
    }
  }, []);

  const toggleCurrency = () => {
    const next = currency === 'USD' ? 'EUR' : 'USD';
    setCurrency(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('displayCurrency', next);
      window.dispatchEvent(
        new CustomEvent('currency-change', { detail: { currency: next } })
      );
    }
  };

  return (
    <button
      type="button"
      className="nav-link currency-toggle"
      onClick={toggleCurrency}
      aria-label="Toggle currency"
      title="Toggle currency"
    >
      <span style={{ opacity: currency === 'USD' ? 1 : 0.5 }}>USD</span>
      <span style={{ opacity: 0.35, margin: '0 6px' }}>⇄</span>
      <span style={{ opacity: currency === 'EUR' ? 1 : 0.5 }}>EUR</span>
    </button>
  );
}
