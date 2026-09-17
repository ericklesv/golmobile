/** Só para conferir no PC (porta 5176 → API 4320 do worktree). Não vai para produção. */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // o PWA entra desligado só para o `virtual:pwa-register` existir (lib/pwa.ts)
  plugins: [react(), VitePWA({ disable: true })],
  server: { port: 5176, proxy: { '/api': { target: 'http://localhost:4320', ws: true } } },
});
