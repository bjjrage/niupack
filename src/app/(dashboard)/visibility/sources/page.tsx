import React from 'react';
import { repository } from '@/lib/db/repository';
import { VisibilityEngine } from '@/lib/engines/visibility-engine';
import { SourcesClient } from './sources-client';

export const revalidate = 0;

export default async function SourcesPage() {
  const mentions = await repository.getMentions();
  const metrics = VisibilityEngine.calculateScore(mentions);

  return <SourcesClient topSources={metrics.topSources} />;
}
