// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://mcp-tool-shop-org.github.io',
  base: '/datagates',
  integrations: [
    starlight({
      title: 'datagates',
      description: 'Governed data promotion system. Data earns trust through layered gates, not silent cleaning.',
      disable404Route: true,
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mcp-tool-shop-org/datagates' },
      ],
      sidebar: [
        {
          label: 'Handbook',
          autogenerate: { directory: 'handbook' },
        },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
