# NIU INTELLIGENCE OS — ESTADO DE IMPLEMENTACIÓN Y CERTIFICACIÓN TÉCNICA

**Sistema:** NIU Intelligence OS  
**Organización:** GARDINER S.A. (NIUPACK) — Asunción, Paraguay  
**Versión:** 1.3.0 (Costeo Unitario Canónico, Doble Moneda USD/PYG, Motor FX BNF, Export Logistics & Quote Matcher)  
**Fecha de Certificación:** 2026-09-25  
**Entorno de Validación:** Node.js v24.20.0 | Next.js 15.5.26 App Router | TypeScript 5.7.3 | Vitest 3.2.7 | ESLint 9  

---

## 1. RESUMEN DE CAMBIOS Y AMPLIACIONES RECIENTES (v1.3.0)

### 1.1 Costeo Unitario Canónico y Soporte Dual USD / Guaraníes (PYG)
- **Principio Central:** La unidad interna canónica del motor de costos es ahora **COSTO POR UNIDAD** (ej. `USD 0.04609 / u` y `Gs. 348 / u`). El costo "por millar" (`USD 46.09 / 1.000 u`) se mantiene exclusivamente como vista de referencia secundaria en tablas y tarjetas.
- **Campos Normalizados en CostComponent:** Se introdujo la estructura `DualCurrencyValue` con:
  - `amount_original`, `currency_original`, `fx_rate_used`, `amount_usd`, `amount_pyg`
  - Base de costo explícita `CostBasis`: `PER_UNIT | PER_1000 | PER_KG | PER_TON | PER_SHEET | PER_M2 | PER_M3 | PER_BOX | PER_CONTAINER | FIXED | PER_BATCH`.
- **Hoja de Costos (`IndustrialCostCalculator`):** Visualización destacada en tarjeta de resumen superior con badge en vivo de cotización BNF, selector de moneda preferida (USD / PYG / DUAL) y columnas simultáneas en el desglose de componentes.

### 1.2 Motor FX y Conexión Banco Nacional de Fomento (BNF)
- **Arquitectura Resiliente (`BnfFxProvider`):** Consulta directa al portal institucional del BNF con timeout estricto de 3.5 segundos mediante `AbortController`.
- **Estrategia Fallback Graceful:** Si la conexión externa falla o demora, el sistema **nunca lanza excepciones** no controladas; retorna el último tipo de cambio válido almacenado con estado `UNAVAILABLE_SOURCE_USING_LAST_VALID` o `STALE`.
- **Modos de Costeo Configurables:**
  - `BNF_SELL` (Venta oficial, valor por defecto conservador para costeo industrial).
  - `BNF_BUY` (Compra oficial).
  - `MANUAL` (Tipo de cambio fijo ingresado por tesorería).
  - `CUSTOM_MARGIN` (Cotización oficial + spread de seguridad cambiaria).
- **Matriz de Sensibilidad:** Escenarios automáticos a -5%, Cotización Actual, +5% y +10% para evaluar la exposición cambiaria en contratos a largo plazo.

### 1.3 Export Cost Engine & Landed Cost (`/cost/logistics`)
- **Módulo Dedicado en Navegación:** Nueva pantalla y subsección en el menú lateral bajo *3. COST INTELLIGENCE* (`/cost/logistics`).
- **Cálculo LCL (Carga Consolidada):**
  $$\text{Volumen por Caja } (m^3) = \frac{\text{Largo (cm)}}{100} \times \frac{\text{Ancho (cm)}}{100} \times \frac{\text{Alto (cm)}}{100}$$
  $$\text{Volumen Total } (m^3) = \text{Cajas} \times \text{Volumen Caja}$$
  $$\text{Flete Base} = \max(\text{Volumen Total} \times \text{Tarifa USD/}m^3, \; \text{Mínimo USD})$$
  $$\text{Flete Unitario} = \frac{\text{Flete Total}}{\text{Unidades Totales}}$$
  *(Caso validado en tests: Caja 50×40×45 cm = 0.09 m³, 1.000 u/caja, tarifa $180/m³ $\rightarrow$ $16.20/caja $\rightarrow$ $0.01620/u).*
- **Cálculo FCL (Contenedores 20FT, 40FT, 40HC, CUSTOM):**
  - Estimación por volumen útil con factor de estiba (85% eficiencia).
  - Control de peso máximo por payload permitido.
  - Detección automática del factor limitante (`VOLUME_LIMITED` vs. `WEIGHT_LIMITED`).
  - Campo de anulación manual de cajas reales cabidas (`actual_boxes_per_container`).
- **Punto de Equilibrio Logístico (Break-Even LCL vs. FCL):**
  $$\text{Cajas Break-Even} = \left\lceil \frac{\text{Flete FCL}}{\text{Flete por Caja LCL}} \right\rceil$$
  Informa al usuario el volumen exacto en unidades a partir del cual conviene contratar contenedor completo.
