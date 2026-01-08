import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { getAddress } from 'viem';
import { PublicKey } from '@solana/web3.js';

const prisma = new PrismaClient();

const loadEnvFile = (filename) => {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    process.env[key] = value;
  }
};

loadEnvFile('.env.local');
loadEnvFile('.env');

const normalizeWallet = (wallet) => {
  const label = String(wallet?.label ?? '').trim();
  const typeRaw = String(wallet?.type ?? '').trim().toUpperCase();
  const addressRaw = String(wallet?.address ?? '').trim();

  if (!label || !typeRaw || !addressRaw) {
    throw new Error('Each wallet must include label, type, and address');
  }

  if (typeRaw === 'EVM') {
    return {
      label,
      type: 'EVM',
      address: getAddress(addressRaw)
    };
  }

  if (typeRaw === 'SOLANA') {
    const key = new PublicKey(addressRaw);
    return {
      label,
      type: 'SOLANA',
      address: key.toBase58()
    };
  }

  throw new Error(`Unsupported wallet type: ${typeRaw}`);
};

const main = async () => {
  const rawJson = process.env.TEST_WALLETS_JSON;
  if (!rawJson) {
    throw new Error('TEST_WALLETS_JSON is empty');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('TEST_WALLETS_JSON must be valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('TEST_WALLETS_JSON must be a JSON array');
  }

  const normalized = parsed.map(normalizeWallet);
  const results = [];

  for (const wallet of normalized) {
    const record = await prisma.wallet.upsert({
      where: {
        type_address: {
          type: wallet.type,
          address: wallet.address
        }
      },
      update: {
        label: wallet.label,
        isArchived: false
      },
      create: wallet
    });
    results.push(record);
  }

  console.log(`Seeded ${results.length} wallet(s).`);
  for (const wallet of results) {
    console.log(`${wallet.type} ${wallet.address} (${wallet.label})`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
