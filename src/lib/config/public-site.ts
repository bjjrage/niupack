export const DEFAULT_PUBLIC_SITE_URL = 'https://bjjrage.github.io/niupack/';
export const DEFAULT_FUTURE_CANONICAL_DOMAIN = 'https://niupack.com.py/';

function normalizeUrl(value: string, fallback: string): string {
  const candidate = value.trim() || fallback;
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  const url = new URL(withProtocol);

  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }

  return url.toString();
}

export function getPublicSiteUrl(value?: string | null): string {
  return normalizeUrl(value ?? process.env.PUBLIC_SITE_URL ?? '', DEFAULT_PUBLIC_SITE_URL);
}

export function getFutureCanonicalDomain(value?: string | null): string {
  return normalizeUrl(
    value ?? process.env.FUTURE_CANONICAL_DOMAIN ?? '',
    DEFAULT_FUTURE_CANONICAL_DOMAIN
  );
}

/**
 * Resolve a public-site asset without dropping a GitHub Pages repository path.
 * The configured site URL is intentionally normalized with a trailing slash so
 * `robots.txt` resolves to `/niupack/robots.txt`, not `/robots.txt`.
 */
export function resolvePublicSiteAssetUrl(siteUrl: string, assetName: string): string {
  const relativeAsset = assetName.replace(/^\/+/, '');
  return new URL(relativeAsset, getPublicSiteUrl(siteUrl)).toString();
}

export interface PublicSiteConfig {
  publicSiteUrl: string;
  futureCanonicalDomain: string;
  robotsUrl: string;
  sitemapUrl: string;
}

export function getPublicSiteConfig(siteUrl?: string | null): PublicSiteConfig {
  const publicSiteUrl = getPublicSiteUrl(siteUrl);

  return {
    publicSiteUrl,
    futureCanonicalDomain: getFutureCanonicalDomain(),
    robotsUrl: resolvePublicSiteAssetUrl(publicSiteUrl, 'robots.txt'),
    sitemapUrl: resolvePublicSiteAssetUrl(publicSiteUrl, 'sitemap.xml'),
  };
}
