/** Abort the actual request, including its response body, rather than racing
 * a mutation against a timer and letting it continue after the UI unlocks. */
export function securityFetch(input: RequestInfo | URL, options?: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  return fetch(input, { ...options, signal })
}

/** SDK initialization/session reads can wait before a network request starts.
 * Only use this deadline for reads; never release a pending mutation this way. */
export async function securityRead<T>(read: () => PromiseLike<T>, timeoutMs = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Kết nối bảo mật mất quá lâu. Vui lòng kiểm tra mạng và thử lại.')), timeoutMs) })
    ])
  } finally { clearTimeout(timer) }
}
