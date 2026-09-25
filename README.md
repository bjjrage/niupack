# NIU INTELLIGENCE OS

> **Sistema Operativo de Inteligencia Comercial de NIUPACK (GARDINER S.A. — Paraguay)**  
> Plataforma interna industrial para visibilidad en motores de IA, benchmark de precios regionales, cálculo de costo industrial verdadero, pricing estratégico y acciones comerciales en el Cono Sur.

---

## 1. Visión y Objetivos

NIU Intelligence OS responde de forma cuantitativa y en tiempo real a las 5 preguntas estratégicas de la dirección comercial:

1. **¿NIUPACK aparece cuando compradores buscan nuestros productos en ChatGPT?**  
   Mide la cuota de mención, enlaces y fuentes de NIUPACK frente a Copobras, Altacoppo y otros fabricantes regionales en consultas simuladas por mercado (Brasil, Argentina, Bolivia y control Paraguay).
2. **¿Qué precios reales tiene el mercado en Brasil, Argentina y Bolivia?**  
   Consolida cotizaciones formales, listas mayoristas y observaciones normalizadas a USD por unidad y por SKU idéntico.
3. **¿Cuánto nos cuesta realmente producir cada SKU?**  
   Desglosa el *True Cost* en 22+ componentes: materia prima, merma compuesta secuencial, mano de obra, energía, mantenimiento, depreciación de maquinaria y fletes.
4. **¿Qué precio podemos ofrecer para competir manteniendo rentabilidad?**  
   Calcula automáticamente 7 estrategias comerciales (Margen Objetivo, Alineación de Mercado, Penetración -5%, Escala de Volumen, Contrato Anual Indexado, Piso Mínimo Defendible y Posicionamiento Prémium FSSC 22000).
5. **¿Qué acciones deberíamos tomar para entrar a cada mercado?**  
   Prioriza en un Centro de Acciones táctico las oportunidades comerciales y productivas según retorno de inversión (ROI), facilidad de implementación y riesgo.

---

## 2. Arquitectura de Motores y Módulos

```
                                  NIU INTELLIGENCE OS
 ┌─────────────────────────────────────────────────────────────────────────────────────────┐
 │                                                                                         │
 │   1. AI VISIBILITY            2. MARKET INTELLIGENCE     3. INDUSTRIAL COST & PRICING   │
 │   ┌───────────────────────┐   ┌───────────────────────┐  ┌────────────────────────────┐ │
 │   │ • Generador Masivo (N)│   │ • Normalización Multi-│  │ • 22+ Componentes de Costo│ │
 │   │ • 15 Categorías B2B   │   │   divisa (BRL/ARS/BOB)│  │ • Merma Compuesta 6 Pasos  │ │
 │   │ • Baterías Congeladas │   │ • Ponderación Fuente  │  │ • Cuello de Botella Línea  │ │
 │   │ • Pre-flight Budget   │   │ • Benchmarks Estadíst.│  │ • Simulador What-If        │ │
 │   │ • Score (50/35/15)    │   │ • Maestro Fabricantes │  │ • 7 Estrategias de Precio  │ │
 │   └───────────┬───────────┘   └───────────┬───────────┘  └─────────────┬──────────────┘ │
 │               │                           │                            │                │
 │               └───────────────────────────┼────────────────────────────┘                │
 │                                           │                                             │
 │                                           ▼                                             │
 │                         4. RFQ INTELLIGENCE & GMAIL                                     │
 │                         ┌─────────────────────────────────────────┐                     │
 │                         │ • Descubrimiento Asistido Proveedores   │                     │
 │                         │ • Especificaciones Técnicas RFQ         │                     │
 │                         │ • Despacho Seguro (Human-in-the-Loop)   │                     │
 │                         │ • Extracción Automática de Cotizaciones │                     │
 │                         └────────────────────┬────────────────────┘                     │
 │                                              │                                          │
 │                                              ▼                                          │
 │                         5. MATRIZ ESTRATÉGICA & ACTION CENTER                           │
 │                         ┌─────────────────────────────────────────┐                     │
 │                         │ • Matriz País × SKU con Gap Comercial   │                     │
 │                         │ • Centro de Acciones con Dueño y Plazo  │                     │
 │                         │ • 5 Reportes Ejecutivos para Directorio │                     │
 │                         └─────────────────────────────────────────┘                     │
 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Coexistencia con el Sitio Web Público

Este repositorio aloja simultáneamente el sitio web público institucional de NIUPACK (para GitHub Pages en la raíz) y la plataforma interna NIU Intelligence OS:
- **Sitio Web Público (Raíz):** `index.html`, `pt.html`, `en.html`, `assets/`, `css/`, `js/` — **Permanece 100% intacto e inalterado.**
- **NIU Intelligence OS:** Implementado en la carpeta `src/` utilizando **Next.js 15 App Router** y empaquetado autónomo sin colisión con los archivos estáticos.

---

## 4. Requisitos Previos y Pila Tecnológica

- **Node.js:** v18.18+ (recomendado v20+ o v24+)
- **Framework:** Next.js 15 (App Router, Server Components + Client Islands)
- **Lenguaje:** TypeScript 5.7 (Modo estricto verificado)
- **Estilos:** Tailwind CSS 3.4 (Paleta NIUPACK: Rojo Corporativo `#e30613`, Slate Dark `#0c0f14`, números tabulares)
- **Persistencia:** Capa de Repositorio unificada con soporte dual:
  1. Base de datos PostgreSQL en **Supabase** (37 tablas con Row Level Security).
  2. Almacén in-memory reactivo (`global.__niu_store`) pre-poblado con datos reales del catálogo NIUPACK para desarrollo y pruebas inmediatas sin dependencias externas.
