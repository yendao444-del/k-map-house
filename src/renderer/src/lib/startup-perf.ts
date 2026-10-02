// Names contain no query keys, user identifiers or business data.
const emitted = new Set<string>()

export function markStartup(name: string): void {
  if (emitted.has(name)) return
  emitted.add(name)
  window.api?.perf.markStartup(name)
}

// Two animation frames allow a committed screen to pass a paint opportunity.
// This is a renderer milestone, not proof that remote module data is ready.
export function markAfterPaint(name: string): () => void {
  let second = 0
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(() => markStartup(name))
  })
  return () => {
    cancelAnimationFrame(first)
    cancelAnimationFrame(second)
  }
}
