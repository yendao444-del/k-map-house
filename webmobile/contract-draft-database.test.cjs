const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const { PGlite } = require(process.env.CONTRACT_PGLITE_MODULE || path.join(__dirname, 'qa/private/contract-sql-runtime/node_modules/@electric-sql/pglite'))
const adminId = '11111111-1111-1111-1111-111111111111'
const userId = '22222222-2222-2222-2222-222222222222'
const snapshot = (room = 'room-a', tenant = 'tenant-a') => ({ version: 1, room: { id: room }, tenant: { id: tenant, full_name: 'Đỗ Mỹ Duyên' }, form: { baseRent: 3500000 } })

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    create table users(id uuid primary key, role text, status text);
    insert into users values ('${adminId}','admin','active'),('${userId}','user','active');
    create table rooms(id text primary key, status text);
    insert into rooms values ('room-a','vacant'),('room-b','vacant'),('room-c','vacant'),('occupied','occupied');
    create table tenants(id text primary key,is_active boolean);
    insert into tenants values ('tenant-a',true),('tenant-b',true),('tenant-c',true),('left',false);
    create table contracts(id text primary key,room_id text,tenant_id text,status text);
    grant select on users, rooms, tenants, contracts to authenticated;
  `)
  const migration = fs.readFileSync('supabase/migrations/20261005210000_contract_drafts.sql','utf8')
  await db.exec(migration)
  await db.exec(migration)
  await db.exec(`select set_config('request.jwt.claim.sub','${adminId}',false); set role authenticated;`)
  return db
}
async function insert(db, room = 'room-a', tenant = 'tenant-a', data = snapshot(room, tenant)) {
  return (await db.query('insert into contract_drafts(room_id,tenant_id,snapshot) values ($1,$2,$3) returning *',[room,tenant,JSON.stringify(data)])).rows[0]
}

test('draft storage does not activate a contract; supports revision guard and reversible cancellation', async () => {
  const db = await fixture()
  try {
    const draft = await insert(db)
    assert.equal(draft.created_by, adminId)
    assert.equal(draft.status, 'draft')
    assert.equal((await db.query('select count(*)::int as n from contracts')).rows[0].n, 0)
    assert.equal((await db.query("select status from rooms where id='room-a'")).rows[0].status, 'vacant')
    await assert.rejects(insert(db), /duplicate key/)
    assert.equal((await db.query('update contract_drafts set revision=2 where id=$1 and revision=1 returning id',[draft.id])).rows.length, 1)
    assert.equal((await db.query('update contract_drafts set revision=2 where id=$1 and revision=1 returning id',[draft.id])).rows.length, 0)
    await assert.rejects(db.query('update contract_drafts set revision=7 where id=$1',[draft.id]), /Phiên bản/)
    await db.query("update contract_drafts set status='cancelled',revision=3 where id=$1",[draft.id])
    assert.equal((await db.query("update contract_drafts set status='draft',revision=4 where id=$1 returning id",[draft.id])).rows.length,0)
    await insert(db)
    await assert.rejects(db.query('delete from contract_drafts'), /permission denied/)
  } finally { await db.close() }
})

test('database blocks occupied rooms, inactive tenants, malformed identity snapshots and secret/photo payloads', async () => {
  const db = await fixture()
  try {
    await assert.rejects(insert(db,'occupied'), /không còn trống/)
    await assert.rejects(insert(db,'room-a','left'), /ngừng hoạt động/)
    await assert.rejects(insert(db,'room-a','tenant-a',snapshot('wrong-room')), /check constraint/)
    await assert.rejects(insert(db,'room-a','tenant-a',{}), /check constraint/)
    await assert.rejects(insert(db,'room-a','tenant-a',{ ...snapshot(),settings:{sepay_api_token:'secret'} }), /token dịch vụ/)
    await assert.rejects(insert(db,'room-a','tenant-a',{ ...snapshot(),tenant:{...snapshot().tenant,identity_image_url:'private'} }), /ảnh giấy tờ/)
    await db.exec('reset role; insert into contracts values (\'active\',\'room-b\',\'tenant-b\',\'active\'); set role authenticated;')
    await assert.rejects(insert(db,'room-c','tenant-b'), /đang có hợp đồng/)
  } finally { await db.close() }
})

test('only active admins can read/write drafts; anon and ordinary users cannot', async () => {
  const db = await fixture()
  try {
    await insert(db)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[userId])
    assert.equal((await db.query('select * from contract_drafts')).rows.length,0)
    await assert.rejects(insert(db,'room-b','tenant-b'), /row-level security/)
    await db.exec("reset role; update users set status='inactive' where role='admin'; set role authenticated;")
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[adminId])
    assert.equal((await db.query('select * from contract_drafts')).rows.length,0)
    await assert.rejects(insert(db,'room-b','tenant-b'), /row-level security/)
    await db.exec('reset role; set role anon;')
    await assert.rejects(db.query('select * from contract_drafts'), /permission denied/)
  } finally { await db.close() }
})
