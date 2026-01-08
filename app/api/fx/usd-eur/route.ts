import { NextResponse } from 'next/server';
import { fetchCoingeckoPrices } from '@/lib/adapters/prices/coingecko';

export const GET = async () => {
  try {
    const results = await fetchCoingeckoPrices(
      [{ assetId: 'usd', coingeckoId: 'usd-coin' }],
      'EUR'
    );
    const rate = results[0]?.price ? Number(results[0].price) : null;
    if (!rate || !Number.isFinite(rate)) {
      return NextResponse.json({ error: 'FX rate unavailable' }, { status: 502 });
    }

    return NextResponse.json({
      base: 'USD',
      quote: 'EUR',
      rate,
      fetchedAt: new Date().toISOString(),
      source: results[0].source
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FX rate fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
};
