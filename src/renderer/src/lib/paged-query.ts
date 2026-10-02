export type PageFetcher<T> = (offset: number, pageSize: number) => Promise<readonly T[]>

/**
 * Reads a complete range in bounded parallel waves. The first page establishes
 * whether more data exists; each later wave keeps offsets contiguous and stops
 * at the first short page. Fetchers must be side-effect free and use a stable,
 * unique ordering with a server row cap at least pageSize. Completeness assumes
 * the dataset does not change during the read; offset pages are not a snapshot.
 */
export async function fetchAllPages<T>(
  fetchPage: PageFetcher<T>,
  pageSize = 1000,
  concurrency = 3
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error('pageSize must be a positive integer')
  }
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error('concurrency must be a positive integer')
  }

  const firstPage = [...(await fetchPage(0, pageSize))]
  if (firstPage.length < pageSize) return firstPage

  const rows = firstPage
  let offset = pageSize
  while (true) {
    const results = await Promise.allSettled(
      Array.from({ length: concurrency }, (_, index) =>
        fetchPage(offset + index * pageSize, pageSize).then((page) => [...page])
      )
    )
    const shortPageIndex = results.findIndex(
      (result) => result.status === 'fulfilled' && result.value.length < pageSize
    )
    const acceptedEnd = shortPageIndex === -1 ? results.length : shortPageIndex + 1
    for (let index = 0; index < acceptedEnd; index++) {
      const result = results[index]
      if (result.status === 'rejected') throw result.reason
      rows.push(...result.value)
    }
    if (shortPageIndex !== -1) return rows
    offset += concurrency * pageSize
  }
}
