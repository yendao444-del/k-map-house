import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { checkTenantEmail, normalizeTenantEmail, tenantEmailFormatValid } from './tenant-email'

export function useTenantEmailCheck(email?: string | null) {
  const normalized = normalizeTenantEmail(email)
  const [settled, setSettled] = useState(normalized)
  useEffect(() => { const timer = setTimeout(() => setSettled(normalized), 300); return () => clearTimeout(timer) }, [normalized])
  const valid = !normalized || tenantEmailFormatValid(normalized)
  const check = useQuery({ queryKey: ['tenant-email-check', settled], queryFn: () => checkTenantEmail(settled), enabled: Boolean(settled) && settled === normalized && valid, retry: false, staleTime: 0 })
  const checking = Boolean(normalized) && valid && (normalized !== settled || check.isPending || check.isFetching)
  const error = !valid ? 'Email chưa đúng định dạng.' : normalized === settled && normalized ? check.error?.message || check.data || null : null
  return { checking, error, blocked: checking || Boolean(error) }
}
