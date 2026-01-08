'use client';

import { useCallback, useEffect, useState } from 'react';

type SourceRun = {
  sourceKey: string;
  status: string;
  finishedAt: string | null;
  errorMessage: string | null;
  metaJson: string | null;
};

type SnapshotPayload = {
  id: string;
  status: string;
  finishedAt: string | null;
};

export default function SourceStatusClient() {
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [sourceRuns, setSourceRuns] = useState<SourceRun[]>([]);
  const [finishedAt, setFinishedAt] = useState<string | null>(null);

  const loadLatestSnapshot = useCallback(async () => {
    const response = await fetch('/api/snapshots/latest/summary');
    const data = await response.json();
    if (data.snapshot?.id) {
      const snapshot = data.snapshot as SnapshotPayload;
      setSnapshotId(snapshot.id);
      setSnapshotStatus(snapshot.status);
      setFinishedAt(snapshot.finishedAt);
    }
  }, []);

  const loadStatus = useCallback(async (id: string) => {
    const response = await fetch(`/api/refresh/${id}/status`);
    const data = await response.json();
    setSnapshotStatus(data.snapshotStatus);
    setSourceRuns(data.sources ?? []);
  }, []);

  useEffect(() => {
    loadLatestSnapshot();
  }, [loadLatestSnapshot]);

  useEffect(() => {
    if (snapshotId) {
      loadStatus(snapshotId);
    }
  }, [snapshotId, loadStatus]);

  return (
    <div className="grid" style={{ gap: 24 }}>
      <section className="panel">
        <div className="summary-header">
          <div className="summary-meta">
            <h2>Data</h2>
            <p className="tagline">Diagnostics for the latest snapshot refresh by source.</p>
            <div className="summary-subline">
              <p className="tagline">
                Last updated:{' '}
                {finishedAt ? new Date(finishedAt).toLocaleString() : 'No snapshots yet'}
              </p>
              {snapshotStatus ? (
                <span className="status-pill compact" data-status={snapshotStatus}>
                  {snapshotStatus}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {sourceRuns.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No runs yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>Status</th>
                  <th>Finished</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {sourceRuns.map((run) => (
                  <tr key={run.sourceKey}>
                  <td className="mono wrap-anywhere">{run.sourceKey}</td>
                    <td>
                      <span className="status-pill" data-status={run.status}>
                        {run.status}
                      </span>
                    </td>
                    <td className="numeric">
                      {run.finishedAt ? new Date(run.finishedAt).toLocaleTimeString() : '--'}
                    </td>
                    <td className="error">{run.errorMessage ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
