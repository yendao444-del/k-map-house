import { readFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const query = await readFile(new URL('../supabase/migrations/20261010093000_security_mfa_recovery_resume.sql', import.meta.url), 'utf8')
await management(env, '/database/query', { query })
console.log('Recovery resume state migration applied; rollout flags unchanged.')
