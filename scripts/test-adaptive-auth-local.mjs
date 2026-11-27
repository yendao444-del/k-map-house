// Install the isolated test runtime first:
// npm install --prefix .codex-auth-qa --no-package-lock --no-save @electric-sql/pglite
import { PGlite } from '../.codex-auth-qa/node_modules/@electric-sql/pglite/dist/index.js'
import { pgcrypto } from '../.codex-auth-qa/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js'
import { readFile, writeFile } from 'node:fs/promises'
const db = new PGlite({ extensions: { pgcrypto } })
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role authenticator;
    create schema auth; create schema storage; create schema extensions;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
    create table public.users(id uuid primary key references auth.users,email text,username text,full_name text,role text,status text);
    create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users,factor_type text,status text,friendly_name text,secret text,created_at timestamptz,updated_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users,aal text,factor_id uuid,created_at timestamptz,updated_at timestamptz,not_after timestamptz);
    create table auth.mfa_amr_claims(id uuid primary key,session_id uuid references auth.sessions,authentication_method text,created_at timestamptz,updated_at timestamptz);
    create table storage.objects(id uuid);
  `)
  const migrations = [
    '20261009170000_security_mfa_foundation.sql', '20261009171000_security_mfa_recovery_reset.sql',
    '20261010093000_security_mfa_recovery_resume.sql', '20261010120000_management_session_six_hours.sql',
    '20261011150000_security_email_delivery.sql', '20261011153000_management_password_confirmation.sql',
    '20261012110000_management_user_security_directory.sql',
    '20261012133000_security_mfa_authenticator_rotation.sql', '20261012140000_security_overview_read.sql',
    '20261012150000_security_remember_device_existing_login.sql', '20261013100000_security_email_login_fallback.sql',
    '20261020090000_security_local_dev_device.sql', '20261118100000_security_trusted_device_login.sql',
    '20261120100000_security_adaptive_trusted_login.sql'
  ]
  for (const name of migrations) {
    try { await db.exec(await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')) }
    catch (error) { throw new Error(`Migration ${name}: ${error.message}`) }
  }
  const result = []
  for (const name of ['adaptive-login-rollback.sql', 'email-login-rollback.sql']) {
    await db.exec('begin;')
    result.push(...await db.exec(await readFile(new URL('../adminpwa/backend/tests/' + name, import.meta.url), 'utf8')))
    await db.exec('rollback;')
  }
  const report = { testedAt: new Date().toISOString(), runtime: 'Local PostgreSQL WASM (PGlite), Auth schema fixture', migrations: migrations.length, results: result.flatMap(r => r.rows), productionApplied: false, realAuthEndToEnd: false }
  await writeFile(new URL('../docs/security/qa/adaptive-login-local.json', import.meta.url), JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
} finally { await db.close() }
