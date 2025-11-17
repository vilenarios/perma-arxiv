import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Use root-relative paths for Arweave manifests
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm']
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined // Keep all code in single bundle for simpler manifest
      }
    },
    sourcemap: false // Disable sourcemaps to avoid warnings from DuckDB WASM
  }
})
