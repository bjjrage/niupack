import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PUBLIC_SITE_URL,
  getPublicSiteConfig,
  getPublicSiteUrl,
  resolvePublicSiteAssetUrl,
} from '@/lib/config/public-site';
import { SearchDiscoveryService } from '@/lib/discovery/search-discovery';

const originalPublicSiteUrl = process.env.PUBLIC_SITE_URL;

function fakeResponse(status: number, body: string): Response {
  return {
    status,
    text: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalPublicSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = originalPublicSiteUrl;
});

describe('public discovery target resolution', () => {
  it('resolves GitHub Pages assets below the repository subpath', () => {
    const config = getPublicSiteConfig('https://bjjrage.github.io/niupack/');

    expect(config.publicSiteUrl).toBe('https://bjjrage.github.io/niupack/');
    expect(config.robotsUrl).toBe('https://bjjrage.github.io/niupack/robots.txt');
    expect(config.sitemapUrl).toBe('https://bjjrage.github.io/niupack/sitemap.xml');
    expect(resolvePublicSiteAssetUrl(config.publicSiteUrl, '/robots.txt')).toBe(config.robotsUrl);
  });

  it('uses PUBLIC_SITE_URL as the live target and keeps the future domain separate', async () => {
    delete process.env.PUBLIC_SITE_URL;
    const config = getPublicSiteConfig();
    expect(config.publicSiteUrl).toBe(DEFAULT_PUBLIC_SITE_URL);
    expect(getPublicSiteUrl()).toBe(DEFAULT_PUBLIC_SITE_URL);

    const html = `
      <html><head>
        <title>NIUPACK | Packaging industrial</title>
        <meta name="description" content="Fabricante industrial de packaging." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href="https://niupack.com.py/" />
        <link rel="alternate" hreflang="es" href="https://bjjrage.github.io/niupack/" />
        <script type="application/ld+json">{"@type":"Organization","name":"NIUPACK"}</script>
        <script type="application/ld+json">{"@type":"WebSite","url":"https://bjjrage.github.io/niupack/"}</script>
      </head><body>
        <h1>Packaging industrial</h1>
        <a href="/niupack/pt.html">Português</a>
        <img src="logo.png" alt="NIUPACK" />
      </body></html>`;
    const robots = `User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: ${config.sitemapUrl}`;
    const sitemap = `<urlset><url><loc>${config.publicSiteUrl}</loc></url><url><loc>${config.publicSiteUrl}pt.html</loc></url></urlset>`;

    const fetchMock = vi.fn(async (request: string) => {
      if (request === config.publicSiteUrl) return fakeResponse(200, html);
      if (request === config.robotsUrl) return fakeResponse(200, robots);
      if (request === config.sitemapUrl) return fakeResponse(200, sitemap);
      return fakeResponse(404, '');
    });
    vi.stubGlobal('fetch', fetchMock);

    const check = await SearchDiscoveryService.checkDomain();

    expect(check.url).toBe(config.publicSiteUrl);
    expect(check.robots_url).toBe(config.robotsUrl);
    expect(check.sitemap_url).toBe(config.sitemapUrl);
    expect(check.live_accessibility_status).toBe('GREEN');
    expect(check.ai_crawler_status).toBe('GREEN');
    expect(check.future_domain_status).toBe('NOT_LIVE');
    expect(check.canonical_classification).toBe('FUTURE_CANONICAL_DOMAIN');
    expect(check.overall_status).not.toBe('RED');
    expect(check.technical_checks.organization_schema).toBe(true);
    expect(check.technical_checks.website_schema).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('https://niupack.com.py/');
  });

  it('switches the audit target when PUBLIC_SITE_URL changes', () => {
    process.env.PUBLIC_SITE_URL = 'https://www.niupack.com.py/';
    const config = getPublicSiteConfig();

    expect(config.publicSiteUrl).toBe('https://www.niupack.com.py/');
    expect(config.robotsUrl).toBe('https://www.niupack.com.py/robots.txt');
    expect(config.sitemapUrl).toBe('https://www.niupack.com.py/sitemap.xml');
  });
});
