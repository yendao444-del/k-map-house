import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-ignore JavaScript server middleware is deliberately outside the browser src tree.
import { meterDevApi } from './server/meter-dev-api.mjs'
// @ts-ignore Private configuration and backend middleware never enter browser code.
import { privateConfig } from './scripts/private-config.mjs'
// @ts-ignore JavaScript backend adapter.
import { authDevApi } from './server/auth-dev-api.mjs'
export default defineConfig(async ({ mode }) => {
  const env = { ...await privateConfig(), ...loadEnv(mode, process.cwd(), '') }
  return { plugins: [react(), env.SUPABASE_SERVICE_ROLE_KEY && env.WEBMOBILE_GATEWAY_SECRET ? authDevApi(env) : meterDevApi(env)], server: { host: '127.0.0.1' }, build: { sourcemap: false } }
})
