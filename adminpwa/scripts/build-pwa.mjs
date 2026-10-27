import { readFile, writeFile, readdir, mkdir, cp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const project = fileURLToPath(new URL('../', import.meta.url))
if (process.argv.includes('--assets')) {
  // Reuse supplied source assets. This never generates substitute brand art.
  const sharp = (await import('sharp')).default
  await mkdir(path.join(project, 'public/icons'), { recursive: true })
  const source = path.join(project, 'src/renderer/src/assets/an_khang_home_logo.png')
  for (const size of [192, 512]) await sharp(source).resize(size, size, { fit: 'contain', background: 'white' }).png().toFile(path.join(project, `public/icons/icon-${size}.png`))
  await sharp(source).resize(300, 300, { fit: 'contain', background: 'white' }).extend({ top: 106, right: 106, bottom: 106, left: 106, background: 'white' }).png().toFile(path.join(project, 'public/icons/icon-maskable-512.png'))
  await mkdir(path.join(project, 'public/ocr'), { recursive: true })
  for (const lang of ['eng', 'vie']) await cp(path.join(project, `../resources/identity-ocr/${lang}.traineddata`), path.join(project, `public/ocr/${lang}.traineddata`))
  // Tesseract worker and WASM cores also stay on this origin, not a CDN.
  await cp(path.join(project, 'node_modules/tesseract.js/dist/worker.min.js'), path.join(project, 'public/ocr/worker.min.js'))
  await cp(path.join(project, 'node_modules/tesseract.js-core'), path.join(project, 'public/ocr/core'), { recursive: true })
  console.log('Source logo/icons and local OCR runtime prepared.')
} else {
  const dist = path.join(project, 'dist')
  const content = await readFile(path.join(dist, 'index.html'), 'utf8')
  const id = createHash('sha256').update(content).digest('hex').slice(0, 16)
  const version = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8')).version
  const assets = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png']
  for (const file of await readdir(path.join(dist, 'assets'))) assets.push(`/assets/${file}`)
  await writeFile(path.join(dist, 'version.json'), JSON.stringify({ version, buildId: id, publishedAt: new Date().toISOString(), releaseNotes: 'Phiên bản PWA quản lý AN KHANG HOME.' }))
  const template = await readFile(path.join(project, 'scripts/service-worker.template.js'), 'utf8')
  await writeFile(path.join(dist, 'sw.js'), template.replace('__BUILD_ID__', id).replace('__ASSETS__', JSON.stringify(assets)))
  console.log(`PWA shell generated for build ${id}; ${assets.length} public assets, no API/private-data caching.`)
}
