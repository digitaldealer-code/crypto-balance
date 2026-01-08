import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { WalletType, isWalletType } from '@/lib/domain/constants';
import { normalizeEvmAddress, validateSolanaAddress } from '@/lib/normalization/address';

export const GET = async () => {
  const wallets = await prisma.wallet.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json(wallets);
};

export const POST = async (request: Request) => {
  const body = await request.json();
  const label = String(body?.label ?? '').trim();
  const typeInput = String(body?.type ?? '').trim().toUpperCase();
  const addressInput = String(body?.address ?? '').trim();

  if (!label || !typeInput || !addressInput) {
    return NextResponse.json(
      { error: 'label, type, and address are required' },
      { status: 400 }
    );
  }

  let address: string;
  try {
    if (!isWalletType(typeInput)) {
      return NextResponse.json({ error: 'Invalid wallet type' }, { status: 400 });
    }

    if (typeInput === WalletType.EVM) {
      address = normalizeEvmAddress(addressInput);
    } else if (typeInput === WalletType.SOLANA) {
      address = validateSolanaAddress(addressInput);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid address' },
      { status: 400 }
    );
  }

  try {
    const wallet = await prisma.wallet.create({
      data: { label, type: typeInput, address }
    });
    return NextResponse.json(wallet, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Wallet already exists for this address and type' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 });
  }
};
