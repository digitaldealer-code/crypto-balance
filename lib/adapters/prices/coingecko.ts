import { env } from '@/lib/config/env';

export type PriceRequest = {
  assetId: string;
  coingeckoId: string;
};

export type PriceResult = {
  assetId: string;
  price: string;
  quoteCurrency: string;
  source: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const REQUEST_TIMEOUT_MS = 10000;
const OVERALL_TIMEOUT_MS = 20000;
const PRICE_ID_BATCH = 50;
const TOKEN_PRICE_BATCH = 50;
const MAX_ATTEMPTS = 5;

const backoffDelay = (attempt: number) => {
  const base = 1000 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 200);
  return base + jitter;
};

const buildHeaders = () => {
  const headers: Record<string, string> = {};
  if (env.coingeckoApiKey) {
    headers['x-cg-pro-api-key'] = env.coingeckoApiKey;
  }
  return headers;
};

const fetchWithRetries = async (url: string, headers: Record<string, string>) => {
  let response: Response | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);
    } catch {
      clearTimeout(timeout);
      response = null;
    }

    if (response?.ok) break;
    if (response?.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const retryDelay = retryAfter ? Number(retryAfter) * 1000 : backoffDelay(attempt);
      await sleep(Number.isFinite(retryDelay) ? retryDelay : backoffDelay(attempt));
      continue;
    }
    if (response?.status && response.status >= 400 && response.status < 500) {
      break;
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(backoffDelay(attempt));
      continue;
    }
  }

  return response;
};

export const fetchCoingeckoPrices = async (
  requests: PriceRequest[],
  quoteCurrency: string
): Promise<PriceResult[]> => {
  if (requests.length === 0) return [];

  const normalizedRequests = new Map<string, PriceRequest[]>();
  for (const request of requests) {
    const normalized = request.coingeckoId.trim().toLowerCase();
    if (!normalized || !/^[a-z0-9-]+$/.test(normalized)) continue;
    const bucket = normalizedRequests.get(normalized);
    if (bucket) {
      bucket.push(request);
    } else {
      normalizedRequests.set(normalized, [request]);
    }
  }

  const ids = Array.from(normalizedRequests.keys());
  if (ids.length === 0) return [];

  const results: PriceResult[] = [];
  const headers = buildHeaders();
  let anySuccess = false;
  const errors: Array<number | string> = [];
  const startedAt = Date.now();
  const fallbackLimit = 10;

  const appendResults = (id: string, price: number) => {
    const group = normalizedRequests.get(id);
    if (!group) return;
    for (const request of group) {
      results.push({
        assetId: request.assetId,
        price: price.toString(),
        quoteCurrency,
        source: 'coingecko'
      });
    }
  };

  for (let i = 0; i < ids.length; i += PRICE_ID_BATCH) {
    if (Date.now() - startedAt > OVERALL_TIMEOUT_MS) {
      break;
    }
    const batch = ids.slice(i, i + PRICE_ID_BATCH);
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${batch
      .map((item) => encodeURIComponent(item))
      .join(',')}&vs_currencies=${quoteCurrency.toLowerCase()}`;
    const response = await fetchWithRetries(url, headers);

    if (!response || !response.ok) {
      errors.push(response?.status ?? 'no response');
      if (batch.length > 1) {
        let attempted = 0;
        for (const id of batch) {
          if (Date.now() - startedAt > OVERALL_TIMEOUT_MS) break;
          if (attempted >= fallbackLimit) break;
          const singleUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
            id
          )}&vs_currencies=${quoteCurrency.toLowerCase()}`;
          const singleResponse = await fetchWithRetries(singleUrl, headers);
          if (!singleResponse || !singleResponse.ok) {
            errors.push(singleResponse?.status ?? 'no response');
            continue;
          }
          anySuccess = true;
          const json = (await singleResponse.json()) as Record<string, Record<string, number>>;
          const price = json[id]?.[quoteCurrency.toLowerCase()];
          if (!price || !Number.isFinite(price)) continue;
          appendResults(id, price);
          attempted += 1;
        }
      }
      continue;
    }

    anySuccess = true;
    const json = (await response.json()) as Record<string, Record<string, number>>;
    for (const id of batch) {
      const price = json[id]?.[quoteCurrency.toLowerCase()];
      if (!price || !Number.isFinite(price)) continue;
      appendResults(id, price);
    }
  }

  if (!anySuccess) {
    const errorSummary = errors.length > 0 ? errors.join(', ') : 'no response';
    throw new Error(`CoinGecko request failed (${errorSummary})`);
  }

  return results;
};

export const fetchCoingeckoTokenPrices = async (
  platform: string,
  contracts: string[],
  quoteCurrency: string
): Promise<Map<string, string>> => {
  const results = new Map<string, string>();
  if (contracts.length === 0) return results;

  const headers = buildHeaders();
  const startedAt = Date.now();
  const batches: string[][] = [];
  for (let i = 0; i < contracts.length; i += TOKEN_PRICE_BATCH) {
    batches.push(contracts.slice(i, i + TOKEN_PRICE_BATCH));
  }

  for (const batch of batches) {
    if (Date.now() - startedAt > OVERALL_TIMEOUT_MS) break;
    const contractList = batch.map((item) => item.toLowerCase()).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${contractList}&vs_currencies=${quoteCurrency.toLowerCase()}`;
    const response = await fetchWithRetries(url, headers);
    if (!response || !response.ok) {
      continue;
    }
    const json = (await response.json()) as Record<string, Record<string, number>>;
    for (const [contract, prices] of Object.entries(json)) {
      const price = prices?.[quoteCurrency.toLowerCase()];
      if (!price || !Number.isFinite(price)) continue;
      results.set(contract.toLowerCase(), price.toString());
    }
  }

  return results;
};

export const fetchCoingeckoIdsByContracts = async (
  platform: string,
  contracts: string[]
): Promise<Map<string, string>> => {
  const results = new Map<string, string>();
  const headers = buildHeaders();

  for (const contract of contracts) {
    const address = contract.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${address}`;
    const response = await fetchWithRetries(url, headers);

    if (!response || !response.ok) continue;
    const json = (await response.json()) as { id?: string };
    if (json.id) {
      results.set(contract, json.id);
    }
  }

  return results;
};
