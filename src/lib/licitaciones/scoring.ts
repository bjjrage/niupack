import type { CandidateScore, Potential, ScoreReason } from './types';

export interface CompanyFacts {
  ruc?: string | null;
  /** Rol → cantidad de licitaciones distintas donde aparece, con el rol confirmado o no. */
  roles: Array<{ role: string; tender_id: string; confirmed: boolean; injectable_items: number; injectable_units: number; ampolla_items: number }>;
}

/**
 * Puntaje explicable (0-100): cada punto sale de una razón visible para el revisor.
 * NIUPACK vende cunas/bandejas a quien envasa ampollas: fabricantes y laboratorios puntúan más que
 * importadores o simples invitados, y los roles sin confirmar no suman.
 */
export function scoreCompany(facts: CompanyFacts): CandidateScore {
  const reasons: ScoreReason[] = [];
  const add = (code: string, points: number, text: string) => reasons.push({ code, points, text });

  const has = (role: string, predicate: (r: CompanyFacts['roles'][number]) => boolean = () => true) =>
    facts.roles.filter((r) => r.role === role && predicate(r));
  const tenders = new Set(facts.roles.map((r) => r.tender_id));
  const injectableRoles = facts.roles.filter((r) => r.injectable_items > 0);
  // Un invitado no presentó oferta: no se le atribuye volumen, presentación ni recurrencia.
  const engaged = injectableRoles.filter((r) => r.role !== 'INVITADO');

  const maker = has('FABRICANTE', (r) => r.confirmed).concat(has('LABORATORIO', (r) => r.confirmed));
  if (maker.length) add('FABRICANTE_CONFIRMADO', 30, 'Fabricante o laboratorio confirmado en el documento');
  else add('FABRICANTE_NO_CONFIRMADO', 0, 'Fabricante/laboratorio no confirmado: el rol no se asume por ser adjudicatario');

  if (has('ADJUDICATARIO', (r) => r.injectable_items > 0).length) add('ADJUDICATARIO_INYECTABLE', 30, 'Adjudicatario de ítems inyectables');
  else if (has('OFERENTE', (r) => r.injectable_items > 0).length) add('OFERENTE_INYECTABLE', 15, 'Oferente en ítems inyectables');
  else if (has('INVITADO', (r) => r.injectable_items > 0).length) add('INVITADO_INYECTABLE', 3, 'Solo invitado a licitación de inyectables (no presentó oferta)');

  if (has('IMPORTADOR', (r) => r.confirmed).concat(has('REPRESENTANTE', (r) => r.confirmed)).length) {
    add('IMPORTADOR_CONFIRMADO', 10, 'Importador o representante confirmado');
  }
  if (engaged.some((r) => r.ampolla_items > 0)) add('PRESENTACION_AMPOLLA', 10, 'Presentación en ampolla (formato de la cuna NIUPACK)');

  const units = engaged.reduce((sum, r) => sum + r.injectable_units, 0);
  if (units >= 100_000) add('VOLUMEN_ALTO', 10, `Volumen inyectable ≥ 100.000 unidades (${units.toLocaleString('es-PY')})`);
  else if (units >= 10_000) add('VOLUMEN_MEDIO', 5, `Volumen inyectable ≥ 10.000 unidades (${units.toLocaleString('es-PY')})`);

  const injectableTenders = new Set(engaged.map((r) => r.tender_id)).size;
  if (injectableTenders > 1) add('RECURRENCIA', Math.min(15, (injectableTenders - 1) * 5), `Aparece en ${injectableTenders} licitaciones de inyectables`);

  if (facts.ruc) add('RUC_VERIFICABLE', 10, 'RUC publicado en la fuente (identificación verificable)');
  else add('SIN_RUC', 0, 'Sin RUC: identificar por nombre exige revisión humana');

  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  let potential: Potential = injectableRoles.length === 0 && tenders.size > 0 ? 'BAJO' : score >= 60 ? 'ALTO' : score >= 35 ? 'MEDIO' : score > 0 ? 'BAJO' : 'NO_EVALUADO';
  // Sin fabricante/laboratorio confirmado puede ser un distribuidor que no envasa: el potencial no pasa de MEDIO.
  if (potential === 'ALTO' && maker.length === 0) {
    potential = 'MEDIO';
    reasons.push({ code: 'TOPE_SIN_FABRICANTE', points: 0, text: 'Potencial limitado a MEDIO hasta confirmar si fabrica o envasa' });
  }
  return { score, potential, reasons };
}
