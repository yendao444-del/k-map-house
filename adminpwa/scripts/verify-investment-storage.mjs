import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('Missing private Supabase deployment credential.')
const query = sql => management(env, '/database/query', { query: sql })
const counts = async () => query("select (select count(*) from public.admin_pwa_investment_store)::int as portfolios,(select count(*) from public.admin_pwa_investment_commits)::int as commits,(select count(*) from public.cash_transactions)::int as cashRows,(select md5(coalesce(string_agg(row_to_json(c)::text,'|' order by c.id),'')) from public.cash_transactions c) as cashFingerprint")
if (process.argv.includes('--apply-storage')) {
  const files = ['20261008_investment_cloud.sql','20261008_investment_atomic_commit.sql','20261008_investment_import.sql']
  const migrations = await Promise.all(files.map(name => readFile(new URL(`../backend/migrations/${name}`, import.meta.url), 'utf8')))
  // One transaction prevents a partially applied storage/permission release.
  await query(`begin;\n${migrations.map(sql => sql.replace(/^begin;$/m,'').replace(/^commit;$/m,'')).join('\n')}\ncommit;`)
  console.log('Applied additive PWA investment storage. Existing business tables/policies and Electron files are untouched.')
}
const before = await counts()
const assertions = await query(await readFile(new URL('../backend/tests/investment-cloud-rollback.sql', import.meta.url), 'utf8'))
if (assertions.length !== 29 || assertions.some(item => item.passed !== true)) throw new Error('Investment database assertions did not all pass.')
const after = await counts()
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Rollback verification failed: portfolio/history row counts changed.')
const guards = await query("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('admin_pwa_investment_store','admin_pwa_investment_commits') order by c.relname")
if (guards.length !== 2 || guards.some(item => !item.relrowsecurity)) throw new Error('PWA investment RLS is not enabled.')
const report = { verifiedAt: new Date().toISOString(), additiveMigrations: ['20261008_investment_cloud.sql','20261008_investment_atomic_commit.sql','20261008_investment_import.sql'], testMode: 'authenticated/anonymous role simulation with real database RPCs; synthetic 1 VND receipt in rollback-only transaction; no retained financial posting or actual money transfer', assertions, before, after, guards, limitations: ['HTTP Auth login is not tested by SQL role simulation.', 'File-picker/import UI and real historical portfolio import still need verification; no actual user JSON was imported.'] }
await writeFile(new URL('../qa/investment-storage-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
