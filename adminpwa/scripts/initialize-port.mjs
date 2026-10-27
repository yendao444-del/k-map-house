import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('../', import.meta.url))
const workspace = path.resolve(project, '..')
const sourceRoots = ['src/renderer/src', 'src/shared']
const protectedFiles = ['package.json', 'package-lock.json', 'electron.vite.config.ts', 'electron-builder.yml', 'tsconfig.web.json', 'src/preload/index.d.ts']
async function files(directory) {
  const result = []
  for (const entry of await readdir(path.join(workspace, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`
    if (entry.isDirectory()) result.push(...await files(relative))
    else if (entry.isFile()) result.push(relative)
  }
  return result
}
const hash = async (relative) => createHash('sha256').update(await readFile(path.join(workspace, relative))).digest('hex')
const snapshotPath = path.join(project, 'qa/electron-source-baseline.json')
if (process.argv.includes('--verify')) {
  const baseline = JSON.parse(await readFile(snapshotPath, 'utf8'))
  const changes = []
  for (const [relative, before] of Object.entries(baseline.files)) {
    if (await hash(relative) !== before) changes.push(relative)
  }
  console.log(JSON.stringify({ checked: Object.keys(baseline.files).length, unchanged: changes.length === 0, changes }, null, 2))
  if (changes.length) process.exitCode = 1
} else {
  try { await readFile(snapshotPath); throw new Error('Port already initialized. Never overwrite PWA edits with Electron source.') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  await mkdir(path.join(project, 'qa'), { recursive: true })
  const baseline = { capturedAt: new Date().toISOString(), source: 'Electron read-only source, working tree', files: {} }
  for (const relative of [...(await Promise.all(sourceRoots.map(files))).flat(), ...protectedFiles]) baseline.files[relative] = await hash(relative)
  await writeFile(snapshotPath, `${JSON.stringify(baseline, null, 2)}\n`)
  for (const relative of sourceRoots) await cp(path.join(workspace, relative), path.join(project, relative), { recursive: true, force: false, errorOnExist: true })
  await mkdir(path.join(project, 'src/preload'), { recursive: true })
  await cp(path.join(workspace, 'src/preload/index.d.ts'), path.join(project, 'src/preload/index.d.ts'), { errorOnExist: true })
  console.log(`Initialized isolated PWA copy; ${Object.keys(baseline.files).length} protected Electron source files fingerprinted.`)
}
