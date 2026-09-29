const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')

const root = process.cwd()
const mode = process.argv[2]
const packagePath = path.join(root, 'package.json')
const updatesRoot = path.join(root, 'updates')
const statePath = path.join(updatesRoot, 'state', 'manifest.json')

if (!['standard', 'quick', 'both', 'patch'].includes(mode)) {
  console.error('Usage: node scripts/create-update-artifacts.cjs <standard|quick|both|patch>')
  process.exit(1)
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const version = packageJson.version
const outputDir = path.join(updatesRoot, version)

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function removeDirWithRetry(dir) {
  if (!fs.existsSync(dir)) return true
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      removeDir(dir)
      if (!fs.existsSync(dir)) return true
    } catch (error) {
      if (attempt === 8) {
        console.warn(`Khong the xoa thu muc cu ${path.basename(dir)} sau 8 lan thu: ${error.message}`)
        return false
      }
      // Antivirus and Explorer can briefly hold a newly generated archive.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750)
    }
  }
  return false
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
      removeDirWithRetry(path.join(updatesRoot, entry.name))
    }
  }
}

function createStandard(zipPath = path.join(outputDir, `DBYHOME-${version}-standard.zip`)) {
  const zip = new AdmZip()
  zip.addFile('resources/app/package.json', fs.readFileSync(packagePath))
  addDirectoryToZip(zip, path.join(root, 'out'), 'resources/app/out')
  fs.writeFileSync(zipPath, zip.toBuffer())
  return zipPath
}

function createQuick(previous, currentFiles) {
  const previousFiles = previous?.files || {}
  const changedFiles = Object.keys(currentFiles).filter((file) => currentFiles[file] !== previousFiles[file])
  const deletedFiles = Object.keys(previousFiles).filter((file) => !currentFiles[file])
  const zip = new AdmZip()
  for (const relative of changedFiles) {
    const source = path.join(root, relative === 'package.json' ? 'package.json' : relative)
    zip.addFile(`resources/app/${relative}`, fs.readFileSync(source))
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
  zip.addFile('resources/app/.update-manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'))
  const zipPath = path.join(outputDir, `DBYHOME-${version}-quick.zip`)
  fs.writeFileSync(zipPath, zip.toBuffer())
  return { zipPath, manifest }
}

try {
  if (!fs.existsSync(path.join(root, 'out'))) {
    throw new Error('Khong tim thay thu muc out. Hay build electron-vite truoc.')
  }
  if (mode === 'patch') {
    ensureDir(path.join(root, 'dist'))
    console.log(createStandard(path.join(root, 'dist', `DBYHOME-PATCH-v${version}.zip`)))
    process.exit(0)
  }
  ensureDir(outputDir)

  const previous = readState()
  const currentFiles = {
    'package.json': sha256(path.join(root, 'package.json')),
    ...Object.fromEntries(
      Object.entries(collectFiles(path.join(root, 'out'))).map(([file, hash]) => [`out/${file}`, hash])
    )
  }
  for (const artifactMode of mode === 'both' ? ['quick', 'standard'] : [mode]) {
  let result
  if (artifactMode === 'standard') {
    result = { zipPath: createStandard(), manifest: { schema: 1, type: 'standard', version } }
  } else {
    result = createQuick(previous, currentFiles)
  }

  const manifestPath = path.join(outputDir, `DBYHOME-${version}-${artifactMode}-manifest.json`)
  fs.writeFileSync(manifestPath, JSON.stringify({ ...result.manifest, currentFiles }, null, 2) + '\n')
  console.log(result.zipPath)
  console.log(manifestPath)
  }
  writeState(currentFiles)
  pruneOldVersionDirectories()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
