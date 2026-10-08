// Local fixture only; never calls Supabase's tenant email RPC.
export const normalizeTenantEmail = (email?: string | null) => email?.trim().toLowerCase() || ''
export const tenantEmailFormatValid = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
export const checkTenantEmail = async () => null
export const assertTenantEmail = async () => {}
