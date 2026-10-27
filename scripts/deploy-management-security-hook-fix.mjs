import { readFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
await management(env, '/database/query', { query: await readFile(new URL('../supabase/migrations/20261010094000_security_hook_readonly.sql', import.meta.url), 'utf8') })
console.log('Read-only PostgREST hook compatibility fix applied.')