- **Cascada de Precios por Incoterm:**
  $$\text{EXW} \rightarrow \text{FOB} \rightarrow \text{CIF} \rightarrow \text{LANDED}$$
  Calculado en tiempo real en USD y Guaraníes con desglose de empaque de exportación, flete internacional, seguro de carga y aranceles/despacho en destino.

### 1.4 Quote-to-Cost Matcher
- **Ingesta de Cotizaciones Externas:** Extrae datos estructurados desde emails, textos, RFQs o pegado manual (soporta español, portugués e inglés).
- **Algoritmo de Matching de SKU (`matchClosestSku`):** Compara capacidad en oz/ml, tipo de pared (`single` vs `double`), gramaje y material para emparejar automáticamente la oferta contra el catálogo de NIUPACK con score de confianza.
- **Comparación Industrial Directa:**
  - Convierte precio cotizado a USD/unidad.
  - Contrasta contra el **Costo de Fábrica NIUPACK** y el **Landed Cost** equivalente.
  - Asigna estatus de competitividad: `COMPETITIVE` (margen > 15%), `PARITY` (margen 5–15%), `DISADVANTAGE` (0–5%), `CRITICAL` (< 0%).
  - **Detección de Disparidad de Incoterms:** Emite alertas explícitas si la cotización externa es FOB Santos y el costo NIUPACK es EXW Asunción para evitar comparaciones erróneas.
- **Modal Interactivo:** Disponible directamente desde la bandeja de cotizaciones de compras (`/rfq/quotes`) mediante el botón *[Quote-to-Cost Matcher]*.

### 1.5 Ampliación de NIU Copilot & Pricing Strategy
- **Copilot Context Builder Expandido:** El asistente contextual reconoce automáticamente los parámetros logísticos (método LCL/FCL, tipo de contenedor, costo landed, brecha FOB/CIF vs benchmark, y tipo de cambio BNF).
- **Tab 5 en Pricing Strategy:** Pestaña dedicada a la comparativa de Incoterms (EXW vs FOB vs CIF vs LANDED) frente al benchmark regional con banner de advertencia sobre fletes y aranceles.

---

## 2. ARQUITECTURA DE ENGINES & COMPONENTES

```
                    ┌────────────────────────────┐
                    │    BnfFxProvider (BNF)     │
                    │  (Timeout 3.5s + Fallback) │
                    └─────────────┬──────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │         FxEngine           │
                    │ (Costing Rates USD / PYG)  │
                    └──────┬──────────────┬──────┘
                           │              │
        ┌──────────────────▼──┐        ┌──▼──────────────────┐
        │  IndustrialCost     │        │  ExportLogistics    │
        │  Calculator         │        │  Engine             │
        │ (True Unit Cost)    │        │ (LCL / FCL / Landed)│
        └──────────┬──────────┘        └──┬──────────────────┘
                   │                      │
                   └──────────┬───────────┘
                              │
               ┌──────────────▼──────────────┐
               │    Quote-to-Cost Matcher    │
               │  (SKU Match & Cost Analysis)│
               └──────────────┬──────────────┘
                              │
               ┌──────────────▼──────────────┐
               │  Pricing Strategy & Copilot │
               └─────────────────────────────┘
```

---

## 3. ARCHIVOS MODIFICADOS Y CREADOS EN v1.3.0

### Tipos & Repositorio
- `src/types/index.ts`: Definición de `CostBasis`, `DualCurrencyValue`, `FxRate`, `FxSettings`, `FxQuote`, `ProductPackagingSpec`, `ContainerType`, `ContainerSpec`, `FclLogisticsInput/Result`, `LclLogisticsInput/Result`, `LogisticsBreakEvenResult`, `LandedCostBreakdown`, `ExternalQuoteInput`, `QuoteMatchResult`.
- `src/lib/db/seed-data.ts`: Semillas de tipos de cambio BNF (`INITIAL_FX_RATES`), ajustes (`INITIAL_FX_SETTINGS`) y especificaciones de empaque por SKU (`INITIAL_PACKAGING_SPECS`).
- `src/lib/db/repository.ts`: Persistencia en memoria y métodos CRUD para FX, Packaging Specs y Quote Matches.

### Motores Analíticos
- `src/lib/fx/fx-provider.ts`: `BnfFxProvider`, `ManualFxProvider` y `FxEngine` (conversión, fallback sin throws, sensibilidad).
- `src/lib/engines/export-logistics-engine.ts`: Motor de cubicaje, LCL con cargo mínimo, FCL por volumen/peso con override, punto de equilibrio y cascada de landed cost.
- `src/lib/engines/quote-matcher-engine.ts`: Ingesta y normalización de cotizaciones externas, emparejamiento con catálogo y análisis de brecha de costo.
- `src/lib/copilot/context-builder.ts`: Contexto ampliado para logística de exportación, LCL/FCL, landed cost y sensibilidad BNF.

