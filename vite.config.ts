import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icon.svg',
        'icon-192.png',
        'icon-512.png',
        'sample-deck.pdf',
        'sample-notes.md',
        'pdfjs/**',
      ],
      manifest: {
        name: 'Typst Presenter',
        short_name: 'TypstPresenter',
        description:
          'Dual-window presentation console with speaker notes and pacing timers for Typst and arbitrary PDFs.',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'landscape',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,pdf,md,mjs,bcmap,properties}'],
        maximumFileSizeToCacheInBytes: 60 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
