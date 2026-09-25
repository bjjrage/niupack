-- ====================================================================
-- NIU INTELLIGENCE OS - SEED DATA
-- Organization, Brand, Markets, NIUPACK Product Catalog & Real Process Steps
-- ====================================================================

-- 1. Default Organization
INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'NIUPACK Packaging Operations', 'niupack-ops')
ON CONFLICT (id) DO NOTHING;

-- 2. System Settings
INSERT INTO system_settings (
    id, organization_id, max_queries_per_run, max_concurrency,
    max_spend_per_run_usd, max_monthly_spend_usd, current_month_spend_usd,
    openai_model_visibility, openai_model_analysis, gmail_connected
)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    2000, 5, 25.00, 250.00, 0.00,
    'gpt-4o', 'gpt-4o-mini', false
)
ON CONFLICT (organization_id) DO NOTHING;

-- 3. Default Brand: NIU PACK (GARDINER S.A.)
INSERT INTO brands (
    id, organization_id, name, legal_name, country_of_origin,
    website_url, description, is_primary
)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'NIU PACK',
    'GARDINER S.A.',
    'Paraguay',
    'https://niupack.com.py',
    'Fabricante industrial de vasos, envases y termoformados para alimentos, bebidas y farmacéutica con certificación internacional FSSC 22000 SGS.',
    true
)
ON CONFLICT (id) DO NOTHING;

-- 4. Target Markets (BR, AR, BO, and Control Market PY)
INSERT INTO markets (id, organization_id, code, name, primary_city, currency, timezone, is_active, is_control)
VALUES
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'BR', 'Brasil', 'São Paulo', 'USD', 'America/Sao_Paulo', true, false),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'AR', 'Argentina', 'Buenos Aires', 'USD', 'America/Argentina/Buenos_Aires', true, false),
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'BO', 'Bolivia', 'Santa Cruz', 'USD', 'America/La_Paz', true, false),
    ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'PY', 'Paraguay', 'Asunción', 'USD', 'America/Asuncion', true, true)
ON CONFLICT DO NOTHING;

-- 5. Products & Product Attributes (Full NIUPACK Catalog)
-- Product: Vasos Polipapel (Cups)
INSERT INTO products (id, organization_id, brand_id, code, name, category, description, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'PROD-CUPS',
    'Vasos de Polipapel',
    'cups',
    'Vasos de polipapel para bebidas frías y calientes, pared simple y doble con recubrimiento PE y certificación FSSC 22000.',
    true
)
ON CONFLICT DO NOTHING;

-- Product: Tapas Plásticas
INSERT INTO products (id, organization_id, brand_id, code, name, category, description, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'PROD-LIDS',
    'Tapas Plásticas para Vasos',
    'lids',
    'Tapas herméticas para consumo en tienda, delivery y take away con y sin pico para café y bebidas frías.',
    true
)
ON CONFLICT DO NOTHING;

-- Product: Potes y Bowls
INSERT INTO products (id, organization_id, brand_id, code, name, category, description, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'PROD-BOWLS',
    'Potes y Bowls de Polipapel',
    'bowls',
    'Soluciones para helados, postres y alimentos preparados de alto consumo.',
    true
)
ON CONFLICT DO NOTHING;

-- Product: Bandejas para Alimentos
INSERT INTO products (id, organization_id, brand_id, code, name, category, description, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000023',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'PROD-TRAYS',
    'Bandejas de Cartón para Alimentos',
    'trays',
    'Bandejas para presentación, empaque y despacho gastronómico.',
    true
)
ON CONFLICT DO NOTHING;

-- Product: Termoformados
INSERT INTO products (id, organization_id, brand_id, code, name, category, description, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000024',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'PROD-THERMO',
    'Termoformados Industriales',
    'thermoformed',
    'Cunas para cookies, cunas para ampollas y panales para aplicaciones alimenticias y farmacéuticas.',
    true
)
ON CONFLICT DO NOTHING;

