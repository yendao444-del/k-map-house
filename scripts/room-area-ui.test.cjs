const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const http = require('node:http')
const { build } = require('esbuild')
const {
  chromium
} = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

const root = path.resolve(__dirname, '..')
const fixtureDb = `
export const fixture = { room: { id: 'area-test', name: 'Phòng thử diện tích', floor: 2,
  area: 12, base_rent: 2300000, status: 'vacant', created_at: '2026-10-14' },
  saves: [], fail: false, delay: 0 };
window.fixture = fixture;
export const getRoom = async () => ({ ...fixture.room });
export const getRooms = async () => [{ ...fixture.room }];
export const getInvoicesByRoom = async () => [];
export const getContracts = async () => [];
export const updateRoom = async (id, updates) => {
  fixture.saves.push({ id, updates });
  if (fixture.delay) await new Promise(resolve => setTimeout(resolve, fixture.delay));
  if (fixture.fail) throw new Error('Không thể kết nối máy chủ.');
  fixture.room = { ...fixture.room, ...updates };
  return { ...fixture.room };
};
export const updateContract = async () => {};
export const markTenantLeft = async () => {};
export const uploadRoomImage = async () => {};
export const deleteRoomImage = async () => {};
export const adjustRoomMeterReadings = async () => {};
`

for (const base of ['src/renderer/src', 'adminpwa/src/renderer/src']) {
  test(`${base}: area saves, cache refresh, validation and failure recovery`, async () => {
    const component = path.join(root, base, 'components/RoomDetailsModal.tsx')
    const result = await build({
      stdin: {
        contents: `import React, { useState } from 'react';
          import { createRoot } from 'react-dom/client';
          import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
          import { RoomDetailsModal } from ${JSON.stringify(component)};
          import { fixture, getRooms } from 'fixture-db';
          const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
          window.client = client;
          function App() {
            const [open, setOpen] = useState(true);
            const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms });
            return <><output data-testid="list-area">{rooms[0]?.area}</output>
              <button onClick={() => setOpen(true)}>Mở phòng thử</button>
              {open && <RoomDetailsModal room={fixture.room} zone={null} zones={[]}
                onClose={() => setOpen(false)} />}</>;
          }
          createRoot(document.getElementById('root')).render(
            <QueryClientProvider client={client}><App /></QueryClientProvider>);`,
        resolveDir: root,
        loader: 'tsx'
      },
      bundle: true,
      write: false,
      plugins: [
        {
          name: 'isolated-room-data',
          setup(builder) {
            builder.onResolve(
              { filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?|@tanstack\/react-query)$/ },
              (args) => ({ path: require.resolve(args.path, { paths: [root] }) })
            )
            builder.onResolve({ filter: /^(fixture-db|\.\.\/lib\/db)$/ }, () => ({
              path: 'db',
              namespace: 'fixture'
            }))
            builder.onResolve(
              { filter: /^\.\/(PaymentModal|RoomAssetsTab|RoomVehiclesTab|LogoLoading)$/ },
              (args) => ({ path: args.path.slice(2), namespace: 'stub' })
            )
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
              contents: fixtureDb,
              loader: 'js'
            }))
            builder.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
              contents: `export const ${args.path} = () => null;`,
              loader: 'js'
            }))
          }
        }
      ]
    })
    const server = http.createServer((req, res) => {
      res.setHeader(
        'Content-Type',
        req.url === '/bundle.js' ? 'application/javascript' : 'text/html; charset=utf-8'
      )
      res.end(
        req.url === '/bundle.js'
          ? result.outputFiles[0].text
          : '<div id="root"></div><script src="/bundle.js"></script>'
      )
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    let browser
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath:
          'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe'
      })
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      const area = page.getByRole('spinbutton', { name: 'Diện tích phòng (m²)' })
      const edit = async (value) => {
        await page.getByText(`${value} m²`, { exact: true }).click()
        await area.waitFor()
      }

      await edit(12)
      await area.fill('18')
      await page.getByRole('button', { name: 'Lưu', exact: true }).click()
      await page.getByText('18 m²', { exact: true }).waitFor()
      await page.waitForFunction(
        () => document.querySelector('[data-testid="list-area"]').textContent === '18'
      )
      assert.equal(await page.evaluate(() => window.fixture.room.area), 18)
      assert.equal(
        await page.evaluate(() => window.client.getQueryData(['room', 'area-test']).area),
        18
      )
      await page.getByRole('button', { name: 'Đóng', exact: true }).click()
      await page.getByRole('button', { name: 'Mở phòng thử' }).click()
      await page.getByText('18 m²', { exact: true }).waitFor()

      await edit(18)
      await area.fill('18.5')
      await area.press('Enter')
      await page.getByText('18.5 m²', { exact: true }).waitFor()
      await edit(18.5)
      for (const invalid of ['', '0', '-3']) {
        await area.fill(invalid)
        await page.getByRole('button', { name: 'Lưu', exact: true }).click()
        await page
          .getByRole('alert')
          .filter({ hasText: 'Diện tích phải là số lớn hơn 0 m².' })
          .waitFor()
        assert.equal(await page.evaluate(() => window.fixture.saves.length), 2)
      }

      await area.fill('20')
      await page.evaluate(() => {
        window.fixture.fail = true
      })
      await page.getByRole('button', { name: 'Lưu', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'Không thể kết nối máy chủ.' }).waitFor()
      assert.equal(await area.inputValue(), '20')
      assert.equal(await page.evaluate(() => window.fixture.room.area), 18.5)
      // A background refetch must not overwrite the draft after an error.
      await page.evaluate(() =>
        window.client.invalidateQueries({ queryKey: ['room', 'area-test'] })
      )
      assert.equal(await area.inputValue(), '20')

      await page.evaluate(() => {
        window.fixture.fail = false
        window.fixture.delay = 300
      })
      await page.getByRole('button', { name: 'Lưu', exact: true }).click()
      assert.equal(
        await page.getByRole('button', { name: 'Đang lưu...', exact: true }).isDisabled(),
        true
      )
      assert.equal(await area.isDisabled(), true)
      await page.getByText('20 m²', { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => window.fixture.saves.length), 4)

      await edit(20)
      await area.fill('30')
      await area.press('Escape')
      await page.getByText('20 m²', { exact: true }).waitFor()
      await edit(20)
      assert.equal(await area.inputValue(), '20')
      await page.getByRole('button', { name: 'Hủy', exact: true }).click()
      assert.equal(await page.evaluate(() => window.fixture.saves.length), 4)
      assert.deepEqual(errors, [])
    } finally {
      await browser?.close()
      await new Promise((resolve) => server.close(resolve))
    }
  })
}
