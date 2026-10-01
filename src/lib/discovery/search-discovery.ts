import { getPublicSiteConfig, getPublicSiteUrl } from '@/lib/config/public-site';
import { SearchDiscoveryCheck } from '@/types';

type DiscoveryStatus = SearchDiscoveryCheck['overall_status'];

const EMPTY_TECHNICAL_CHECKS: SearchDiscoveryCheck['technical_checks'] = {
  http_accessible: false,
  response_code_ok: false,
  robots_txt: false,
  sitemap_xml: false,
  oai_searchbot_allowed: false,
  title: false,
  meta_description: false,
  h1: false,
  canonical: false,
  hreflang: false,
  organization_schema: false,
  website_schema: false,
  image_alt_coverage: false,
  internal_links: false,
  language_alternates: false,
  sitemap_urls: false,
  robots_sitemap_declaration: false,
  noindex_nofollow_absent: false,
  viewport: false,
  basic_seo_readiness: false,
};

function emptyCheck(message: string, url = 'No configurado'): SearchDiscoveryCheck {
  return {
    url,
    accessible: false,
    http_status: 0,
    robots_url: '',
    sitemap_url: '',
    robots_txt_exists: false,
    oai_searchbot_allowed: false,
    sitemap_exists: false,
    canonical_url: undefined,
    canonical_classification: 'MISSING',
    future_canonical_domain: '',
    live_accessibility_status: 'RED',
    ai_crawler_status: 'RED',
    seo_readiness_status: 'RED',
    future_domain_status: 'UNKNOWN',
    technical_checks: { ...EMPTY_TECHNICAL_CHECKS },
    h1_count: 0,
    image_count: 0,
    images_missing_alt: 0,
    internal_link_count: 0,
    hreflang_urls: [],
    sitemap_url_count: 0,
    robots_sitemap_declared: false,
    noindex_or_nofollow: false,
    last_checked: new Date().toISOString(),
    overall_status: 'YELLOW',
    warnings: [message],
  };
}

function getAttribute(tag: string, attribute: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1]?.trim();
}

function getMetaContent(html: string, name: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((candidate) => getAttribute(candidate, 'name')?.toLowerCase() === name);
  return tag ? getAttribute(tag, 'content') : undefined;
}

function getCanonicalUrl(html: string): string | undefined {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const canonical = tags.find((candidate) => getAttribute(candidate, 'rel')?.toLowerCase().split(/\s+/).includes('canonical'));
  return canonical ? getAttribute(canonical, 'href') : undefined;
}

function getHreflangUrls(html: string): string[] {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  return tags
    .filter((candidate) => Boolean(getAttribute(candidate, 'hreflang')))
    .map((candidate) => getAttribute(candidate, 'href'))
    .filter((href): href is string => Boolean(href));
}

function getJsonLdTypes(html: string): Set<string> {
  const types = new Set<string>();
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== 'object') return;

    const record = value as Record<string, unknown>;
    const type = record['@type'];
    if (typeof type === 'string') types.add(type.toLowerCase());
    if (Array.isArray(type)) type.filter((entry): entry is string => typeof entry === 'string').forEach((entry) => types.add(entry.toLowerCase()));
    collect(record['@graph']);
  };

  scripts.forEach((script) => {
    const body = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      collect(JSON.parse(body));
    } catch {
      // Invalid JSON-LD is reported as missing structured data, not as a crash.
    }
  });

  return types;
}

function isInternalLink(href: string, siteUrl: string): boolean {
  if (href.startsWith('#') || /^(mailto:|tel:|javascript:|data:)/i.test(href)) return false;
  try {
    const url = new URL(href, siteUrl);
    return url.origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}

function normalizeComparableUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim().replace(/\/$/, '');
  }
}

