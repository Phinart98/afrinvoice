// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  // Keep in sync with SITE.url in src/site.ts
  site: 'https://invoicepassport.com',
  integrations: [vue(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
