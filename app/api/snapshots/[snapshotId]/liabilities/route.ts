import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { isLiabilityProtocol } from '@/lib/domain/constants';

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
  if (protocolParam && isLiabilityProtocol(protocolParam)) {
    filters.protocol = protocolParam;
  }

  const liabilities = await prisma.positionsLiability.findMany({
    where: filters,
    orderBy: { valueQuote: 'desc' },
    include: { asset: true }
  });

  return NextResponse.json({ liabilities });
};
