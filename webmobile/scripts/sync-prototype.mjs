import { cp, mkdir } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
await mkdir(new URL('prototype/public/assets/', root), { recursive: true })
await cp(new URL('public/assets/', root), new URL('prototype/public/assets/', root), { recursive: true })
await mkdir(new URL('prototype/src/app/', root), { recursive: true })
for (const file of ['App.tsx', 'fixtures.ts', 'styles.css', 'meter-reading.ts', 'meter-policy.mjs', 'meter-policy.d.mts', 'demo-payments.ts', 'PaymentScreen.tsx', 'MeterCamera.tsx', 'camera-framing.mjs', 'camera-framing.d.mts', 'auth-client.ts']) await cp(new URL(`src/${file}`, root), new URL(`prototype/src/app/${file}`, root))
console.log('Prototype source and assets synchronized from the website.')
