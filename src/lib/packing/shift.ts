// Date and shift helpers for the packing floor. Everything is evaluated in Paraguay time
// (America/Asuncion), never in the viewer's or the server's timezone.

const TIME_ZONE = 'America/Asuncion';

export type PackingShift = { code: 'MANANA' | 'TARDE'; label: 'Mañana' | 'Tarde' };

const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' });

/** YYYY-MM-DD of the given instant in Asunción. */
export function asuncionDate(value: Date | string | number): string {
  return dateFormat.format(new Date(value));
}

/** YYYY-MM of the given instant in Asunción. */
export function asuncionMonth(value: Date | string | number): string {
  return asuncionDate(value).slice(0, 7);
}

/** Morning until 12:59, afternoon from 13:00 (Asunción). */
export function shiftFor(value: Date | string | number): PackingShift {
  const hour = Number(hourFormat.format(new Date(value)));
  return hour < 13 ? { code: 'MANANA', label: 'Mañana' } : { code: 'TARDE', label: 'Tarde' };
}

/** "sábado 10 de octubre" for the header; capitalised for display. */
export function longDayLabel(value: Date | string | number): string {
  const text = new Intl.DateTimeFormat('es-PY', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(value));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function clockLabel(value: Date | string | number): string {
  return new Intl.DateTimeFormat('es-PY', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

export interface TodaySessionSummary {
  id: string;
  status: string;
  started_at: string;
  stopped_at?: string;
  total_person_hours: number;
  total_duration_minutes?: number;
  segments: Array<{ headcount: number; started_at: string; ended_at?: string }>;
}

/**
 * Minimal view of a session for the floor operator: times, headcount and hours only.
 * Deliberately drops supervisor, approval, notes, SKU and anything salary related.
 */
export function toTodaySummary(session: {
  id: string; status: string; started_at: string; stopped_at?: string;
  total_person_hours?: number; total_duration_minutes?: number;
  segments?: Array<{ headcount: number; started_at: string; ended_at?: string }>;
}): TodaySessionSummary {
  return {
    id: session.id,
    status: session.status,
    started_at: session.started_at,
    stopped_at: session.stopped_at,
    total_person_hours: Number(session.total_person_hours || 0),
    total_duration_minutes: session.total_duration_minutes === undefined ? undefined : Number(session.total_duration_minutes),
    segments: (session.segments || []).map((segment) => ({
      headcount: Number(segment.headcount),
      started_at: segment.started_at,
      ended_at: segment.ended_at,
    })),
  };
}
