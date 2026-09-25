import React from 'react';
import Link from 'next/link';
import { repository } from '@/lib/db/repository';
import { RunAuditView } from './RunAuditView';

export const revalidate = 0;

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await repository.getRun(id);

  if (!run) {
    return (
      <div className="p-8 text-center text-slate-400">
        Run no encontrado.{' '}
        <Link href="/visibility/runs" className="text-brand-400 hover:underline">
          Volver a historial de runs
        </Link>
      </div>
    );
  }

  const results = await repository.getRunResults(id);
  const mentions = await repository.getMentionsByRun(id);
  const snapshots = await repository.getSnapshotsByBattery(run.battery_id);

  return (
    <RunAuditView
      run={run}
      results={results}
      mentions={mentions}
      snapshots={snapshots}
    />
  );
}
