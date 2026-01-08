import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export const GET = async () => {
  const snapshot = await prisma.snapshot.findFirst({
    orderBy: { startedAt: 'desc' },
    include: { summary: true }
  });

  if (!snapshot) {
    return NextResponse.json({ snapshot: null });
  }

  return NextResponse.json({
    snapshot: {
      id: snapshot.id,
      status: snapshot.status,
      quoteCurrency: snapshot.quoteCurrency,
      startedAt: snapshot.startedAt,
      finishedAt: snapshot.finishedAt,
      summary: snapshot.summary ?? null
    }
  });
};
