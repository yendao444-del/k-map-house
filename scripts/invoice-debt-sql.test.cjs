const { PGlite } = require(require('node:path').join(process.env.TEMP, 'codex-invoice-sql-tests/node_modules/@electric-sql/pglite'))
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')
;(async () => {
 const db=new PGlite()
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select current_setting('test.actor')::uuid$$;
 create table public.users(id uuid, role text, status text);
 create table public.rooms(id text primary key,status text,electric_old numeric,electric_new numeric,water_old numeric,water_new numeric);
 create table public.contracts(id text,room_id text,tenant_id text,status text,created_at timestamptz);
 create table public.invoices(id text primary key,room_id text,tenant_id text,year int,month int,created_at timestamptz default now(),payment_status text,total_amount integer,paid_amount integer,billing_reason text,is_first_month boolean,is_settlement boolean,electric_old numeric,electric_new numeric,water_old numeric,water_new numeric,room_cost numeric,electric_cost numeric,water_cost numeric,wifi_cost numeric,garbage_cost numeric,adjustment_amount numeric,deposit_amount numeric,note text);
 insert into auth.users values ('00000000-0000-0000-0000-000000000001');
 insert into public.users values ('00000000-0000-0000-0000-000000000001','admin','active');
 set test.actor='00000000-0000-0000-0000-000000000001';
 insert into rooms values ('r','occupied',100,100,50,50);
 insert into contracts values ('c','r','t','active','2020-01-01');
 insert into invoices(id,room_id,tenant_id,year,month,payment_status,total_amount,paid_amount,billing_reason,electric_old,electric_new,water_old,water_new) values ('i','r','t',2020,1,'unpaid',400,0,'monthly',100,130,50,60);`)
 await db.exec(readFileSync('supabase/migrations/20260928130000_invoice_debt_closing.sql','utf8'))
 assert.equal((await db.query('select invoice_debt_schema_version() as version')).rows[0].version,1)
 await db.query("select confirm_invoice_debt_atomic('i',400,0,130,60)")
 assert.equal(Number((await db.query("select electric_new from rooms where id='r'")).rows[0].electric_new),130)
 await assert.rejects(db.exec("update invoices set total_amount=500 where id='i'"), /chốt nợ/)
 await db.query("select reopen_invoice_debt_atomic('i')")
 assert.equal(Number((await db.query("select electric_new from rooms where id='r'")).rows[0].electric_new),100)
 await db.query("select confirm_invoice_debt_atomic('i',400,0,130,60)")
 await db.exec("insert into invoices(id,room_id,tenant_id,year,month,payment_status,total_amount,paid_amount,billing_reason,electric_old,electric_new,water_old,water_new) values ('j','r','t',2020,2,'unpaid',500,0,'monthly',130,145,60,66)")
 await assert.rejects(db.query("select reopen_invoice_debt_atomic('i')"), /kỳ sau/)
 await db.exec("update invoices set paid_amount=500,payment_status='paid' where id='j'")
 await db.exec("update invoices set paid_amount=400,payment_status='paid' where id='i'")
 assert.equal(Number((await db.query("select electric_new from rooms where id='r'")).rows[0].electric_new),145)
 await db.exec("update public.users set role='user'")
 await assert.rejects(db.query("select reopen_invoice_debt_atomic('i')"), /quản trị viên/)
 console.log('PASS: migration SQL, close/reopen, protected edits, dependent-period block, out-of-order payment, admin permission')
 await db.close()
})().catch(e=>{console.error(e.message);process.exitCode=1})
