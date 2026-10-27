// AbortSignal.any/timeout are missing on older Safari/WebViews. Keep both
// cancellation and the deadline, including reading the response body.
export async function requestJson(url, init, timeoutMs, environment = globalThis) {
  const controller = new environment.AbortController(), parent = init.signal
  const abort = () => controller.abort(parent?.reason)
  if (parent?.aborted) abort()
  else parent?.addEventListener('abort', abort, { once: true })
  const timer = environment.setTimeout(() => controller.abort(new environment.DOMException('Request timed out', 'TimeoutError')), timeoutMs)
  try {
    if (controller.signal.aborted) throw controller.signal.reason || new environment.DOMException('Aborted', 'AbortError')
    const response = await environment.fetch(url, { ...init, signal: controller.signal })
    const data = await response.json().catch(error => { if (controller.signal.aborted) throw controller.signal.reason || error; return null })
    return { response, data }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason || error
    throw error
  } finally { environment.clearTimeout(timer); parent?.removeEventListener('abort', abort) }
}
