import type { NextApiRequest, NextApiResponse } from 'next';
import { SnapshotStatus, SourceKey, isSourceKey } from '@/lib/domain/constants';
import { createSnapshot, runSnapshot } from '@/lib/refresh';
import { prisma } from '@/lib/db/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const quoteCurrency = String(req.body?.quoteCurrency ?? 'USD').toUpperCase();
  let enabledSources: SourceKey[] | undefined;

  if (Array.isArray(req.body?.enabledSources)) {
    const invalid = req.body.enabledSources.filter(
      (value: string) => !isSourceKey(String(value))
    );
    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid sources: ${invalid.join(', ')}` });
      return;
    }
    enabledSources = req.body.enabledSources as SourceKey[];
  }

  const snapshot = await createSnapshot({ quoteCurrency, enabledSources });

  void runSnapshot(snapshot.id, { quoteCurrency, enabledSources }).catch(async (error) => {
    const message = error instanceof Error ? error.message : 'Unknown refresh error';
    await prisma.snapshot.update({
      where: { id: snapshot.id },
      data: { status: SnapshotStatus.FAILED, finishedAt: new Date(), notes: message }
    });
  });

  res.status(200).json({
    snapshotId: snapshot.id,
    status: snapshot.status,
    startedAt: snapshot.startedAt
  });
}