-- SKUs for Vasos
INSERT INTO product_attributes (
    id, product_id, sku, size_oz, size_ml, height_mm, top_diameter_mm,
    bottom_diameter_mm, material, paper_weight_gsm, coating, wall_type,
    max_colors, pack_quantity, carton_quantity, compatible_lids, moq, notes
)
VALUES
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020', 'CUP-4OZ-SW', 4, 120, 62, 62, 45, 'Cartulina Cupstock', 190, '1 PE', 'single', 4, 50, 1000, 'LID-4OZ', 10000, 'Café espresso, degustaciones'),
    ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000020', 'CUP-8OZ-SW', 8, 240, 92, 80, 56, 'Cartulina Cupstock', 230, '1 PE', 'single', 4, 50, 1000, 'LID-8OZ-PICO', 10000, 'Café latte, té caliente'),
    ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000020', 'CUP-12OZ-SW', 12, 360, 110, 90, 60, 'Cartulina Cupstock', 260, '1 PE', 'single', 4, 50, 1000, 'LID-12OZ-PICO', 10000, 'Formato principal cafetería y bebidas frías'),
    ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000020', 'CUP-16OZ-SW', 16, 480, 135, 90, 60, 'Cartulina Cupstock', 280, '1 PE / 2 PE', 'single', 4, 50, 1000, 'LID-16OZ-PICO', 10000, 'Bebidas grandes y smoothies'),
    ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000020', 'CUP-12OZ-DW', 12, 360, 112, 90, 60, 'Cartulina Doble Pared', 260, '1 PE + aislante', 'double', 4, 25, 500, 'LID-12OZ-PICO', 15000, 'Aislación térmica prémium sin faja')
ON CONFLICT DO NOTHING;

-- 6. Initial Frozen Query Battery (Reference Version 1)
INSERT INTO query_batteries (
    id, organization_id, name, code, description, version,
    is_frozen, frozen_at, query_count, market_codes, status
)
VALUES (
    '00000000-0000-0000-0000-000000000040',
    '00000000-0000-0000-0000-000000000001',
    'Batería Congelada de Visibilidad Regional V1',
    'BRAND_VISIBILITY_BR_AR_BO_V1',
    'Batería auditada y congelada para medir visibilidad en Día 1, Día 15 y Día 30 en Brasil, Argentina, Bolivia y control Paraguay.',
    1,
    true,
    NOW(),
    15,
    ARRAY['BR', 'AR', 'BO', 'PY'],
    'FROZEN'
)
ON CONFLICT DO NOTHING;

