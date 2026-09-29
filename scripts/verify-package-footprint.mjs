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

const entries = listPackage(asarPath).map((entry) => entry.replace(/^[/\\]+/, ''))
const forbidden = [
  'node_modules/recharts/',
  'node_modules/lightweight-charts/',
  'node_modules/lucide-react/',
  'service-price-zone-demo.png',
  'node_modules/es-toolkit/',
  'node_modules/@reduxjs/toolkit/',
  'node_modules/victory-vendor/',
  'node_modules/immer/',
  'node_modules/react-redux/',
  'node_modules/@tanstack/query-core/',
  'node_modules/@tanstack/react-query/'
]
const violations = entries.filter((entry) => forbidden.some((prefix) => entry === prefix || entry.startsWith(prefix)))
if (violations.length) {
  throw new Error(`Forbidden packaged files found:\n${violations.slice(0, 20).join('\n')}`)
}

const fileBytes = entries.reduce((total, entry) => {
  try {
    const stat = statFile(asarPath, entry)
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
  forbiddenEntries: 0,
  electronRuntime: JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version
}
console.log(JSON.stringify(report, null, 2))