- **Testing:** Vitest 3.2 (10 suites, 38 tests automatizados).

---

## 5. Instalación y Puesta en Marcha Local

### Método Rápido (Windows - 1 Clic):
Hacer doble clic sobre el archivo ejecutable:
```bat
INICIAR_NIU_OS.bat   (o start.bat)
```
*Este script verifica automáticamente Node.js, crea el archivo `.env.local` si no existe, instala dependencias si es necesario, levanta el servidor y abre el navegador automáticamente en `http://localhost:3000`.*

---

### Método Manual por Terminal:

1. **Clonar o navegar al directorio del proyecto:**
```bash
cd niupack
```

2. **Instalar dependencias:**
```bash
npm install
```

### 3. Configurar variables de entorno (Opcional):
Copiar la plantilla de ejemplo:
```bash
cp .env.example .env.local
```
*Nota: Si no se configuran variables de entorno, el sistema activa automáticamente los fallbacks hiperrealistas y el repositorio in-memory sin bloquear ninguna funcionalidad.*

### 4. Ejecutar el servidor de desarrollo:
```bash
npm run dev
```
Abrir el navegador en: **`http://localhost:3000`**

### 5. Comandos de Verificación y Calidad:
```bash
# Ejecutar suite de pruebas unitarias e integración (38 tests)
npm run test

# Verificar tipado estricto TypeScript
npm run typecheck

# Compilar para producción
npm run build

# Iniciar servidor de producción compilado
npm run start
```

---

## 6. Configuración de Variables de Entorno (`.env.local`)

```env
# ==========================================
# 1. OPENAI API (Grounded Search & Visibility)
# ==========================================
# Si está ausente, el sistema opera en MODO SIMULADO hiperrealista.
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL_VISIBILITY=gpt-4o
OPENAI_MODEL_ANALYSIS=gpt-4o-mini

# ==========================================
# 2. SUPABASE POSTGRESQL (Persistencia permanente)
# ==========================================
# Si está ausente, el sistema usa el repositorio en memoria con seed real.
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# ==========================================
# 3. GMAIL API (RFQ Communications)
# ==========================================
# Si está ausente, reporta BLOCKED_EXTERNAL_CREDENTIAL y usa bandeja simulada.
GMAIL_CLIENT_ID=your-google-oauth-client-id
GMAIL_CLIENT_SECRET=your-google-oauth-client-secret
GMAIL_REFRESH_TOKEN=your-google-oauth-refresh-token
GMAIL_USER_EMAIL=inteligencia@niupack.com.py

# ==========================================
# 4. PARÁMETROS OPERATIVOS
# ==========================================
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## 7. Estructura del Código Fuente

```
niupack/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx                    # Executive Dashboard
│   │   │   ├── strategy/                   # Matriz Estratégica País × SKU
│   │   │   ├── actions/                    # Centro de Acciones
│   │   │   ├── visibility/                 # Módulo 1: AI Visibility (Generator, Batteries, Runs, Competitors, Sources, Discovery)
│   │   │   ├── market/                     # Módulo 2: Precios, Fabricantes y Benchmarks
│   │   │   ├── cost/                       # Módulo 3: SKUs, Cost Sheets, Procesos, Escenarios, Eficiencia, Pricing
│   │   │   ├── rfq/                        # Módulo 4: RFQ Discovery, Specs, Inbox Gmail y Quotes
│   │   │   ├── reports/                    # 5 Reportes Ejecutivos para Directorio
│   │   │   └── settings/                   # Presupuesto, Cuotas OpenAI y Auditoría
│   │   └── api/                            # 20+ Endpoints REST API
│   ├── components/
│   │   ├── ui/                             # Button, Badge, DataTable, KPICard, Modal
│   │   └── navigation/                     # Sidebar y Topbar
│   ├── lib/
│   │   ├── db/                             # Supabase client, repository layer y seed-data
│   │   ├── engines/                        # Visibility, MarketBenchmark, TrueCost, Scenario, Pricing Engines
│   │   ├── openai/                         # OpenAIService con pre-flight budget y call logs
│   │   ├── gmail/                          # GmailClient con Human-in-the-Loop policy
│   │   ├── jobs/                           # JobRunner con idempotencia y reintentos
│   │   └── utils/                          # CSV export/import, dedupe de queries y checksums
│   └── types/                              # Definiciones de dominio TypeScript
├── supabase/
│   ├── migrations/                         # 20260925000000_initial_schema.sql (37 tablas RLS)
│   └── seed.sql                            # Datos iniciales para PostgreSQL
├── tests/                                  # 10 Archivos de pruebas Vitest (100% passing)
├── IMPLEMENTATION_STATUS.md                # Certificación técnica de entrega
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## 8. Licencia y Confidencialidad

Sistema de uso interno exclusivo desarrollado para **GARDINER S.A. / NIUPACK**. Todos los derechos reservados.
