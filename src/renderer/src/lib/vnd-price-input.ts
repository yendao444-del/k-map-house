// Keep the editable value as integer digits; separators are presentation only.
export function normalizeVndPriceInput(value: string): string | null {
  if (!/^[\d.\s]*$/.test(value)) return null
  return value.replace(/[.\s]/g, '').replace(/^0+(?=\d)/, '')
}

export function formatVndPriceInput(value: string | number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
