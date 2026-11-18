import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Base URL for emitted assets.
 *
 * A GitHub Pages *project* site is served from https://<user>.github.io/<repo>/,
 * so every asset URL has to carry that prefix or the browser requests
 * https://<user>.github.io/assets/... and gets a 404.  The deploy workflow
 * sets PAGES_BASE for that build; everywhere else (local dev, previews, a
 * custom domain) the default "/" is correct.
 */
const base = process.env.PAGES_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // The Arena preview proxies the dev server under an *.e2b.app host.
    allowedHosts: true,
    cors: true,
    hmr: {
      clientPort: 443,
      protocol: 'wss',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    cors: true,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) return 'pdfjs'
          if (id.includes('pdf-lib') || id.includes('@pdf-lib/fontkit')) return 'pdf-lib'
          if (id.includes('node_modules')) return 'vendor'
          return undefined
        },
      },
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'pdf-lib'],
  },
})
