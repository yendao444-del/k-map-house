const assert = require('node:assert/strict')
const { test } = require('node:test')

test('bounded page reader returns every row in order and stops at first short page', async () => {
  const { fetchAllPages } = await import('../src/renderer/src/lib/paged-query.ts')
  const source = Array.from({ length: 7 }, (_, index) => index)
  const calls = []
  const rows = await fetchAllPages(async (offset, pageSize) => {
    calls.push(offset)
    await new Promise((resolve) => setTimeout(resolve, offset === 0 ? 2 : 1))
    return source.slice(offset, offset + pageSize)
  }, 2, 3)

  assert.deepEqual(rows, source)
  assert.deepEqual(calls, [0, 2, 4, 6])
})

test('bounded page reader does not issue speculative waves for a short first page', async () => {
  const { fetchAllPages } = await import('../src/renderer/src/lib/paged-query.ts')
  const calls = []
  const rows = await fetchAllPages(async (offset, pageSize) => {
    calls.push(offset)
    return offset === 0 ? [1] : Array.from({ length: pageSize }, (_, index) => index)
  }, 10, 3)

  assert.deepEqual(rows, [1])
  assert.deepEqual(calls, [0])
})

test('large histories and exact page multiples remain complete with bounded concurrency', async () => {
  const { fetchAllPages } = await import('../src/renderer/src/lib/paged-query.ts')
  for (const length of [0, 1000, 3000, 10005]) {
    const source = Array.from({ length }, (_, index) => index)
    let active = 0
    let maximum = 0
    const rows = await fetchAllPages(async (offset, size) => {
      active++
      maximum = Math.max(maximum, active)
      // Later offsets resolve first; result must still use offset order.
      await new Promise(resolve => setTimeout(resolve, 3 - (offset / size % 3)))
      active--
      return source.slice(offset, offset + size)
    })
    assert.deepEqual(rows, source)
    assert.ok(maximum <= 3)
    if (length > 1000) assert.equal(maximum, 3)
  }
})

test('reader discards speculative data after the first short page', async () => {
  const { fetchAllPages } = await import('../src/renderer/src/lib/paged-query.ts')
  assert.deepEqual(await fetchAllPages(async offset => {
    if (offset === 0) return [0, 1]
    if (offset === 2) return [2]
    return [99, 100]
  }, 2), [0, 1, 2])
})

test('reader ignores an error from a page after the accepted short page', async () => {
  const { fetchAllPages } = await import('../src/renderer/src/lib/paged-query.ts')
  assert.deepEqual(await fetchAllPages(async offset => {
    if (offset === 2) return [2]
    if (offset > 2) throw new Error('discarded page failed')
    return [0, 1]
  }, 2), [0, 1, 2])
})

test('reader fails on first-page or wave errors instead of returning a partial history', async () => {
  const { fetchAllPages } = await import('../src/renderer/src/lib/paged-query.ts')
  for (const errorOffset of [0, 2, 4]) {
    await assert.rejects(fetchAllPages(async offset => {
      if (offset === errorOffset) throw new Error('network failed')
      return offset < errorOffset || errorOffset === 0 ? [0, 1] : []
    }, 2), /network failed/)
  }
})

test('invalid page parameters are rejected before issuing a read', async () => {
  const { fetchAllPages } = await import('../src/renderer/src/lib/paged-query.ts')
  const fetch = async () => { throw Error('must not read') }
  for (const value of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(fetchAllPages(fetch, value), /pageSize/)
    await assert.rejects(fetchAllPages(fetch, 1000, value), /concurrency/)
  }
})
