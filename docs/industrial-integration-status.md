# Procesos Industriales + Cost Intelligence — estado y pase a producción

Fecha: 2026-10-10 · Branch: `integration/cost-intelligence-industrial-v2`

## Qué se validó y cómo

Todo contra PostgreSQL 17 real con las 24 migraciones aplicadas desde cero (`scripts/qa-local`),
sin mocks salvo donde se indica.

| Escenario | Cómo | Resultado |
|---|---|---|
| 1. Bandas + 3 empleados = Gs. 10.600.000; salir/volver; split 50/50 Gen1/Gen2 sin duplicar | Test real `tests/integration/industrial-real-db.test.ts` + navegador | OK |
| 2. Cronómetro 3→4 personas = 9 h-persona; recuperar tras recargar; aprobar; no imputar dos veces | Test real + navegador (reloj adelantado en base para no esperar 2,5 h) | OK |
| 3. Producción del SKU, cálculo Formado/Calidad/Empaque, switches ON/OFF, versiones históricas, reintentos | Test real `tests/integration/cost-sheet-real-db.test.ts` (identidad y FX fijados) + navegador | OK |
| 4a. Base caída → error, nunca guardado falso | `tests/db-unavailable-real-client.test.ts` (cliente Supabase real a puerto cerrado) | OK |
| 4b. Operario no ve salarios | API: 403 con token de operario. Base: RLS nuevo, un `operator` de la misma org ve 0 filas | OK |
| 4c. Aislamiento entre organizaciones | Tests reales (org B no ve datos de org A) + RLS | OK |

## Errores reales encontrados y corregidos

1. **SQL que habría fallado en producción** (`20261010170248`): `public.uuid_generate_v5()` y `uuid_generate_v4()`
   dentro de RPC con `search_path = public`. En Supabase la extensión vive en `extensions`, así que
   `start_packing_session_atomic` y `apply_industrial_cost_to_cost_intelligence_atomic` fallaban siempre.
   Reemplazado por `gen_random_uuid()` / `md5(...)::uuid`.
2. **Formado duplicaba salarios**: el costo de operadores era tarifa horaria × horas de máquina
   (un operario de Gs. 3.500.000 costaba Gs. 8.155.000). Ahora es salario × (1 + cargas) × % por generación.
3. **Salarios legibles por cualquier usuario de la organización** vía REST de Supabase con la anon key.
   Nueva migración `20261010190000_restrict_salary_tables_to_admins.sql`: tablas salariales solo para admins
   (la app usa service role y no se ve afectada).
4. **Cronómetro perdía el primer toque** al volver a la pantalla (la resincronización deshabilitaba los botones).
5. Errores de negocio devolvían `500 AUTH_FAILED` (p. ej. segunda aprobación); ahora `409` con el código real,
   y el token de operario recibe `403` también en `/parameters`.
6. `vercel.json`: deploys deshabilitados para esta branch, para que un push no genere una Preview
   conectada a la base productiva.

## Decisiones de comportamiento a confirmar

- Switch **OFF** de un rubro: la Hoja de Costos usa el valor manual del SKU para ese rubro
  (no lo pone en cero). Así estaba implementado y se mantuvo.
- Materiales de empaque: el parámetro trae 3,5 USD/1.000 por defecto en la migración.
- La tarifa eléctrica es plana (Gs./kWh configurable); no modela cargos fijos ni de demanda de ANDE.

## Pase a producción (requiere autorización expresa)

Producción (`tviuvfmhkatdplkisnta`) tiene aplicadas las migraciones hasta CRM (2026-10-07) y **ninguna** industrial.
También tiene `crm_account_safe_deletion` (20261007221238), que no está en este repo: traerla antes de mergear.

1. Backup / punto de restauración del proyecto.
2. Pre-chequeo (solo lectura). `20261010170248` crea un índice único "una hoja ACTIVE por org + SKU" en
   `cost_sheet_versions`; si esto devuelve filas, la migración falla y hay que archivar duplicados primero:
   ```sql
   select organization_id, sku, count(*) from public.cost_sheet_versions
   where status = 'ACTIVE' group by 1, 2 having count(*) > 1;
   ```
3. Aplicar en este orden, una por una, verificando cada una:
   `20261008000001`, `20261009000001`, `20261010031847`, `20261010154756`, `20261010170248`, `20261010190000`.
   Crean tablas y funciones nuevas. Sobre tablas existentes con datos solo tocan `cost_sheet_versions`:
   dos columnas nulables nuevas (`true_unit_cost_pyg`, `fx_rate_used`) y el índice del paso 2.
4. Configurar `PACKING_TOKEN_SECRET` (≥ 32 bytes) en Vercel Production.
5. Mergear la branch a `main` (quitar la entrada de la branch en `vercel.json` si se quiere Preview).
6. Humo en producción con una org real: crear banda, empleado, sesión de empaque corta, aprobar, calcular.

Recomendación aparte: separar las variables de Supabase de Preview en Vercel (hoy apuntan a producción).
