import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'
const contractTestMode = process.env.KMAP_CONTRACT_TEST === '1'
if (contractTestMode && (process.env.VITE_SUPABASE_URL !== 'https://gsianbstkmyutnhromwc.supabase.co' || process.env.VITE_CONTRACT_DB_SCHEMA !== 'ankhang_contract_test')) throw new Error('Electron TEST must use the isolated TEST project/schema.')

export default defineConfig({
  main: {
    build: { ...(contractTestMode ? { outDir: '.contract-test-out/main' } : {}), rollupOptions: { external: ['googleapis', 'sharp', 'tesseract.js', 'zxing-wasm/reader'] } }
  },
  preload: { ...(contractTestMode ? { build: { outDir: '.contract-test-out/preload' } } : {}) },
  renderer: {
    // Changing the dev port changes localStorage's origin and loses the saved
    // Auth session/device. Fail visibly instead of silently moving to 5174.
    server: { host: 'localhost', port: 5173, strictPort: true },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@dby-finance': resolve('dby-finance/src')
      }
    },
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()]
      }
    },
    build: {
      ...(contractTestMode ? { outDir: '.contract-test-out/renderer' } : {}),
      minify: 'esbuild'
    },
    plugins: [react()]
  }
})
