import { tenantAdminHandler } from './tenant-admin.mjs'
Deno.serve(tenantAdminHandler(Deno.env.toObject()))
