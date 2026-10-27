// The server is the source of business data. Retire the old shared, untrusted
// cache without ever importing it into a later user's financial ledger.
export function clearLegacyFinanceCache(): void {
  for (const name of ['localStorage','sessionStorage'] as const) {
    try {
      for (const key of ['an-khang-debt-summary','an-khang-debt-entries']) window[name].removeItem(key)
    } catch { /* Storage may be disabled; cleanup must not break startup. */ }
  }
}
