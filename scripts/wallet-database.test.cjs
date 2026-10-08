// Run with WALLET_PGLITE_MODULE pointing to an isolated @electric-sql/pglite
// installation. No production credentials or database access are used.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const { PGlite } = require(process.env.WALLET_PGLITE_MODULE || '@electric-sql/pglite')

async function fixture(seedExtra = '') {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
    insert into auth.users values ('11111111-1111-1111-1111-111111111111');
    create table public.users (id uuid primary key, status text, role text);
    insert into public.users values ('11111111-1111-1111-1111-111111111111', 'active', 'admin');
    create table app_settings (id text primary key, opening_balance_cash integer default 0, opening_balance_bank integer default 0, opening_balance_date date);
    insert into app_settings(id,opening_balance_bank) values ('settings',11203732);
    create table cash_transactions (id text primary key, type text, category text, transaction_date text, amount integer, payment_method text, note text, created_at timestamptz default now(), updated_at timestamptz default now());
    create table invoices (id text primary key, payment_records jsonb default '[]', payment_status text default 'unpaid', paid_amount integer default 0, total_amount integer default 0, payment_method text, payment_date date, created_at timestamptz default now());
    insert into cash_transactions(id,type,category,transaction_date,amount,payment_method) values ('legacy','expense','electric','2026-10-05',4389669,'cash');
  `)
  if (seedExtra) await db.exec(seedExtra)
  await db.exec(fs.readFileSync('supabase/migrations/20260823194717_atomic_invoice_payments.sql', 'utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/20261005120000_wallet_reconciliation_and_guards.sql', 'utf8'))
  return db
}
const position = async db => (await db.query('select wallet_position() as value')).rows[0].value
const reconcile = db => db.query("select reconcile_wallet_balances(6814063,0,6814063,'Đối soát số dư thực tế') as value")
const today = "(now() at time zone 'Asia/Bangkok')::date::text"

test('database checkpoint is idempotent, preserves legacy history and locks it', async () => {
  const db = await fixture()
  try {
    const legacy = (await db.query('select * from cash_transactions')).rows
    const before = await position(db)
    assert.equal(before.cash, -4389669)
    const first = (await reconcile(db)).rows[0].value
    assert.deepEqual((await reconcile(db)).rows[0].value, first)
    assert.deepEqual((await db.query('select * from cash_transactions')).rows, legacy)
    assert.deepEqual(await position(db), { bank: 6814063, cash: 0, total: 6814063, unknown: 0, unknown_count: 0 })
    await assert.rejects(db.query("update cash_transactions set payment_method='transfer' where id='legacy'"), /đã khóa/)
    await assert.rejects(db.query("delete from cash_transactions where id='legacy'"), /đã khóa/)
    await assert.rejects(db.query('update app_settings set opening_balance_bank=0'), /đầu kỳ/)
    await assert.rejects(db.query('delete from wallet_reconciliations'), /vĩnh viễn/)
    assert.equal((await db.query('select count(*)::int as n from wallet_reconciliations')).rows[0].n, 1)
  } finally { await db.close() }
})

test('database refuses stale/mismatched correction and non-admin actor', async () => {
  const db = await fixture()
  try {
    await assert.rejects(db.query("select reconcile_wallet_balances(6814063,0,6814064,'reason')"), /Tổng sổ/)
    await assert.rejects(db.query("select reconcile_wallet_balances(6814064,0,6814063,'reason')"), /Tổng sổ/)
    await db.exec("update users set role='user'")
    await assert.rejects(reconcile(db), /quản trị viên/)
    assert.equal((await db.query('select count(*)::int as n from wallet_reconciliations')).rows[0].n, 0)
  } finally { await db.close() }
})

test('database cannot spend 250K with 100K cash and 150K bank; atomic transfer enables bank payment', async () => {
  const db = await fixture()
  try {
    await reconcile(db)
    await db.query("select transfer_between_wallets('transfer',100000,'seed-cash')")
    await db.exec(`insert into cash_transactions(id,type,category,transaction_date,amount,payment_method) values ('initial-spend','expense','other_expense',${today},6564063,'transfer')`)
    assert.equal((await position(db)).cash, 100000)
    assert.equal((await position(db)).bank, 150000)
    for (const method of ['cash','transfer']) await assert.rejects(db.exec(`insert into cash_transactions(id,type,category,transaction_date,amount,payment_method) values ('failed','expense','electric',${today},250000,'${method}')`), /không đủ tiền/)
    await db.query("select transfer_between_wallets('cash',100000,'cash-to-bank')")
    await db.query("select transfer_between_wallets('cash',100000,'cash-to-bank')")
    assert.equal((await position(db)).bank, 250000)
    assert.equal((await position(db)).cash, 0)
    await db.exec(`insert into cash_transactions(id,type,category,transaction_date,amount,payment_method) values ('paid','expense','electric',${today},250000,'transfer')`)
    assert.equal((await position(db)).total, 0)
    await assert.rejects(db.query("delete from cash_transactions where id='wallet-in-cash-to-bank'"), /không được sửa\/xóa riêng/)
    await assert.rejects(db.exec(`insert into cash_transactions(id,type,category,transaction_date,amount,payment_method) values ('fake-transfer','income','wallet_transfer',${today},100000,'cash')`), /nghiệp vụ chuyển/)
    await assert.rejects(db.exec(`insert into cash_transactions(id,type,category,transaction_date,amount) values ('unknown','income','other_income',${today},100000)`), /ví thanh toán/)
  } finally { await db.close() }
})

test('database rejects deleting or reducing consumed income, backdating and refunds from empty wallet', async () => {
  const db = await fixture()
  try {
    await reconcile(db)
    await db.exec(`insert into cash_transactions(id,type,category,transaction_date,amount,payment_method) values ('income','income','other_income',${today},100000,'cash'), ('spent','expense','electric',${today},100000,'cash')`)
    await assert.rejects(db.query("delete from cash_transactions where id='income'"), /không đủ tiền/)
    await assert.rejects(db.query("update cash_transactions set amount=50000 where id='income'"), /không đủ tiền/)
    await assert.rejects(db.exec("insert into cash_transactions(id,type,category,transaction_date,amount,payment_method) values ('backdate','income','other_income','2000-01-01',100000,'cash')"), /lùi ngày/)
    await db.exec("insert into invoices(id,total_amount) values ('refund',-1587000)")
    await assert.rejects(db.query("select record_invoice_payment_atomic('refund',-1587000,'cash',(now() at time zone 'Asia/Bangkok')::date)"), /không đủ tiền/)
    await db.query("select record_invoice_payment_atomic('refund',-1587000,'transfer',(now() at time zone 'Asia/Bangkok')::date)")
    assert.equal((await position(db)).bank, 5227063)
    assert.equal((await position(db)).cash, 0)
    await assert.rejects(db.exec(`update invoices set payment_records='[{"id":"bad","amount":-8000000,"payment_method":"transfer","payment_date":"2099-01-01"}]' where id='refund'`), /Ví đã chọn không đủ tiền/)
  } finally { await db.close() }
})

test('operating basis uses October transactions, keeps history, and validates the same wallet total', async () => {
  const db = await fixture(`
    update cash_transactions set transaction_date='2026-09-30' where id='legacy';
    insert into cash_transactions(id,type,category,transaction_date,amount,payment_method)
    values ('tx-1791183015353-6iy1odkx','expense','electric','2026-10-05',2954124,'cash');
    insert into invoices(id,payment_status,payment_records) values ('oct','paid',
      '[{"id":"income","amount":12376000,"payment_method":"transfer","payment_date":"2026-10-05"},
        {"id":"refund","amount":-1587000,"payment_method":"transfer","payment_date":"2026-10-05"}]');
  `)
  try {
    const history = (await db.query('select * from cash_transactions order by id')).rows
    const invoices = (await db.query('select * from invoices order by id')).rows
    const total = (await position(db)).total
    await db.query('select reconcile_wallet_balances($1,0,$1,$2)', [total, 'Legacy allocation checkpoint'])
    const checkpoint = (await db.query('select * from wallet_reconciliations')).rows
    await db.exec(fs.readFileSync('supabase/migrations/20261005140000_wallet_accounting_basis.sql', 'utf8'))
    assert.deepEqual(await position(db), { bank: 7834876, cash: 0, total: 7834876, unknown: 0, unknown_count: 0 })
    assert.deepEqual((await db.query('select * from cash_transactions order by id')).rows, history)
    assert.deepEqual((await db.query('select * from invoices order by id')).rows, invoices)
    assert.deepEqual((await db.query('select * from wallet_reconciliations')).rows, checkpoint)
    await assert.rejects(db.exec(`insert into cash_transactions(id,type,category,transaction_date,amount,payment_method)
      values ('overdraft','expense','other_expense',${today},7834877,'transfer')`), /không đủ tiền/)
    await db.exec(`insert into cash_transactions(id,type,category,transaction_date,amount,payment_method)
      values ('spend','expense','other_expense',${today},100000,'transfer')`)
    assert.equal((await position(db)).total, 7734876)
    await assert.rejects(db.exec("update wallet_accounting_basis set starts_on='2026-09-01'"), /vĩnh viễn/)
    assert.equal((await db.query('select wallet_guard_version() as v')).rows[0].v, 2)
  } finally { await db.close() }
})
