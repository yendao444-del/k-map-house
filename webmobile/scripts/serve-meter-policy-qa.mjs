// Isolated UI verification: synthetic provider, no user images sent to AI.
// Never imported by the real application or deployed to Pages.
import { createServer as createHttpServer } from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { meterDevApi } from '../server/meter-dev-api.mjs'
const provider = createHttpServer(async (req, res) => {
  let text = ''; for await (const chunk of req) text += chunk
  const body = JSON.parse(text)
  const electric = body.messages[0].content[0].text.includes('Expected device: electric.')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ meterType: electric ? 'electric' : 'water', reading: electric ? '12692' : '00287', unit: electric ? 'kWh' : 'm3', certainty: 'clear', meterCount: 1, framing: 'close', issue: 'none' }) } }] }))
})
provider.listen(0, '127.0.0.1'); await once(provider, 'listening')
const site = await createServer({
  configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
  plugins: [react(), meterDevApi({ METER_OCR_BASE_URL: `http://127.0.0.1:${provider.address().port}`, METER_OCR_MODEL: 'fixture' }), {
    name: 'qa-labelled-synthetic-provider',
    transformIndexHtml(html) { return html.replace('<body>', '<body><aside style="padding:12px;background:#fff0da;text-align:center;font:14px system-ui">KIỂM THỬ MÔ PHỎNG OCR · Không phải kết quả AI thực tế</aside>') }
  }],
  server: { host: '127.0.0.1', port: 5192, strictPort: true }
})
await site.listen()
console.log('Synthetic meter policy QA: http://127.0.0.1:5192/?screen=capture')
async function close() { await site.close(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); process.exit(0) }
process.on('SIGINT', close); process.on('SIGTERM', close)