function canonicalClassification(
  canonicalUrl: string | undefined,
  liveUrl: string,
  futureUrl: string
): SearchDiscoveryCheck['canonical_classification'] {
  if (!canonicalUrl) return 'MISSING';

  try {
    const canonical = new URL(canonicalUrl, liveUrl);
    if (canonical.origin === new URL(futureUrl).origin) return 'FUTURE_CANONICAL_DOMAIN';
    if (canonical.origin === new URL(liveUrl).origin) return 'LIVE_SITE';
    return 'OTHER_DOMAIN';
  } catch {
    return 'OTHER_DOMAIN';
  }
}

function auditRobots(
  robotsText: string,
  robotsUrl: string,
  sitemapUrl: string
): { allowed: boolean; sitemapDeclared: boolean; explicitCrawlerRule: boolean } {
  const groups = robotsText.split(/\r?\n\s*\r?\n/);
  let blocked = false;
  let explicitCrawlerRule = false;

  for (const group of groups) {
    const agents = [...group.matchAll(/^\s*User-agent:\s*(.+)\s*$/gim)].map((match) => match[1].trim().toLowerCase());
    if (!agents.some((agent) => agent === '*' || agent === 'oai-searchbot' || agent === 'chatgpt-user' || agent === 'gptbot')) continue;
    if (agents.some((agent) => agent !== '*')) explicitCrawlerRule = true;

    const disallows = [...group.matchAll(/^\s*Disallow:\s*(.*)\s*$/gim)].map((match) => match[1].trim());
    const allows = [...group.matchAll(/^\s*Allow:\s*(.*)\s*$/gim)].map((match) => match[1].trim());
    if (disallows.includes('/') && !allows.includes('/')) blocked = true;
  }

  const sitemapDeclared = [...robotsText.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)]
    .map((match) => normalizeComparableUrl(match[1]))
    .includes(normalizeComparableUrl(sitemapUrl));

  void robotsUrl;
  return { allowed: !blocked, sitemapDeclared, explicitCrawlerRule };
}

function parseSitemap(sitemapText: string, siteUrl: string): { count: number; valid: boolean } {
  const urls = [...sitemapText.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
  const base = new URL(siteUrl);
  const valid = urls.length > 0 && urls.every((entry) => {
    try {
      const url = new URL(entry);
      return url.origin === base.origin && url.pathname.startsWith(base.pathname);
    } catch {
      return false;
    }
  });
  return { count: urls.length, valid };
}

async function fetchWithTimeout(url: string, userAgent: string): Promise<{ response: Response | null; body: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': userAgent },
      signal: controller.signal,
    });
    const body = typeof response.text === 'function' ? await response.text() : '';
    return { response, body };
  } catch {
    return { response: null, body: '' };
  } finally {
    clearTimeout(timeoutId);
  }
}

function rank(status: DiscoveryStatus): number {
  return status === 'RED' ? 3 : status === 'YELLOW' ? 2 : 1;
}

