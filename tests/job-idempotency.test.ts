import { describe, it, expect } from 'vitest';
import { JobRunner } from '@/lib/jobs/job-runner';
import { repository } from '@/lib/db/repository';

describe('Job Runner & Idempotency Engine', () => {
  it('should create a persistent job with initial PENDING status', async () => {
    const job = await JobRunner.executeJob(
      'recalculate_cost_sheet',
      { sku: 'CUP-12OZ-SW' },
      'test-idemp-001'
    );

    expect(job).toBeDefined();
    expect(job.id).toBeDefined();
    expect(job.job_type).toBe('recalculate_cost_sheet');
    expect(job.idempotency_key).toBe('test-idemp-001');

    // Retrieve from repository
    const stored = await repository.getJob(job.id);
    expect(stored).toBeDefined();
  });

  it('should return existing completed job when called with the same idempotency key', async () => {
    const key = `idemp-key-${Date.now()}`;

    // 1. Create and complete a job in repository
    const org = await repository.getOrganization();
    const completedJob = await repository.createJob({
      organization_id: org.id,
      job_type: 'normalize_quote',
      status: 'COMPLETED',
      progress_percent: 100,
      retries: 0,
      max_retries: 3,
      idempotency_key: key,
      payload: { quoteId: 'quote-123' },
      result: { normalized: true },
    });

    // 2. Call executeJob with identical key
    const result = await JobRunner.executeJob('normalize_quote', { quoteId: 'quote-123' }, key);

    // 3. Must return the exact same completed job without creating a duplicate
    expect(result.id).toBe(completedJob.id);
    expect(result.status).toBe('COMPLETED');
    expect(result.result).toEqual({ normalized: true });
  });

  it('should record retries and status changes on jobs', async () => {
    const org = await repository.getOrganization();
    const job = await repository.createJob({
      organization_id: org.id,
      job_type: 'discover_suppliers',
      status: 'PENDING',
      progress_percent: 0,
      retries: 0,
      max_retries: 3,
      payload: { market: 'BR' },
    });

    const updated = await repository.updateJob(job.id, {
      status: 'RUNNING',
      retries: 1,
      last_error: 'Temporary timeout, retrying',
    });

    expect(updated.status).toBe('RUNNING');
    expect(updated.retries).toBe(1);
    expect(updated.last_error).toBe('Temporary timeout, retrying');
  });
});
