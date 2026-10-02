import fs from 'node:fs'
import path from 'node:path'
import { listPackage, statFile, extractFile } from '@electron/asar'

const root = process.cwd()
const sourcePackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const asarPath = path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar')
const installerPath = path.join(root, 'dist', `DBYHOME-${sourcePackage.version}-setup.exe`)

if (!fs.existsSync(asarPath)) throw new Error(`Missing ${asarPath}; run npm run build:win first.`)
if (!fs.existsSync(installerPath)) throw new Error(`Missing ${installerPath}; run npm run build:win first.`)
const packedPackage = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'))
if (packedPackage.version !== sourcePackage.version) {
  throw new Error(`Packaged version ${packedPackage.version} differs from source ${sourcePackage.version}`)
}

const entries = listPackage(asarPath).map((entry) => entry.replaceAll('\\', '/').replace(/^\/+/, ''))
const forbidden = [
  'node_modules/recharts/',
  'node_modules/lucide-react/',
  'service-price-zone-demo.png',
  'node_modules/es-toolkit/',
  'node_modules/@reduxjs/toolkit/',
  'node_modules/victory-vendor/',
  'node_modules/immer/',
  'node_modules/react-redux/',
  'node_modules/@tanstack/query-core/',
  'node_modules/@tanstack/react-query/',
  'node_modules/@supabase/',
  'node_modules/react-to-print/',
  'node_modules/googleapis/',
  'node_modules/google-auth-library/',
  'node_modules/googleapis-common/',
  'node_modules/gaxios/',
  'node_modules/gcp-metadata/',
  'node_modules/google-logging-utils/',
  'node_modules/jws/',
  'node_modules/gtoken/',
  'generated_demos/',
  'design-demos/'
]
const violations = entries.filter((entry) => forbidden.some((prefix) => entry === prefix || entry.startsWith(prefix)))
if (violations.length) {
  throw new Error(`Forbidden packaged files found:\n${violations.slice(0, 20).join('\n')}`)
}

const fileBytes = entries.reduce((total, entry) => {
  try {
    const stat = statFile(asarPath, entry.replaceAll('/', path.sep))
    return total + (stat.files ? 0 : stat.size || 0)
  } catch {
    return total
  }
}, 0)

const report = {
  version: packedPackage.version,
  installerBytes: fs.statSync(installerPath).size,
  asarBytes: fs.statSync(asarPath).size,
  asarFileBytes: fileBytes,
  // asarFileBytes includes logical unpacked entries. Do not add it to physical
  // ASAR bytes; report the real installed tree independently to avoid treating
  // byte relocation into app.asar.unpacked as a footprint reduction.
  unpackedBytes: directoryBytes(`${asarPath}.unpacked`),
  installedBytes: directoryBytes(path.join(root, 'dist', 'win-unpacked')),
  forbiddenEntries: 0,
  electronRuntime: JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version
}
console.log(JSON.stringify(report, null, 2))

function directoryBytes(directory) {
  if (!fs.existsSync(directory)) return 0
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const target = path.join(directory, entry.name)
    return total + (entry.isDirectory() ? directoryBytes(target) : entry.isFile() ? fs.statSync(target).size : 0)
  }, 0)
}
