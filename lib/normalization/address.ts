import { getAddress } from 'viem';
import { PublicKey } from '@solana/web3.js';

export const normalizeEvmAddress = (address: string): string => {
  return getAddress(address);
};

export const validateSolanaAddress = (address: string): string => {
  try {
    const key = new PublicKey(address);
    return key.toBase58();
  } catch {
    throw new Error('Invalid Solana address');
  }
};