### Endpoints API
- `src/app/api/fx/route.ts`: Endpoint GET/POST para consulta, refresco forzado y configuración de tasas de cambio.
- `src/app/api/cost/logistics/route.ts`: Endpoint para cálculo en tiempo real de LCL, FCL, Break-Even y Landed Cost.
- `src/app/api/market/quote-matcher/route.ts`: Endpoint para ingesta y emparejamiento de cotizaciones externas.

### Interfaz de Usuario
- `src/components/cost/IndustrialCostCalculator.tsx`: Tarjeta principal de costo unitario canónico ($/u y Gs./u), badge de cotización BNF con refresco en vivo, columnas de doble moneda.
- `src/app/(dashboard)/cost/logistics/page.tsx` & `logistics-client.tsx`: Pantalla completa de Logística de Exportación con 4 pestañas interactivas (LCL, FCL, Break-Even, Landed Cost).
- `src/components/navigation/sidebar.tsx`: Enlace permanente a `/cost/logistics` en *3. COST INTELLIGENCE*.
- `src/components/rfq/QuoteCostMatcherModal.tsx`: Modal para ingreso de cotizaciones externas, matching y visualización de brecha contra costo NIUPACK.
- `src/app/(dashboard)/rfq/quotes/page.tsx`: Botón de acceso directo al matcher de cotizaciones.
- `src/app/(dashboard)/pricing/strategy/pricing-strategy-client.tsx`: Incorporación de Tab 5 (Incoterms Comparativa vs Benchmark con banner de advertencia).

### Tests Unitarios
- `tests/unit-cost-conversion.test.ts`: Pruebas de conversión canónica a costo unitario y visualización por millar.
- `tests/fx-engine.test.ts`: Pruebas de resiliencia del proveedor BNF, fallback a último valor válido y matriz de sensibilidad.
- `tests/export-logistics.test.ts`: Pruebas de cubicaje de cajas (Caso 2 y Caso 3), mínimo de LCL, contenedor 40HC, punto de equilibrio y cascada de landed cost.
- `tests/quote-matcher.test.ts`: Pruebas de extracción de email en portugués, matching con catálogo de SKUs y cálculo de brecha de competitividad.

---

## 4. RESULTADOS DE LA VALIDACIÓN TÉCNICA

### 4.1 Tests Automatizados (`npm run test`):
```bash
 RUN  v3.2.7 C:/Users/User/Desktop/PORYECTOS/niupack

 ✓ tests/export-logistics.test.ts (7 tests)
 ✓ tests/copilot-context.test.ts (3 tests)
 ✓ tests/quote-matcher.test.ts (3 tests)
 ✓ tests/rfq-state-machine.test.ts (4 tests)
 ✓ tests/battery-freeze.test.ts (4 tests)
 ✓ tests/unit-cost-conversion.test.ts (3 tests)
 ✓ tests/fx-engine.test.ts (4 tests)
 ✓ tests/industrial-capex.test.ts (1 test)
 ✓ tests/currency-normalization.test.ts (4 tests)
 ✓ tests/true-cost-calculation.test.ts (3 tests)
 ✓ tests/industrial-cost-engine.test.ts (2 tests)
 ✓ tests/job-idempotency.test.ts (3 tests)
 ✓ tests/query-dedupe.test.ts (5 tests)
 ✓ tests/quote-normalization.test.ts (3 tests)
 ✓ tests/visibility-score.test.ts (4 tests)
 ✓ tests/nesting-engine.test.ts (2 tests)
 ✓ tests/pricing-strategies.test.ts (5 tests)
 ✓ tests/scenario-engine.test.ts (3 tests)

 Test Files  18 passed (18)
      Tests  63 passed (63)
   Duration  2.56s
```

### 4.2 Chequeo de Tipos TypeScript (`npm run typecheck`):
```bash
> tsc --noEmit
Exit code: 0 (Cero errores de tipos en todo el proyecto)
```

### 4.3 Chequeo de Linting ESLint (`npm run lint`):
```bash
> next lint
✔ No ESLint warnings or errors
Exit code: 0
```

### 4.4 Compilación de Producción Next.js (`npm run build`):
Completada con éxito (Exit code: 0). Todas las rutas estáticas y dinámicas compiladas.

---

## 5. REGLAS DE DESPLIEGUE Y OPERACIÓN

- **Git Push:** Restringido bajo orden explícita del usuario. Los commits se mantienen locales hasta instrucción de despliegue.
- **Proveedor BNF:** Totalmente tolerante a caídas de red o demoras del portal gubernamental gracias al fallback automático del `FxEngine`.
- **Incoterms de Referencia:** Asunción (EXW/FOB), Santos/Paranaguá/Buenos Aires (CIF/Destino).
