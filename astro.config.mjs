// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  site: 'https://afrinvoice.app',
  integrations: [vue(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
