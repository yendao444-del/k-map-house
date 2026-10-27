import {privateConfig,management} from './private-config.mjs'
const env=await privateConfig()
const sql=`select jsonb_build_object(
 'room',(select to_jsonb(r) from rooms r where r.name ilike '%999%' limit 1),
 'contract',(select to_jsonb(c) from contracts c join rooms r on r.id=c.room_id where r.name ilike '%999%' and c.status='active' limit 1),
 'tenant',(select to_jsonb(t) from tenants t join contracts c on c.tenant_id=t.id join rooms r on r.id=c.room_id where r.name ilike '%999%' and c.status='active' limit 1),
 'zone',(select to_jsonb(z) from service_zones z join rooms r on r.service_zone_id=z.id where r.name ilike '%999%' limit 1)) x`
const result=await management(env,'/database/query',{query:sql})
console.log(JSON.stringify(result))
