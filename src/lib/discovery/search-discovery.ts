import { SearchDiscoveryCheck } from '@/types';

export class SearchDiscoveryService {
  /**
   * Run real accessibility, robots.txt and sitemap audit for NIUPACK official domain
   */
  public static async checkDomain(targetUrl: string = 'https://niupack.com.py'): Promise<SearchDiscoveryCheck> {
    const warnings: string[] = [];
    let accessible = false;
    let httpStatus = 0;
    let robotsTxtExists = false;
    let oaiSearchbotAllowed = false;
    let sitemapExists = false;
    let canonicalUrl: string | undefined = targetUrl;

    try {
      // 1. Check primary website accessibility
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NIU-Intelligence-OS/1.0; +https://niupack.com.py)',
        },
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeoutId);

      if (res && res.status < 400) {
        accessible = true;
        httpStatus = res.status;
      } else {
        httpStatus = res ? res.status : 0;
        warnings.push(`El sitio web principal no respondió con HTTP 200 (código: ${httpStatus || 'Timeout/Inaccesible'}).`);
      }

      // 2. Check robots.txt
      const robotsUrl = new URL('/robots.txt', targetUrl).toString();
      const robotsRes = await fetch(robotsUrl, { method: 'GET' }).catch(() => null);

      if (robotsRes && robotsRes.ok) {
        robotsTxtExists = true;
        const robotsText = await robotsRes.text();
        // Check if OAI-SearchBot is blocked or allowed
        if (robotsText.includes('OAI-SearchBot') || robotsText.includes('ChatGPT-User') || robotsText.includes('GPTBot')) {
          const isDisallowed = robotsText.includes('Disallow: /') && robotsText.includes('OAI-SearchBot');
          oaiSearchbotAllowed = !isDisallowed;
          if (isDisallowed) {
            warnings.push('robots.txt bloquea explícitamente a OAI-SearchBot.');
          }
        } else {
          // If no explicit block, default is allowed
          oaiSearchbotAllowed = true;
          warnings.push('robots.txt no contiene directiva explícita para OAI-SearchBot (por defecto permitido, pero se recomienda incluirlo explícitamente).');
        }
      } else {
        warnings.push('No se encontró archivo robots.txt en la raíz del dominio.');
      }

      // 3. Check sitemap.xml
      const sitemapUrl = new URL('/sitemap.xml', targetUrl).toString();
      const sitemapRes = await fetch(sitemapUrl, { method: 'GET' }).catch(() => null);
      if (sitemapRes && sitemapRes.ok) {
        sitemapExists = true;
      } else {
        warnings.push('No se detectó sitemap.xml público en el dominio.');
      }
    } catch (err) {
      warnings.push(`Error de verificación de red: ${(err as Error).message}`);
    }

    // Determine status: GREEN, YELLOW, RED
    let overallStatus: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
    if (!accessible || !oaiSearchbotAllowed) {
      overallStatus = 'RED';
    } else if (warnings.length > 0 || !robotsTxtExists || !sitemapExists) {
      overallStatus = 'YELLOW';
    }

    return {
      url: targetUrl,
      accessible,
      http_status: httpStatus,
      robots_txt_exists: robotsTxtExists,
      oai_searchbot_allowed: oaiSearchbotAllowed,
      sitemap_exists: sitemapExists,
      canonical_url: canonicalUrl,
      last_checked: new Date().toISOString(),
      overall_status: overallStatus,
      warnings,
    };
  }
}
