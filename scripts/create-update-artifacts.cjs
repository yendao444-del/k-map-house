const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')

const root = process.cwd()
const mode = process.argv[2]
const packagePath = path.join(root, 'package.json')
const updatesRoot = path.join(root, 'updates')
const statePath = path.join(updatesRoot, 'state', 'manifest.json')

if (!['standard', 'quick'].includes(mode)) {
  console.error('Usage: node scripts/create-update-artifacts.cjs <standard|quick>')
  process.exit(1)
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const version = packageJson.version
const outputDir = path.join(updatesRoot, version)
const tempDir = path.join(updatesRoot, `.tmp-${mode}-${Date.now()}`)

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function collectFiles(dir, prefix = '') {
  const result = {}
  if (!fs.existsSync(dir)) return result
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name).replace(/\\/g, '/')
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      Object.assign(result, collectFiles(fullPath, relative))
    } else {
      result[relative] = sha256(fullPath)
    }
  }
  return result
}

function copyFile(source, target) {
  ensureDir(path.dirname(target))
  fs.copyFileSync(source, target)
}

function addDirectoryToZip(zip, sourceDir, zipPrefix) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const zipPath = path.posix.join(zipPrefix, entry.name)
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, sourcePath, zipPath)
    } else {
      zip.addFile(zipPath, fs.readFileSync(sourcePath))
    }
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'))
  } catch {
    return null
  }
}

function writeState(files) {
  ensureDir(path.dirname(statePath))
  fs.writeFileSync(
    statePath,
    JSON.stringify({ version, files, generatedAt: new Date().toISOString() }, null, 2) + '\n'
  )
}

function pruneOldVersionDirectories() {
  if (!fs.existsSync(updatesRoot)) return
  for (const entry of fs.readdirSync(updatesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'state' || entry.name === version) continue
    if (/^\d+\.\d+\.\d+$/.test(entry.name)) {
      removeDir(path.join(updatesRoot, entry.name))
    }
  }
}

function createStandard() {
  const appRoot = path.join(tempDir, 'resources', 'app')
  copyFile(path.join(root, 'package.json'), path.join(appRoot, 'package.json'))
  fs.cpSync(path.join(root, 'out'), path.join(appRoot, 'out'), { recursive: true })

  const zip = new AdmZip()
  addDirectoryToZip(zip, path.join(tempDir, 'resources'), 'resources')
  const zipPath = path.join(outputDir, `DBYHOME-${version}-standard.zip`)
  zip.writeZip(zipPath)
  return zipPath
}

function createQuick(previous) {
  const currentFiles = {
    'package.json': sha256(path.join(root, 'package.json')),
    ...Object.fromEntries(
      Object.entries(collectFiles(path.join(root, 'out'))).map(([file, hash]) => [`out/${file}`, hash])
    )
  }
  const previousFiles = previous?.files || {}
  const changedFiles = Object.keys(currentFiles).filter((file) => currentFiles[file] !== previousFiles[file])
  const deletedFiles = Object.keys(previousFiles).filter((file) => !currentFiles[file])
  const appRoot = path.join(tempDir, 'resources', 'app')

  for (const relative of changedFiles) {
    const source = path.join(root, relative === 'package.json' ? 'package.json' : relative)
    copyFile(source, path.join(appRoot, relative))
  }

  const manifest = {
    schema: 1,
    type: 'quick',
    version,
    fromVersion: previous?.version || null,
    files: changedFiles,
    deletedFiles,
    generatedAt: new Date().toISOString()
  }
  fs.writeFileSync(path.join(appRoot, '.update-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

  const zip = new AdmZip()
  addDirectoryToZip(zip, path.join(tempDir, 'resources'), 'resources')
  const zipPath = path.join(outputDir, `DBYHOME-${version}-quick.zip`)
  zip.writeZip(zipPath)
  return { zipPath, manifest }
}

try {
  if (!fs.existsSync(path.join(root, 'out'))) {
    throw new Error('Khong tim thay thu muc out. Hay build electron-vite truoc.')
  }
  ensureDir(outputDir)
  removeDir(tempDir)
  ensureDir(tempDir)

  const previous = readState()
  const currentFiles = {
    'package.json': sha256(path.join(root, 'package.json')),
    ...Object.fromEntries(
      Object.entries(collectFiles(path.join(root, 'out'))).map(([file, hash]) => [`out/${file}`, hash])
    )
  }
  let result
  if (mode === 'standard') {
    result = { zipPath: createStandard(), manifest: { schema: 1, type: 'standard', version } }
  } else {
    result = createQuick(previous)
  }

  const manifestPath = path.join(outputDir, `DBYHOME-${version}-${mode}-manifest.json`)
  fs.writeFileSync(manifestPath, JSON.stringify({ ...result.manifest, currentFiles }, null, 2) + '\n')
  writeState(currentFiles)
  pruneOldVersionDirectories()
  console.log(result.zipPath)
  console.log(manifestPath)
} finally {
  removeDir(tempDir)
}
