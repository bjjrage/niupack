import { asuncionDate } from '@/lib/packing/shift';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

function lastDayOfMonth(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
}

/**
 * Date on which the personnel and salary bands of a costing period are evaluated.
 *  - current period: today (an employee hired on the 10th counts from the 10th, not "never")
 *  - past period:    its last day (everyone who worked in that month is included)
 *  - future period:  its first day
 * Previously every period was evaluated on its 1st, which silently dropped anyone hired later in
 * the month and made the industrial cost incomplete.
 */
export function personnelReferenceDate(period: string | undefined, today: string = asuncionDate(new Date())): string {
  if (!period || !PERIOD.test(period)) return today;
  const first = `${period}-01`;
  const last = lastDayOfMonth(period);
  if (today < first) return first;
  if (today > last) return last;
  return today;
}
