import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Chargement des variables d'environnement (GEMINI_API_KEY, etc.)
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
        // Stratégie d'injection du Service Worker
        injectRegister: 'auto',
        workbox: {
          // Cache toutes les ressources générées (JS, CSS, HTML, images)
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
        includeAssets: ['kibali_logo.svg', 'favicon.ico', 'robots.txt'], 
        manifest: {
          name: 'Kibali Store IA',
          short_name: 'Kibali',
          description: 'Plateforme centrale pour tous vos modules logiciels',
          theme_color: '#1a1a1a',
          background_color: '#ffffff',
          display: 'standalone', // Supprime la barre d'adresse (effet logiciel)
          orientation: 'any',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/kibali_logo.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
            {
              src: '/kibali_logo.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        devOptions: {
          enabled: true, // Pour tester le comportement PWA en développement
          type: 'module',
        }
      }),
    ],
    define: {
      // Injection des clés API dans le code client
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        // Alias '@' pour pointer vers la racine du projet
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});