export class SearchDiscoveryService {
  /**
   * Audit the currently published public site. The optional argument exists for
   * deterministic tests and explicit operator audits; the normal UI path always
   * resolves PUBLIC_SITE_URL through the central public-site configuration.
   */
  public static async checkDomain(targetUrl?: string | null): Promise<SearchDiscoveryCheck> {
    if (targetUrl === '') {
      return emptyCheck('No hay dominio configurado para auditar; configure un sitio público.');
    }

    let config: ReturnType<typeof getPublicSiteConfig>;
    try {
      config = getPublicSiteConfig(targetUrl);
    } catch {
      return emptyCheck('La URL pública configurada no es válida.');
    }

    const warnings: string[] = [];
    const pageResultPromise = fetchWithTimeout(
      config.publicSiteUrl,
      `Mozilla/5.0 (compatible; NIU-Intelligence-OS/1.0; +${config.futureCanonicalDomain})`
    );
    const robotsResultPromise = fetchWithTimeout(config.robotsUrl, 'NIU-Intelligence-OS/1.0');
    const sitemapResultPromise = fetchWithTimeout(config.sitemapUrl, 'NIU-Intelligence-OS/1.0');
    const [pageResult, robotsResult, sitemapResult] = await Promise.all([
      pageResultPromise,
      robotsResultPromise,
      sitemapResultPromise,
    ]);

    const httpStatus = pageResult.response?.status || 0;
    const accessible = Boolean(pageResult.response && httpStatus < 400);
    const responseCodeOk = accessible;
    const robotsExists = Boolean(robotsResult.response && robotsResult.response.status < 400);
    const sitemapExists = Boolean(sitemapResult.response && sitemapResult.response.status < 400);

    if (!accessible) {
      warnings.push(`El sitio live no respondió con un código HTTP accesible (código: ${httpStatus || 'Timeout/Inaccesible'}).`);
    }

    const robotsAudit = robotsExists
      ? auditRobots(robotsResult.body, config.robotsUrl, config.sitemapUrl)
      : { allowed: true, sitemapDeclared: false, explicitCrawlerRule: false };
    const oaiSearchbotAllowed = robotsAudit.allowed;

    if (!robotsExists) {
      warnings.push('No se encontró robots.txt en la ruta pública del sitio live.');
    } else if (!robotsAudit.explicitCrawlerRule) {
      warnings.push('robots.txt no contiene una directiva explícita para OAI-SearchBot; por defecto no está bloqueado.');
    }

    if (!sitemapExists) warnings.push('No se detectó sitemap.xml en la ruta pública del sitio live.');
    if (robotsExists && !robotsAudit.sitemapDeclared) {
      warnings.push('robots.txt no declara el sitemap.xml del sitio auditado.');
    }

    const html = pageResult.body;
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const metaDescription = getMetaContent(html, 'description');
    const h1Count = (html.match(/<h1\b[^>]*>/gi) || []).length;
    const canonicalUrl = getCanonicalUrl(html);
    const hreflangUrls = getHreflangUrls(html);
    const jsonLdTypes = getJsonLdTypes(html);
    const imageTags = html.match(/<img\b[^>]*>/gi) || [];
    const imagesMissingAlt = imageTags.filter((tag) => !getAttribute(tag, 'alt')).length;
    const linkTags = html.match(/<a\b[^>]*>/gi) || [];
    const internalLinkCount = linkTags.filter((tag) => {
      const href = getAttribute(tag, 'href');
      return href ? isInternalLink(href, config.publicSiteUrl) : false;
    }).length;
    const noindexOrNofollow = /<meta\b[^>]*(?:name=["'](?:robots|googlebot)["'][^>]*content=["'][^"']*(?:noindex|nofollow)|content=["'][^"']*(?:noindex|nofollow)[^"']*["'][^>]*name=["'](?:robots|googlebot)["'])/i.test(html);
    const viewport = Boolean(getMetaContent(html, 'viewport'));
    const sitemapAudit = sitemapExists ? parseSitemap(sitemapResult.body, config.publicSiteUrl) : { count: 0, valid: false };
    const canonicalClass = canonicalClassification(canonicalUrl, config.publicSiteUrl, config.futureCanonicalDomain);

    if (!title) warnings.push('Falta la etiqueta <title>.');
    if (!metaDescription) warnings.push('Falta la meta description.');
    if (h1Count === 0) warnings.push('No se detectó un H1 principal.');
    if (!canonicalUrl) warnings.push('No se detectó una URL canonical.');
    if (canonicalClass === 'FUTURE_CANONICAL_DOMAIN') {
      warnings.push('La canonical apunta al dominio futuro; se clasifica como FUTURE_CANONICAL_DOMAIN y no como falla de accesibilidad live.');
    }
    if (hreflangUrls.length === 0) warnings.push('No se detectaron alternates hreflang/language.');
    if (!jsonLdTypes.has('organization')) warnings.push('No se detectó JSON-LD Organization.');
    if (!jsonLdTypes.has('website')) warnings.push('No se detectó JSON-LD WebSite.');
    if (imageTags.length > 0 && imagesMissingAlt > 0) warnings.push(`${imagesMissingAlt} imagen(es) no tienen atributo alt.`);
    if (internalLinkCount === 0) warnings.push('No se detectaron enlaces internos públicos.');
    if (!sitemapAudit.valid && sitemapExists) warnings.push('El sitemap contiene URLs fuera del sitio live auditado.');
    if (noindexOrNofollow) warnings.push('Se detectó noindex/nofollow accidental en la página auditada.');
    if (!viewport) warnings.push('Falta meta viewport para compatibilidad mobile.');

    const technicalChecks: SearchDiscoveryCheck['technical_checks'] = {
      http_accessible: accessible,
      response_code_ok: responseCodeOk,
      robots_txt: robotsExists,
      sitemap_xml: sitemapExists,
      oai_searchbot_allowed: oaiSearchbotAllowed,
      title: Boolean(title),
      meta_description: Boolean(metaDescription),
      h1: h1Count > 0,
      canonical: Boolean(canonicalUrl),
      hreflang: hreflangUrls.length > 0,
      organization_schema: jsonLdTypes.has('organization'),
      website_schema: jsonLdTypes.has('website'),
      image_alt_coverage: imagesMissingAlt === 0,
      internal_links: internalLinkCount > 0,
      language_alternates: hreflangUrls.length > 0,
      sitemap_urls: sitemapAudit.valid,
      robots_sitemap_declaration: robotsAudit.sitemapDeclared,
      noindex_nofollow_absent: !noindexOrNofollow,
      viewport,
      basic_seo_readiness: Boolean(title && metaDescription && h1Count > 0 && canonicalUrl && viewport && !noindexOrNofollow),
    };

    const liveStatus: DiscoveryStatus = accessible ? 'GREEN' : 'RED';
    const aiStatus: DiscoveryStatus = !accessible || !oaiSearchbotAllowed
      ? 'RED'
      : !robotsExists || !sitemapExists
        ? 'YELLOW'
        : 'GREEN';
    const seoCriticalFailure = !technicalChecks.basic_seo_readiness || !technicalChecks.noindex_nofollow_absent;
    const seoStatus: DiscoveryStatus = seoCriticalFailure
      ? 'RED'
      : canonicalClass === 'FUTURE_CANONICAL_DOMAIN' || warnings.length > 0
        ? 'YELLOW'
        : 'GREEN';
    const futureStatus: SearchDiscoveryCheck['future_domain_status'] =
      new URL(config.publicSiteUrl).origin === new URL(config.futureCanonicalDomain).origin ? 'LIVE' : 'NOT_LIVE';

    const overallStatus = [liveStatus, aiStatus, seoStatus].reduce((worst, current) =>
      rank(current) > rank(worst) ? current : worst
    ) as DiscoveryStatus;

    return {
      url: config.publicSiteUrl,
      accessible,
      http_status: httpStatus,
      robots_url: config.robotsUrl,
      sitemap_url: config.sitemapUrl,
      robots_txt_exists: robotsExists,
      oai_searchbot_allowed: oaiSearchbotAllowed,
      sitemap_exists: sitemapExists,
      canonical_url: canonicalUrl,
      canonical_classification: canonicalClass,
      future_canonical_domain: config.futureCanonicalDomain,
      live_accessibility_status: liveStatus,
      ai_crawler_status: aiStatus,
      seo_readiness_status: seoStatus,
      future_domain_status: futureStatus,
      technical_checks: technicalChecks,
      title,
      meta_description: metaDescription,
      h1_count: h1Count,
      image_count: imageTags.length,
      images_missing_alt: imagesMissingAlt,
      internal_link_count: internalLinkCount,
      hreflang_urls: hreflangUrls,
      sitemap_url_count: sitemapAudit.count,
      robots_sitemap_declared: robotsAudit.sitemapDeclared,
      noindex_or_nofollow: noindexOrNofollow,
      last_checked: new Date().toISOString(),
      overall_status: overallStatus,
      warnings,
    };
  }

  public static getConfiguredPublicSiteUrl(): string {
    return getPublicSiteUrl();
  }
}
