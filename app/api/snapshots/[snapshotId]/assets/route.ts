import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { isPositionProtocol } from '@/lib/domain/constants';

export const GET = async (
  request: Request,
  { params }: { params: { snapshotId: string } }
) => {
  const { searchParams } = new URL(request.url);
  const walletId = searchParams.get('walletId') || undefined;
  const chainKey = searchParams.get('chainKey') || undefined;
  const protocolParam = searchParams.get('protocol') || undefined;

  const filters: Record<string, unknown> = { snapshotId: params.snapshotId };
  if (walletId) filters.walletId = walletId;
  if (chainKey) filters.chainKey = chainKey;
  if (protocolParam && isPositionProtocol(protocolParam)) {
    filters.protocol = protocolParam;
  }

  const assets = await prisma.positionsAsset.findMany({
    where: filters,
    orderBy: { valueQuote: 'desc' },
    include: { asset: true, wallet: true }
  });

  return NextResponse.json({ assets });
};
