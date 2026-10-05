import type { Product, ProductAttribute } from '@/types';
import type { ToolResult } from '../types';

export type CatalogMatchStatus = 'EXACT' | 'MULTIPLE' | 'NONE';

export interface CatalogItem {
  sku: string;
  productId: string;
  productName: string;
  category: Product['category'];
  description?: string | null;
  sizeOz?: number | null;
  sizeMl?: number | null;
  material?: string | null;
  coating?: string | null;
  wallType: ProductAttribute['wall_type'];
  compatibleLids?: string | null;
}

export interface CatalogSearchResult {
  match: CatalogMatchStatus;
  items: CatalogItem[];
  categories: string[];
}

const normalize = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, ' ')
    .trim();

function categoryFromQuery(query: string): Product['category'] | null {
  const q = normalize(query);
  if (/\b(vaso|vasos|copo|copos|cup|cups|polipapel)\b/.test(q)) return 'cups';
  if (/\b(tapa|tapas|tampa|tampas|lid|lids)\b/.test(q)) return 'lids';
  if (/\b(pote|potes|bowl|bowls)\b/.test(q)) return 'bowls';
  if (/\b(bandeja|bandejas|tray|trays)\b/.test(q)) return 'trays';
  if (/\b(termoform|cuna|cunas|berco|bercos)\b/.test(q)) return 'thermoformed';
  return null;
}

function capacityFromQuery(query: string): { oz?: number; ml?: number } {
  const oz = query.match(/(\d+(?:[.,]\d+)?)\s*oz\b/i);
  if (oz) return { oz: Number(oz[1].replace(',', '.')) };
  const ml = query.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (ml) return { ml: Number(ml[1].replace(',', '.')) };
  return {};
}

function wallFromQuery(query: string): ProductAttribute['wall_type'] | null {
  const q = normalize(query);
  if (/\b(doble pared|pared doble|double wall|parede dupla|dupla)\b/.test(q)) return 'double';
  if (/\b(pared simple|simple pared|single wall|parede simples|simples)\b/.test(q)) return 'single';
  return null;
}

function toItem(product: Product, sku: ProductAttribute): CatalogItem {
  return {
    sku: sku.sku,
    productId: product.id,
    productName: product.name,
    category: product.category,
    description: product.description ?? null,
    sizeOz: sku.size_oz ?? null,
    sizeMl: sku.size_ml ?? null,
    material: sku.material ?? null,
    coating: sku.coating ?? null,
    wallType: sku.wall_type,
    compatibleLids: sku.compatible_lids ?? null,
  };
}

async function loadCatalog(organizationId: string): Promise<{ items: CatalogItem[]; categories: string[] }> {
  const { repository } = await import('@/lib/db/repository');
  const [products, skus] = await Promise.all([
    repository.getProducts(organizationId),
    repository.getSKUs(organizationId),
  ]);
  const active = products.filter((p) => p.is_active !== false);
  const byId = new Map(active.map((p) => [p.id, p]));
  const items = skus
    .map((sku) => {
      const product = byId.get(sku.product_id);
      return product ? toItem(product, sku) : null;
    })
    .filter((item): item is CatalogItem => Boolean(item));
  const categories = [...new Set(active.map((p) => p.name))];
  return { items, categories };
}

/**
 * Consulta READ ONLY del Maestro de Productos/SKU.
 * Nunca expone MOQ, costos, precios, stock, lead time ni datos de True Cost.
 */
export async function searchProducts(query: string, organizationId?: string): Promise<ToolResult<CatalogSearchResult>> {
  try {
    if (!organizationId) return { status: 'UNAVAILABLE', message: 'Sin organización' };
    const catalog = await loadCatalog(organizationId);
    if (catalog.items.length === 0) return { status: 'UNAVAILABLE', message: 'Catálogo no configurado' };

    const q = normalize(query);
    const category = categoryFromQuery(query);
    const capacity = capacityFromQuery(query);
    const wall = wallFromQuery(query);

    const exactSku = catalog.items.find((item) => normalize(item.sku) === q || q.includes(normalize(item.sku)));
    if (exactSku) {
      return { status: 'OK', data: { match: 'EXACT', items: [exactSku], categories: catalog.categories } };
    }

    let matches = [...catalog.items];
    let constrained = false;
    if (category) {
      constrained = true;
      matches = matches.filter((item) => item.category === category);
    }
    if (typeof capacity.oz === 'number') {
      constrained = true;
      matches = matches.filter((item) => item.sizeOz === capacity.oz);
    }
    if (typeof capacity.ml === 'number') {
      constrained = true;
      matches = matches.filter((item) => item.sizeMl === capacity.ml);
    }
    if (wall) {
      constrained = true;
      matches = matches.filter((item) => item.wallType === wall);
    } else if ((typeof capacity.oz === 'number' || typeof capacity.ml === 'number') && matches.length > 1) {
      const singleWall = matches.filter((item) => item.wallType === 'single');
      if (singleWall.length === 1 && matches.some((item) => item.wallType === 'double')) {
        matches = singleWall;
      }
    }

    if (!constrained && q) {
      const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
      if (tokens.length) {
        const scored = matches
          .map((item) => {
            const haystack = normalize([
              item.sku,
              item.productName,
              item.description,
              item.material,
              item.coating,
              item.compatibleLids,
              item.wallType,
              item.sizeOz ? `${item.sizeOz} oz` : '',
              item.sizeMl ? `${item.sizeMl} ml` : '',
            ].join(' '));
            const score = tokens.filter((t) => haystack.includes(t)).length;
            return { item, score };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score);
        if (scored.length) matches = scored.filter((x) => x.score === scored[0].score).map((x) => x.item);
      }
    }

    matches = matches.slice(0, 8);
    return {
      status: 'OK',
      data: {
        match: matches.length === 0 ? 'NONE' : matches.length === 1 ? 'EXACT' : 'MULTIPLE',
        items: matches,
        categories: catalog.categories,
      },
    };
  } catch {
    return { status: 'UNAVAILABLE', message: 'Catálogo no disponible' };
  }
}

export async function getProductSpec(skuCode: string, organizationId?: string): Promise<ToolResult<CatalogItem>> {
  try {
    if (!organizationId) return { status: 'UNAVAILABLE', message: 'Sin organización' };
    const catalog = await loadCatalog(organizationId);
    const item = catalog.items.find((row) => normalize(row.sku) === normalize(skuCode));
    if (!item) return { status: 'UNAVAILABLE', message: 'SKU no encontrado en el catálogo vigente' };
    return { status: 'OK', data: item };
  } catch {
    return { status: 'UNAVAILABLE', message: 'Catálogo no disponible' };
  }
}
