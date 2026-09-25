import { QueryResult, QueryMentionAnalysis, VisibilitySnapshot, MarketCode } from '@/types';

export interface VisibilityMetrics {
  totalQueries: number;
  mentionedCount: number;
  linkedCount: number;
  sourceCount: number;
  wonCount: number;
  lostCount: number;
  mentionRate: number; // 0 to 100
  linkRate: number;
  sourceRate: number;
  overallScore: number; // 0 to 100
  competitorShare: Record<string, number>;
  topSources: Array<{ domain: string; count: number }>;
}

export class VisibilityEngine {
  /**
   * Calculate NIUPACK AI Visibility Score
   * Formula: (MentionRate * 0.50) + (LinkRate * 0.35) + (SourceRate * 0.15)
   */
  public static calculateScore(mentions: QueryMentionAnalysis[]): VisibilityMetrics {
    const total = mentions.length;
    if (total === 0) {
      return {
        totalQueries: 0,
        mentionedCount: 0,
        linkedCount: 0,
        sourceCount: 0,
        wonCount: 0,
        lostCount: 0,
        mentionRate: 0,
        linkRate: 0,
        sourceRate: 0,
        overallScore: 0,
        competitorShare: {},
        topSources: [],
      };
    }

    const mentionedCount = mentions.filter((m) => m.niupack_mentioned).length;
    const linkedCount = mentions.filter((m) => m.niupack_linked).length;
    const sourceCount = mentions.filter((m) => m.niupack_as_source).length;
    const wonCount = mentions.filter((m) => m.niupack_mentioned || m.niupack_linked).length;
    const lostCount = total - wonCount;

    const mentionRate = Number(((mentionedCount / total) * 100).toFixed(2));
    const linkRate = Number(((linkedCount / total) * 100).toFixed(2));
    const sourceRate = Number(((sourceCount / total) * 100).toFixed(2));

    const overallScore = Number((mentionRate * 0.5 + linkRate * 0.35 + sourceRate * 0.15).toFixed(2));

    // Competitor share
    const competitorCounts: Record<string, number> = {};
    for (const m of mentions) {
      for (const comp of m.competitors || []) {
        competitorCounts[comp.name] = (competitorCounts[comp.name] || 0) + 1;
      }
    }

    // Top sources
    const sourceCounts: Record<string, number> = {};
    for (const m of mentions) {
      for (const s of m.sources || []) {
        if (!s.is_niupack) {
          sourceCounts[s.domain] = (sourceCounts[s.domain] || 0) + 1;
        }
      }
    }

    const topSources = Object.entries(sourceCounts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalQueries: total,
      mentionedCount,
      linkedCount,
      sourceCount,
      wonCount,
      lostCount,
      mentionRate,
      linkRate,
      sourceRate,
      overallScore,
      competitorShare: competitorCounts,
      topSources,
    };
  }

  /**
   * Filter and calculate metrics by market code
   */
  public static calculateByMarket(
    mentions: Array<QueryMentionAnalysis & { country_code: MarketCode }>
  ): Record<MarketCode | 'TOTAL', VisibilityMetrics> {
    const totalMetrics = this.calculateScore(mentions);

    const brMentions = mentions.filter((m) => m.country_code === 'BR');
    const arMentions = mentions.filter((m) => m.country_code === 'AR');
    const boMentions = mentions.filter((m) => m.country_code === 'BO');
    const pyMentions = mentions.filter((m) => m.country_code === 'PY');

    return {
      TOTAL: totalMetrics,
      BR: this.calculateScore(brMentions),
      AR: this.calculateScore(arMentions),
      BO: this.calculateScore(boMentions),
      PY: this.calculateScore(pyMentions),
    };
  }

  /**
   * Compare Day 1 vs Day 15 vs Day 30 progression
   */
  public static compareProgression(snapshots: VisibilitySnapshot[]): {
    day1?: VisibilitySnapshot;
    day15?: VisibilitySnapshot;
    day30?: VisibilitySnapshot;
    progressDelta: number;
  } {
    const day1 = snapshots.find((s) => s.snapshot_day === 'DAY_1');
    const day15 = snapshots.find((s) => s.snapshot_day === 'DAY_15');
    const day30 = snapshots.find((s) => s.snapshot_day === 'DAY_30');

    let progressDelta = 0;
    if (day30 && day1) {
      progressDelta = Number((day30.overall_score - day1.overall_score).toFixed(2));
    } else if (day15 && day1) {
      progressDelta = Number((day15.overall_score - day1.overall_score).toFixed(2));
    }

    return {
      day1,
      day15,
      day30,
      progressDelta,
    };
  }
}
