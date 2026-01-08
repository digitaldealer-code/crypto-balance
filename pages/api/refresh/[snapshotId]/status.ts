import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/db/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const snapshotId = String(req.query.snapshotId ?? '');
  if (!snapshotId) {
    res.status(400).json({ error: 'snapshotId is required' });
    return;
  }

  const snapshot = await prisma.snapshot.findUnique({
    where: { id: snapshotId }
  });

  if (!snapshot) {
    res.status(404).json({ error: 'Snapshot not found' });
    return;
  }

  const sourceRuns = await prisma.snapshotSourceRun.findMany({
    where: { snapshotId },
    orderBy: { sourceKey: 'asc' }
  });

  res.status(200).json({
    snapshotId: snapshot.id,
    snapshotStatus: snapshot.status,
    sources: sourceRuns.map((run) => ({
      sourceKey: run.sourceKey,
      status: run.status,
      finishedAt: run.finishedAt,
      errorMessage: run.errorMessage,
      metaJson: run.metaJson
    }))
  });
}
