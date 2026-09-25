import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // versão nova: banner "Atualizar" (lib/pwa.ts) — nunca recarrega sozinho no meio de uma partida
      includeAssets: ['favicon.png', 'brand/logo-v.webp', 'brand/logo-h.webp'],
      manifest: {
        name: 'JogaGol',
        short_name: 'JogaGol',
        description: 'Chute, marque e leve seu time ao topo.',
        theme_color: '#04101B',
        background_color: '#04101B',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /^\/app\//], // /app/ = downloads (APK de teste) servidos pelo nginx, não pela tela
        runtimeCaching: [{ urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'CacheFirst', options: { cacheName: 'fonts' } }],
      },
    }),
  ],
  server: { port: 5174, proxy: { '/api': { target: 'http://localhost:4310', ws: true } } }, // ws: Cabeção e FutPrego
  build: {
    chunkSizeWarningLimit: 1500,
    // Pacote "three" = SÓ o 3D (pênalti, falta, Falta PRO); "vendor" = as outras bibliotecas (React, roteador, zustand,
    // framer-motion, ícones). Separar as duas é obrigatório: o Rollup põe no pacote manual as dependências dele que não
    // estão em outro pacote manual — com só o "three", o React (que o @react-three também usa) ia junto, e o site inteiro
    // pré-carregava 1 MB de three.js em toda abertura, até a página de entrada (auditoria de SEO, 25/09/2026).
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // os ajudantes do próprio Vite (carregar tela sob demanda) vão com as bibliotecas — soltos, caíam no "three"
          if (/vite\/(preload-helper|modulepreload-polyfill)|commonjsHelpers/.test(id)) return 'vendor';
          if (!/[\\/]node_modules[\\/]/.test(id)) return undefined;
          return /[\\/]node_modules[\\/](three|three-stdlib|three-mesh-bvh|@react-three|troika-[^\\/]+|react-reconciler|camera-controls|maath|meshline|@monogrid|suspend-react|its-fine)[\\/]/.test(id) ? 'three' : 'vendor';
        },
      },
    },
  },
});
