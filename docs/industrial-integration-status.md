# Procesos Industriales + Cost Intelligence — estado y release

Fecha: 2026-10-10 · Branch: `integration/cost-intelligence-industrial-v2`

## Validación (PostgreSQL real, sin Docker: `scripts/qa-local`)

| Verificación | Cómo | Resultado |
|---|---|---|
| Escenario 1: bandas, empleados, Gs. 10.600.000, split Gen1/Gen2 sin duplicar | `tests/integration/industrial-real-db.test.ts` + navegador | OK |
| Escenario 2: cronómetro 3→4 personas, recuperación, aprobación única | test real + navegador | OK |
| Escenario 3: Hoja de Costos, switches ON/OFF, versiones, idempotencia | `tests/integration/cost-sheet-real-db.test.ts` + navegador | OK |
| Escenario 4: base caída, operario sin salarios, aislamiento por org | `tests/db-unavailable-real-client.test.ts`, RLS, API | OK |
| **Compatibilidad con producción**: 6 migraciones industriales sobre esquema con datos, sin alterar filas | `node scripts/qa-local/compat.mjs` (16 chequeos) | PASS |
| Reversión probada: aplicar → revertir → mismas filas → re-aplicar | `compat.mjs` | PASS |

Las firmas de columnas de las 8 tablas de las que dependen las migraciones coinciden entre producción y la base
construida con el repo (solo difiere `cost_sheet_versions` por las 2 columnas nuevas, esperado).

## Errores reales corregidos

1. **SQL que fallaba en Supabase**: `uuid_generate_v4/v5` dentro de RPC con `search_path = public` (viven en `extensions`).
2. **Formado duplicaba salarios**: costo = salario × (1 + cargas) × % por generación (nunca × horas de máquina).
3. **Salarios legibles por cualquier miembro de la organización** vía REST: migración `20261010190000` los restringe a admins.
4. Cronómetro perdía el primer toque; errores de negocio devolvían 500; operario recibía 500 en `/parameters`.
5. **Materiales de empaque**: el valor USD 3,50/1.000 era un default inventado (migración, seed y UI). Ahora el default es 0
   y el cálculo oficial queda `CONFIGURACION_INCOMPLETA` hasta que se configure el costo real.
6. **Electricidad**: la tarifa de Gs. 450/kWh era un default sin validar (migración, seed y UI). Ahora nace **sin configurar**
   (0) y el cálculo oficial queda incompleto hasta que el usuario cargue una tarifa. La UI aclara que es tarifa plana por kWh,
   sin validar contra el pliego de ANDE y sin cargos de potencia/demanda (referencia 50 kW): estimación, no costo definitivo.
   Potencias de referencia corregidas: Gen 1 = 6 kW (era 4,5) y Gen 2 = 15 kW (era 6,0). Cantidad de máquinas y horas
   (4 / 2 / 160 h) siguen como valores iniciales editables.
7. La reversión (`supabase/rollback`) falló en su primera prueba por orden de borrado; corregido y probado.

## Estado de producción (leído el 2026-10-10, solo lectura)

- Proyecto `tviuvfmhkatdplkisnta`: 0 tablas industriales, 0 hojas de costo, 1 configuración de costos, 11 organizaciones, 12 perfiles.
- `crm_account_safe_deletion` (20261007221238) existía solo en producción: reconciliada en el repo tal cual (no se re-aplica).
- Migraciones destructivas: ninguna. Los `UPDATE`/`DROP` de las 6 migraciones actúan solo sobre tablas nuevas;
  sobre tablas existentes solo se agregan 2 columnas nulables y un índice a `cost_sheet_versions` (0 filas).
- Dato histórico a conocer: la configuración `CUP-12OZ-DW` tiene un `process_calculation_detail` guardado el 2026-10-10 por las
  pruebas de la Preview contra producción (con 3,5 USD/1.000 de materiales). Sus switches están en `false`: no afecta costos. No se tocó.

## Respaldo y recuperación

- **El proyecto no tiene backups de plataforma** (`supabase backups list`: `backups: []`, PITR desactivado). Por eso se hizo
  una copia lógica propia.
- Copia completa de todos los datos de `public` (65 tablas, 505 filas) más el historial de migraciones, tomada en una sola
  sentencia SQL (snapshot consistente), en `../niupack-backups/prod-full-2026-10-10/snapshot.json` (fuera del repo).
  El recuento coincide con el independiente (505). **Restauración verificada**: `node scripts/qa-local/restore-check.mjs <dir>`
  reconstruye el esquema en PostgreSQL local, restaura todo y compara contenido tabla por tabla: 63 idénticas, 505/505 filas,
  0 diferencias (2 tablas vacías, `crm_import_jobs`/`crm_import_rows`, existen en producción pero no en las migraciones del repo:
  deriva de esquema preexistente). Números comparados por valor (el conector serializa 3100.0000 como 3100). No incluye el
  esquema `auth` (usuarios): ninguna migración lo toca.
- Huellas por tabla previas a migrar en `../niupack-backups/prod-pre-industrial-2026-10-10.json`; recalcular después: idénticas.
- Recuperación del esquema: `supabase/rollback/industrial_v2_rollback.sql` (probado). Válido solo mientras no existan datos
  industriales reales: borra las tablas industriales. Si ya hay datos, revertir únicamente el código (Vercel rollback; el esquema
  es aditivo y el código anterior funciona con él) y conservar las tablas.

## Vercel

- Proyecto `niupack-os`, enlazado a `bjjrage/niupack`, rama de producción `main`, última producción `2393f99` READY.
- Preview comparte las variables de Supabase con Production (riesgo original). Mitigación en `vercel.json`:
  `git.deploymentEnabled` desactiva la rama de integración y `ignoreCommand` omite su build.
- `PACKING_TOKEN_SECRET` no existía: creado solo en Production, como variable sensible (valor no registrado).
- Pendiente recomendado (no hecho, afecta otras ramas): separar las variables de Supabase de Preview.

## Pase a producción (tras GO)

1. Confirmar respaldo/punto de restauración en Supabase.
2. Aplicar en orden (nombres exactos): `industrial_processes_v2`, `salary_bands_and_personnel`,
   `personnel_salary_process_separation`, `industrial_salary_personnel_atomic_persistence`,
   `packing_session_atomic_workflow`, `restrict_salary_tables_to_admins`.
3. Verificar tablas, 14 RPC, permisos, índice, y que las huellas de las tablas preexistentes no cambiaron.
4. Mergear a `main` (deploy de Production) y comprobar READY.
5. Humo no destructivo: login, `/cost/processes`, `/cost/cost-sheets`, `/planta/empaque` con enlace QR, CRM, Logística.
