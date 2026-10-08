import { tenants } from './db-mock'
export { generateTenantPassword, tenantWebAccountLabel, tenantWebAccountQueryKey } from '../../../src/renderer/src/lib/tenant-web-accounts'
import type { TenantAccountAction, TenantWebAccount } from '../../../src/renderer/src/lib/tenant-web-accounts'
let rows: TenantWebAccount[] = [{tenant_id:'qa-tenant',auth_user_id:'qa-auth',email:'minhanh@example.invalid',status:'active',activated_at:'2026-10-01',last_login_at:'2026-10-07T01:30:00Z',created_at:'2026-10-01',updated_at:'2026-10-01'}]
export const getTenantWebAccounts = async () => rows
export async function manageTenantWebAccount(tenantId: string, action: TenantAccountAction, _password?: string) {
  const tenant=tenants.find(item=>item.id===tenantId)!
  const old=rows.find(item=>item.tenant_id===tenantId)
  const next=old ? {...old,status:(action==='lock'?'locked':action==='unlock'?'active':old.status) as TenantWebAccount['status']} : {tenant_id:tenantId,auth_user_id:'qa-auth-new',email:tenant.email!,status:'pending' as const,activated_at:null,last_login_at:null,created_at:'2026-10-07',updated_at:'2026-10-07'}
  rows=[...rows.filter(item=>item.tenant_id!==tenantId),next]
  return next
}
