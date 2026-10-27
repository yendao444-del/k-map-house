import { readFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const migration = await readFile(new URL('../supabase/migrations/20261010110000_security_mandatory_enrollment.sql', import.meta.url), 'utf8')
await management(env, '/database/query', { query: migration })
const status = await management(env, '/database/query', { query: `select jsonb_build_object('enrollment_enabled',enrollment_enabled,'enforce_management',enforce_management,'active_management_accounts',(select count(*) from public.users where status='active' and role in ('admin','user')),'ready_management_accounts',(select count(*) from public.users u join management_security.accounts a on a.user_id=u.id where u.status='active' and u.role in ('admin','user') and a.recovery_ack_at is not null and exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.factor_type='totp' and f.status='verified'))) as status from management_security.settings where singleton;` })
console.log(JSON.stringify({ rolloutGuard: true, status: status?.[0]?.status ?? status, customerDataChanged: false }, null, 2))
