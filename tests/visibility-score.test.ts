import { describe, it, expect } from 'vitest';
import { VisibilityEngine } from '@/lib/engines/visibility-engine';
import { QueryMentionAnalysis } from '@/types';

describe('AI Visibility Scoring Engine', () => {
  it('should return zero metrics for empty queries array', () => {
    const metrics = VisibilityEngine.calculateScore([]);
    expect(metrics.totalQueries).toBe(0);
    expect(metrics.overallScore).toBe(0);
    expect(metrics.mentionRate).toBe(0);
    expect(metrics.linkRate).toBe(0);
    expect(metrics.sourceRate).toBe(0);
  });

  it('should return 100% score when all queries have mention, link, and source', () => {
    const mentions: QueryMentionAnalysis[] = Array.from({ length: 5 }, (_, i) => ({
      id: `m-${i}`,
      result_id: `r-${i}`,
      query_id: `q-${i}`,
      organization_id: 'org-1',
      niupack_mentioned: true,
      niupack_linked: true,
      niupack_as_source: true,
      mention_count: 2,
      position: 'FIRST',
      sentiment_accuracy: 'CORRECT',
      confidence_score: 0.95,
      competitors: [],
      sources: [{ domain: 'niupack.com.py', url: 'https://niupack.com.py', is_niupack: true }],
    }));

    const metrics = VisibilityEngine.calculateScore(mentions);
    expect(metrics.totalQueries).toBe(5);
    expect(metrics.mentionRate).toBe(100);
    expect(metrics.linkRate).toBe(100);
    expect(metrics.sourceRate).toBe(100);
    expect(metrics.overallScore).toBe(100);
    expect(metrics.wonCount).toBe(5);
    expect(metrics.lostCount).toBe(0);
  });

  it('should calculate weighted score accurately according to formula (50/35/15)', () => {
    // 10 queries:
    // 3 mentioned (30% -> 15.0 pts)
    // 1 linked (10% -> 3.5 pts)
    // 2 sources (20% -> 3.0 pts)
    // Expected overallScore = 21.5
    const mentions: QueryMentionAnalysis[] = Array.from({ length: 10 }, (_, i) => ({
      id: `m-${i}`,
      result_id: `r-${i}`,
      query_id: `q-${i}`,
      organization_id: 'org-1',
      niupack_mentioned: i < 3,
      niupack_linked: i < 1,
      niupack_as_source: i < 2,
      mention_count: i < 3 ? 1 : 0,
      position: i < 3 ? 'FIRST' : 'NONE',
      sentiment_accuracy: i < 3 ? 'CORRECT' : 'NONE',
      confidence_score: 0.9,
      competitors: [],
      sources: [],
    }));

    const metrics = VisibilityEngine.calculateScore(mentions);
    expect(metrics.totalQueries).toBe(10);
    expect(metrics.mentionedCount).toBe(3);
    expect(metrics.linkedCount).toBe(1);
    expect(metrics.sourceCount).toBe(2);
    expect(metrics.mentionRate).toBe(30);
    expect(metrics.linkRate).toBe(10);
    expect(metrics.sourceRate).toBe(20);
    expect(metrics.overallScore).toBe(21.5);
  });

  it('should aggregate competitor occurrences and rank top domains', () => {
    const mentions: QueryMentionAnalysis[] = [
      {
        id: 'm-1',
        result_id: 'r-1',
        query_id: 'q-1',
        organization_id: 'org-1',
        niupack_mentioned: false,
        niupack_linked: false,
        niupack_as_source: false,
        mention_count: 0,
        position: 'NONE',
        sentiment_accuracy: 'NONE',
        confidence_score: 0.9,
        competitors: [
          { name: 'Klabin', order: 1 },
          { name: 'Scansys', order: 2 },
        ],
        sources: [
          { domain: 'mercadolivre.com.br', url: 'https://mercadolivre.com.br/1', is_niupack: false },
          { domain: 'scansys.com.br', url: 'https://scansys.com.br', is_niupack: false },
        ],
      },
      {
        id: 'm-2',
        result_id: 'r-2',
        query_id: 'q-2',
        organization_id: 'org-1',
        niupack_mentioned: true,
        niupack_linked: true,
        niupack_as_source: false,
        mention_count: 1,
        position: 'FIRST',
        sentiment_accuracy: 'CORRECT',
        confidence_score: 0.9,
        competitors: [{ name: 'Klabin', order: 2 }],
        sources: [
          { domain: 'mercadolivre.com.br', url: 'https://mercadolivre.com.br/2', is_niupack: false },
        ],
      },
    ];

    const metrics = VisibilityEngine.calculateScore(mentions);
    expect(metrics.competitorShare['Klabin']).toBe(2);
    expect(metrics.competitorShare['Scansys']).toBe(1);
    expect(metrics.topSources[0].domain).toBe('mercadolivre.com.br');
    expect(metrics.topSources[0].count).toBe(2);
    expect(metrics.topSources[1].domain).toBe('scansys.com.br');
    expect(metrics.topSources[1].count).toBe(1);
  });
});
