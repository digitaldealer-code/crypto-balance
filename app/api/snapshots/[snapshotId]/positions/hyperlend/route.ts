import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { LiabilityProtocol, PositionProtocol } from '@/lib/domain/constants';

export const GET = async (
  request: Request,
  { params }: { params: { snapshotId: string } }
) => {
  const { searchParams } = new URL(request.url);
  const walletId = searchParams.get('walletId') || undefined;
  const chainKey = searchParams.get('chainKey') || undefined;

  const assetFilters: Record<string, unknown> = {
    snapshotId: params.snapshotId,
    protocol: PositionProtocol.HYPERLEND
  };
  const liabilityFilters: Record<string, unknown> = {
    snapshotId: params.snapshotId,
    protocol: LiabilityProtocol.HYPERLEND
  };

  if (walletId) {
    assetFilters.walletId = walletId;
    liabilityFilters.walletId = walletId;
  }
  if (chainKey) {
    assetFilters.chainKey = chainKey;
    liabilityFilters.chainKey = chainKey;
  }

  const [assets, liabilities] = await Promise.all([
    prisma.positionsAsset.findMany({ where: assetFilters, include: { asset: true, wallet: true } }),
    prisma.positionsLiability.findMany({ where: liabilityFilters, include: { asset: true, wallet: true } })
  ]);

  return NextResponse.json({ assets, liabilities });
};
