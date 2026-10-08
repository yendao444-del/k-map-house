import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDemoPaymentStore, installDemoPaymentApi } from '../../server/demo-payments.mjs'
import { paymentBankFromEnv, invoicePropertyFromEnv } from '../../server/payment-recipient.mjs'
const root = fileURLToPath(new URL('.', import.meta.url))
const website = path.resolve(root, '../..')
const store = createDemoPaymentStore({ paymentBank: paymentBankFromEnv(loadEnv('development', website, '')), propertyInfo: invoicePropertyFromEnv(loadEnv('development', website, '')), confirmedReading: token => ({ contractId: token.startsWith('new-') ? 'demo-current-102' : 'demo-current-101', meter: token.endsWith('electric') ? 'electric' : 'water', reading: token.endsWith('electric') ? 12692 : 287, expiresAt: Date.now() + 3600000, source: 'ai-ocr' }) })
export default defineConfig({
  root, publicDir: path.join(website, 'public'),
  plugins: [react(), { name: 'isolated-invoice-qa', configureServer(server) {
    installDemoPaymentApi(server, store)
    server.middlewares.use('/qa-payment', async (req, res) => {
      const isNew = req.url?.includes('new'), prefix = isNew ? 'new-' : ''
      const payment = await store.create({ contractId: isNew ? 'demo-current-102' : 'demo-current-101', electricToken: prefix + 'electric', waterToken: prefix + 'water' })
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payment))
    })
  } }],
  server: { host: '127.0.0.1', port: 5191, strictPort: true, fs: { allow: [website] } }
})
