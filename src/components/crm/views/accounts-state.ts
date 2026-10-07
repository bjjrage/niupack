export type AccountSourceFilter = 'all' | 'manual' | 'imported';

export function matchesAccountSource(source: string | null | undefined, filter: AccountSourceFilter): boolean {
  if (filter === 'all') return true;
  const normalized = source?.trim().toUpperCase() ?? '';
  return filter === 'manual' ? normalized === 'MANUAL' : /^IMPORT(?:_|$)/.test(normalized);
}

export function toggleVisibleAccounts(selected: Set<string>, visibleIds: string[]): Set<string> {
  const next = new Set(selected);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  for (const id of visibleIds) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}