-- Sample queries in frozen battery across 15 categories
INSERT INTO queries (
    id, battery_id, organization_id, text, language, country_code,
    city_context, intent, category, sku, buyer_persona, commercial_priority,
    generated_by, is_fixed, version, status
)
VALUES
    ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'Quais fabricantes de copos personalizados existem no Mercosul?', 'pt', 'BR', 'São Paulo', 'proveedor_regional', 'proveedor', 'CUP-12OZ-SW', 'Gerente de Compras Food Service', 'HIGH', 'MANUAL', true, 1, 'ACTIVE'),
    ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'Fornecedor de copos de papel para redes de cafeterias no Brasil', 'pt', 'BR', 'São Paulo', 'food_service_scale', 'food service', 'CUP-8OZ-SW', 'Director de Operaciones Franquicias', 'HIGH', 'MANUAL', true, 1, 'ACTIVE'),
    ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'Fabricantes de copos descartáveis personalizados no Paraguai que exportam para o Brasil', 'pt', 'BR', 'São Paulo', 'importacion_regional', 'importacion/exportacion', 'CUP-12OZ-SW', 'Comprador B2B Cadenas', 'HIGH', 'MANUAL', true, 1, 'ACTIVE'),
    ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'Proveedores de vasos de papel polipapel para Argentina por mayor', 'es', 'AR', 'Buenos Aires', 'mayorista_volumen', 'mayorista', 'CUP-12OZ-SW', 'Distribuidor Mayorista Packaging', 'HIGH', 'MANUAL', true, 1, 'ACTIVE'),
    ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'Fabricantes de vasos descartables de papel con certificación FSSC 22000 en el Cono Sur', 'es', 'AR', 'Buenos Aires', 'certificacion_calidad', 'fabricante', 'CUP-12OZ-DW', 'Jefe de Calidad Industria Alimenticia', 'HIGH', 'MANUAL', true, 1, 'ACTIVE'),
    ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'Fabricantes de packaging que puedan abastecer Bolivia en vasos térmicos', 'es', 'BO', 'Santa Cruz', 'suministro_regional', 'suministro regional', 'CUP-16OZ-SW', 'Gerente de Cadena Gastronómica', 'HIGH', 'MANUAL', true, 1, 'ACTIVE'),
    ('00000000-0000-0000-0000-000000000056', '00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'Fabrica de vasos polipapel en Paraguay NIU PACK Gardiner', 'es', 'PY', 'Asunción', 'marca_control', 'producto', 'CUP-12OZ-SW', 'Comprador Local', 'MEDIUM', 'MANUAL', true, 1, 'ACTIVE')
ON CONFLICT DO NOTHING;

-- 7. Real Process Definitions & Steps (NIUPACK Industrial Plant)
INSERT INTO process_definitions (id, organization_id, sku, name, description, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000060',
    '00000000-0000-0000-0000-000000000001',
    'CUP-12OZ-SW',
    'Línea de Formado Industrial Vaso 12 oz Polipapel',
    'Proceso productivo integrado continuo desde bobina de cartulina hasta packaging y paletizado en planta industrial Asunción.',
    true
)
ON CONFLICT DO NOTHING;

INSERT INTO process_steps (
    id, process_id, step_order, name, machine_name, operators_count,
    cycle_time_seconds, setup_time_minutes, capacity_units_per_hour,
    energy_kwh_per_hour, hourly_cost_usd, scrap_rate_percent, yield_percent, is_bottleneck, notes
)
VALUES
    ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000060', 1, 'Recepción e Inspección de Bobinas', 'Montacargas y Báscula Digital', 1, 0.10, 15, 20000, 4.00, 18.00, 0.50, 99.50, false, 'Chequeo gramaje y tensión'),
    ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000060', 2, 'Impresión Flexográfica 4 Colores', 'Flexográfica Central Impression 6C', 2, 0.40, 60, 9000, 28.00, 65.00, 2.50, 97.50, false, 'Tintas base acuosa para alimentos'),
    ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000060', 3, 'Troquelado Automático de Abanicos', 'Troqueladora Rotativa Automática', 1, 0.30, 45, 12000, 18.00, 40.00, 1.80, 98.20, false, 'Separación de abanicos y reciclado de recortes'),
    ('00000000-0000-0000-0000-000000000073', '00000000-0000-0000-0000-000000000060', 4, 'Formado y Sellado Ultrasónico', 'Formadora Automática de Vasos Alta Velocidad', 1, 0.65, 40, 5500, 22.00, 52.00, 2.20, 97.80, true, 'Cuello de botella de la línea'),
    ('00000000-0000-0000-0000-000000000074', '00000000-0000-0000-0000-000000000060', 5, 'Control de Calidad & Hermeticidad', 'Cámara Óptica y Banco de Vacío FSSC 22000', 1, 0.20, 10, 18000, 6.00, 22.00, 0.40, 99.60, false, 'Detección automática de microporos'),
    ('00000000-0000-0000-0000-000000000075', '00000000-0000-0000-0000-000000000060', 6, 'Enfundado y Encartonado', 'Enfundadora y Selladora de Cajas', 1, 0.25, 15, 15000, 8.00, 20.00, 0.20, 99.80, false, 'Cajas corrugadas de 1.000 unidades')
ON CONFLICT DO NOTHING;
