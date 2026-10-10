# QA local — PostgreSQL real sin Docker

Entorno aislado para validar migraciones y flujos industriales contra PostgreSQL 17 real
antes de tocar producción. No usa Docker, no crea infraestructura en la nube y nunca
contacta al proyecto Supabase productivo.

| Pieza | Puerto | Qué es |
|---|---|---|
| PostgreSQL 17 (`embedded-postgres`) | 54329 | Base aislada en `.data/`, se recrea en cada `db.mjs` |
| PostgREST 12 | 54322 | API REST real sobre esa base |
| Proxy `rest.mjs` | 54321 | Expone `/rest/v1` como Supabase + `/auth/v1/user` mínimo para sesiones locales |
| `next dev` (`dev.mjs`) | 3200 | La app apuntando solo al stack local |

## Instalación (una vez)

```bash
cd scripts/qa-local
npm install
node node_modules/@embedded-postgres/windows-x64/scripts/hydrate-symlinks.js
```

Descargar PostgREST v12.2.12 para Windows desde
https://github.com/PostgREST/postgrest/releases/tag/v12.2.12 y dejar `postgrest.exe` en `scripts/qa-local/bin/`.

## Uso

1. `node db.mjs` — aplica todas las migraciones de `supabase/migrations` desde cero y sale (validación SQL).
2. `node db.mjs --keep` — igual, pero deja PostgreSQL corriendo.
3. `node rest.mjs` — en otra terminal; escribe `qa.env` con URL y claves locales.
4. Tests reales (sin mocks), desde la raíz del repo, en Git Bash:
   ```bash
   set -a && source scripts/qa-local/qa.env && set +a && NIUPACK_QA_DB=1 npx vitest run tests/integration/
   ```
   Los tests se niegan a correr si la URL no es `localhost`.
5. Navegador: crear un usuario admin QA en la base local (`auth.users` + `profiles` con `auth_user_id`) y
   ejecutar `node dev.mjs <auth_user_id> <email>`; imprime la cookie de sesión para pegar en la consola de
   `http://localhost:3200`.

El stub de Supabase (roles `anon/authenticated/service_role`, schema `auth`, extensiones en `extensions`,
grants por defecto) está en `db.mjs` y replica lo que un proyecto Supabase trae antes de las migraciones.
