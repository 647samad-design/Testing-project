/// <reference types="vitest/config" />
import path from 'path';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const SITEMAP_LANGS = ['en', 'es', 'pt', 'ht', 'ru'];

/** One <url> per page per language, each listing all language versions
 * (xhtml:link hreflang), so search engines index every translation. */
function expandSitemapLanguages(xml: string, siteUrl: string): string {
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const at = (lang: string, path: string) => `${siteUrl}${lang === 'en' ? path : path === '/' ? `/${lang}` : `/${lang}${path}`}`;
  const out = urls.flatMap((body) => {
    const loc = /<loc>__SITE_URL__([^<]*)<\/loc>/.exec(body);
    if (!loc) return [];
    const path = loc[1] || '/';
    const rest = body.replace(/<loc>[^<]*<\/loc>/, '').trim();
    const links = [...SITEMAP_LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${at(l, path)}"/>`),
      `<xhtml:link rel="alternate" hreflang="x-default" href="${at('en', path)}"/>`].join('');
    // Legal pages exist only in English (translated notice, English text).
    if (/^\/(privacy|terms|disclaimer)\b/.test(path)) return [`  <url><loc>${at('en', path)}</loc>${rest}</url>`];
    return SITEMAP_LANGS.map((l) => `  <url><loc>${at(l, path)}</loc>${links}${rest}</url>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${out.join('\n')}\n</urlset>\n`;
}

/** sitemap.xml and robots.txt need absolute URLs. They're written with
 * __SITE_URL__ and filled in at build time from VITE_SITE_URL (set it in the
 * hosting settings to the live address). Without it the sitemap is left out
 * rather than published with a wrong domain. */
function siteUrlFiles(siteUrl: string): Plugin {
  return {
    name: 'site-url-files',
    // index.html: absolute URLs for canonical / social tags (relative if unset;
    // the app also sets the canonical at runtime from the current address).
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_URL__', siteUrl);
    },
    closeBundle() {
      const out = path.resolve(__dirname, 'dist');
      for (const f of ['sitemap.xml', 'robots.txt']) {
        const p = path.join(out, f);
        if (!fs.existsSync(p)) continue;
        if (siteUrl && f === 'sitemap.xml') {
          fs.writeFileSync(p, expandSitemapLanguages(fs.readFileSync(p, 'utf8'), siteUrl));
        } else if (siteUrl) {
          fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('__SITE_URL__', siteUrl));
        } else if (f === 'sitemap.xml') {
          fs.rmSync(p);
        } else {
          fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split('\n').filter((l) => !l.includes('__SITE_URL__')).join('\n'));
        }
      }
      if (!siteUrl) console.warn('[site-url-files] VITE_SITE_URL is not set: sitemap.xml omitted, robots.txt has no Sitemap line.');
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), siteUrlFiles((loadEnv(mode, process.cwd(), '').VITE_SITE_URL ?? '').replace(/\/+$/, ''))],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
