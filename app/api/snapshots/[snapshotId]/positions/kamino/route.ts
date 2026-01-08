import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { LiabilityProtocol, PositionProtocol } from '@/lib/domain/constants';

export const GET = async (
  request: Request,
  { params }: { params: { snapshotId: string } }
) => {
  const { searchParams } = new URL(request.url);
  const walletId = searchParams.get('walletId') || undefined;

  const assetFilters: Record<string, unknown> = {
    snapshotId: params.snapshotId,
    protocol: PositionProtocol.KAMINO
  };
  const liabilityFilters: Record<string, unknown> = {
    snapshotId: params.snapshotId,
    protocol: LiabilityProtocol.KAMINO
  };

  if (walletId) {
    assetFilters.walletId = walletId;
    liabilityFilters.walletId = walletId;
  }

  const [assets, liabilities] = await Promise.all([
    prisma.positionsAsset.findMany({
      where: assetFilters,
      include: { asset: true, wallet: true }
    }),
    prisma.positionsLiability.findMany({
      where: liabilityFilters,
      include: { asset: true, wallet: true }
    })
  ]);

  return NextResponse.json({ assets, liabilities });
};
