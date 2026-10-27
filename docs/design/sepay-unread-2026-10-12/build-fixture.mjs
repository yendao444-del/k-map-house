import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// Bundle the actual PWA modal, replacing only network/money/audio/security
// dependencies for a safe, fictional visual test. Never included in app builds.
await build({
  entryPoints: [fileURLToPath(new URL('./fixture.tsx', import.meta.url))],
  outfile: fileURLToPath(new URL('../../../adminpwa/qa-sepay-bundle.js', import.meta.url)),
  bundle: true, format: 'esm', jsx: 'automatic', platform: 'browser',
  loader: { '.png': 'dataurl' },
  alias: {
    'react': fileURLToPath(new URL('../../../node_modules/react', import.meta.url)),
    'react-dom': fileURLToPath(new URL('../../../node_modules/react-dom', import.meta.url)),
    '@tanstack/react-query': fileURLToPath(new URL('../../../node_modules/@tanstack/react-query', import.meta.url))
  },
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'sepay-fixture-only', setup(build) {
    build.onResolve({ filter: /\/lib\/db$/ }, () => ({ path: 'db', namespace: 'fixture' }))
    build.onResolve({ filter: /\/lib\/sound$/ }, () => ({ path: 'sound', namespace: 'fixture' }))
    build.onResolve({ filter: /\/PasswordConfirmationDialog$/ }, () => ({ path: 'security', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
      contents: path === 'db' ? `
        import { fixtureTransactions } from ${JSON.stringify(fileURLToPath(new URL('./fixture.tsx', import.meta.url)))};
        export async function fetchSepayTransactions() { return { ok: true, data: {status: 200, transactions: fixtureTransactions} } }
        export async function recordInvoicePayment() { throw Error('QA: blocked financial write') }
        export async function createCashTransaction() { throw Error('QA: blocked financial write') }
        export async function getCashTransactions() { return [] }
        export async function reconcileSepayPayment() { throw Error('QA: blocked financial write') }
        export async function reconcileVerifiedSepay() { throw Error('QA: blocked financial write') }
        export async function recordSepayBankReceipt() { throw Error('QA: blocked financial write') }
      ` : path === 'sound' ? 'export async function announcePaymentAmount() {}'
        : 'export const usePasswordConfirmation = () => ({ passwordConfirmation: null, requirePassword: async () => { throw Error("QA: blocked financial write") } })',
      loader: 'js', resolveDir: fileURLToPath(new URL('.', import.meta.url))
    }))
  }}]
})
