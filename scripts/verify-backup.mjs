import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import AdmZip from 'adm-zip'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function fail(message) {
  throw new Error(message)
}

function readEntry(zip, name) {
  const entry = zip.getEntry(name)
  if (!entry) fail(`Missing archive entry: ${name}`)
  return entry.getData()
}

function verifyManifestFile(zip, archivePath, expected) {
  const bytes = readEntry(zip, archivePath)
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
    fail(`Checksum mismatch: ${archivePath}`)
  }
}

function verifyBackup(zipPath) {
  if (!existsSync(zipPath)) fail(`Backup file does not exist: ${zipPath}`)
  const zipBytes = readFileSync(zipPath)
  const archiveHash = sha256(zipBytes)
  const checksumPath = join(dirname(zipPath), `${basename(zipPath, '.zip')}.sha256`)
  if (!existsSync(checksumPath)) fail(`Missing checksum file: ${checksumPath}`)
  const checksumLine = readFileSync(checksumPath, 'utf8').trim()
  const match = /^([a-f0-9]{64})\s+(.+)$/i.exec(checksumLine)
  if (!match || match[1].toLowerCase() !== archiveHash || match[2] !== basename(zipPath)) {
    fail(`Archive SHA-256 does not match: ${checksumPath}`)
  }

  const zip = new AdmZip(zipBytes)
  if (!zip.test()) fail('ZIP integrity check failed')
  const metadata = JSON.parse(readEntry(zip, 'metadata.json').toString('utf8'))
  if (metadata.format !== 'dby-home-logical-backup' || !metadata.tables) {
    fail('Unknown or incomplete backup format')
  }

  for (const [table, expectedCount] of Object.entries(metadata.tables)) {
    if (!/^[a-z_]+$/.test(table)) fail(`Invalid table name in metadata: ${table}`)
    const rows = JSON.parse(readEntry(zip, `database/${table}.json`).toString('utf8'))
    if (!Array.isArray(rows) || rows.length !== expectedCount) {
      fail(`Row count mismatch: ${table}`)
    }
  }

  const storageFiles = metadata.storage?.files || []
  for (const file of storageFiles) {
    if (!file.path || file.path.includes('..') || file.path.startsWith('/')) {
      fail('Invalid Storage path in metadata')
    }
    verifyManifestFile(zip, `storage/${metadata.storage.bucket}/${file.path}`, file)
  }

  const localFiles = metadata.localState || []
  for (const file of localFiles) {
    const appData = process.env.APPDATA
    if (!appData || !file.path.startsWith(appData)) fail('Cannot verify local state path')
    const relativePath = file.path.slice(appData.length).replace(/^[/\\]+/, '').replaceAll('\\', '/')
    if (relativePath.includes('..')) fail('Invalid local state path in metadata')
    verifyManifestFile(zip, `local-state/${relativePath}`, file)
  }

  return {
    file: zipPath,
    sha256: archiveHash,
    createdAt: metadata.createdAt,
    tables: Object.keys(metadata.tables).length,
    rows: Object.values(metadata.tables).reduce((sum, count) => sum + count, 0),
    storageFiles: storageFiles.length,
    localFiles: localFiles.length,
    skippedTables: Object.keys(metadata.skippedTables || {})
  }
}

try {
  const zipPath = process.argv[2]
  if (!zipPath) fail('Usage: node scripts/verify-backup.mjs <backup.zip>')
  const result = verifyBackup(resolve(zipPath))
  console.log('BACKUP FILE VERIFIED (restore not tested)')
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(`BACKUP VERIFICATION FAILED: ${error.message}`)
  process.exitCode = 1
}
