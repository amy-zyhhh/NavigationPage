// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import remarkLooseImages from './src/utils/remarkLooseImages.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://amy-zyhhh.github.io',
  base: '/pages',
  vite: {
    assetsInclude: ['**/*.assets/*'],
  },
  markdown: {
    processor: satteri({
      mdastPlugins: [remarkLooseImages],
    }),
  },
});
