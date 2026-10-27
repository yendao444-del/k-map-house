import { useEffect, useState } from 'react'

export const normalizeFinanceSearch = (value: string) => value.toLocaleLowerCase('vi-VN')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')

export const fitInvoicePaperScale = (available: number) => Number.isFinite(available) && available > 0
  ? Math.min(1, available / 768) : 1

/** Keep a single mounted date control/ref when moving it into the mobile list. */
export function useCompactFinance(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const changed = () => setCompact(query.matches)
    changed()
    query.addEventListener('change', changed)
    return () => query.removeEventListener('change', changed)
  }, [])
  return compact
}
