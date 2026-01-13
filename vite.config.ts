import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  return {
    server: {
      port: 9000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['kibali_logo.svg'], // Ton logo ici
        manifest: {
          name: 'Kibali OS',
          short_name: 'Kibali',
          description: 'Plateforme centrale pour tous vos modules logiciels',
          theme_color: '#1a1a1a',
          icons: [
            {
              src: 'kibali_logo.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
            },
            {
              src: 'kibali_logo.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
            },
          ],
        },
      }),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
