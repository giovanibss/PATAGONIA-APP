import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const VERSAO = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  define: { __VERSAO__: JSON.stringify(VERSAO) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Kooka Planner · Patagônia',
        short_name: 'Kooka',
        description: 'Roteiro, custos e reservas da viagem à Patagônia.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        categories: ['travel', 'productivity'],
        shortcuts: [
          { name: 'Roteiro', short_name: 'Roteiro', url: '/?aba=roteiro', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Lançamentos', short_name: 'Lançar', url: '/?aba=custos', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Financeiro', short_name: 'Financeiro', url: '/?aba=financeiro', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Checklist', short_name: 'Checklist', url: '/?aba=checklist', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
        ],
        background_color: '#0d0b14',
        theme_color: '#0d0b14',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,jpg,svg,ico}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('supabase.co'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.hostname === 'open.er-api.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cambio',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('unsplash.com'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'wallpapers',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
