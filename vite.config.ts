/// <reference types="vitest/config" />
import path from 'path';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';

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
        if (siteUrl) {
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
