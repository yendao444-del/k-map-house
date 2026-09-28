import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'
import AdmZip from 'adm-zip'
import { createClient } from '@supabase/supabase-js'

const SCRIPT_VERSION = '1.0.0'
const PAGE_SIZE = 500
const RETENTION_DAYS = 30

// These are the tables used by the application. The export is intentionally
// explicit so a schema change cannot silently remove a table from the backup.
const TABLES = [
  'app_settings',
  'asset_snapshots',
  'asset_templates',
  'cash_transactions',
  'contracts',
  'debt_entries',
  'invoices',
  'meter_reading_adjustments',
  'move_in_receipts',
  'payment_event_keys',
  'payment_events',
  'room_asset_adjustments',
  'room_assets',
  'room_vehicles',
  'rooms',
  'service_zones',
  'tenants',
  'users'
]
const OPTIONAL_TABLES = new Set(['meter_reading_adjustments'])

function parseArgs(argv) {
  const args = { local: 'F:\\BACKUP', online: 'H:\\My Drive\\BACKUP', dryRun: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--dry-run') args.dryRun = true
    else if (value === '--local') args.local = argv[++index]
    else if (value === '--online') args.online = argv[++index]
    else if (value.startsWith('--retention-days=')) args.retentionDays = Number(value.split('=')[1])
  }
  return args
}

function parseDotEnv(filePath) {
  if (!existsSync(filePath)) return {}
  const values = {}
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

function loadConfig() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const fileValues = parseDotEnv(join(root, '.env'))
  const url = process.env.SUPABASE_URL || fileValues.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || fileValues.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env or the environment.')
  }
  return { root, url, key }
}

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true })
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`Cannot access backup directory: ${path}`)
}

async function exportTable(client, table) {
  const rows = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.from(table).select('*').range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`Table ${table}: ${error.message}`)
    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

function isMissingTableError(error) {
  return /could not find the table|relation .* does not exist|schema cache/i.test(error.message)
}

async function listStorageFiles(bucket) {
  const files = []
  const folders = ['']
  while (folders.length > 0) {
    const prefix = folders.shift()
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(prefix, { limit: 100, offset })
      if (error) throw new Error(`Storage list ${prefix || '/'}: ${error.message}`)
      const entries = data || []
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.id) files.push(path)
        else folders.push(path)
      }
      if (entries.length < 100) break
    }
  }
  return files
}

async function addStorageToZip(zip, bucket, paths) {
  const manifest = []
  for (const path of paths) {
    const { data, error } = await bucket.download(path)
    if (error) throw new Error(`Storage download ${path}: ${error.message}`)
    const bytes = Buffer.from(await data.arrayBuffer())
    const archivePath = join('storage', 'room-images', path).replaceAll('\\', '/')
    zip.addFile(archivePath, bytes)
    manifest.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  return manifest
}

function checksum(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function collectLocalState() {
  const appData = process.env.APPDATA
  if (!appData) return []
  const candidates = [
    join(appData, 'DBY HOME', 'phongtro_db.json'),
    join(appData, 'DBY HOME', 'investment-portfolio.json'),
    join(appData, 'com.kmaphouse.app', 'phongtro_db.json'),
    join(appData, 'com.kmaphouse.app', 'investment-portfolio.json'),
    join(appData, 'app', 'phongtro_db.json'),
    join(appData, 'com.ncpc.dbyfinance', 'portfolio-data.json')
  ]
  return Array.from(new Set(candidates)).filter((filePath) => existsSync(filePath) && statSync(filePath).isFile())
}

function addLocalStateToZip(zip, files) {
  const appData = process.env.APPDATA || ''
  return files.map((filePath) => {
    const bytes = readFileSync(filePath)
    const relativePath = relative(appData, filePath).replaceAll('\\', '/')
    zip.addFile(`local-state/${relativePath}`, bytes)
    return { path: filePath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  })
}

function writeAtomic(filePath, bytes) {
  const tempPath = `${filePath}.part`
  writeFileSync(tempPath, bytes)
  renameSync(tempPath, filePath)
}

function cleanupRetention(directory, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  for (const name of readdirSync(directory)) {
    if (!name.startsWith('dby-home-backup-') || (!name.endsWith('.zip') && !name.endsWith('.sha256'))) continue
    const filePath = join(directory, name)
    if (statSync(filePath).mtimeMs < cutoff) rmSync(filePath, { force: true })
  }
}

function printDryRun(args, config) {
  console.log(`[DRY-RUN] Supabase: ${config.url}`)
  console.log(`[DRY-RUN] Local: ${args.local}`)
  console.log(`[DRY-RUN] Online: ${args.online}`)
  console.log(`[DRY-RUN] Tables: ${TABLES.length}`)
  console.log('[DRY-RUN] No data was read or written.')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const config = loadConfig()
  if (args.dryRun) {
    printDryRun(args, config)
    return
  }

  ensureDirectory(args.local)
  ensureDirectory(args.online)

  const client = createClient(config.url, config.key, { auth: { autoRefreshToken: false, persistSession: false } })
  const createdAt = new Date()
  const stamp = createdAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const baseName = `dby-home-backup-${stamp}`
  const zipName = `${baseName}.zip`
  const localZip = join(args.local, zipName)
  const onlineZip = join(args.online, zipName)
  const zip = new AdmZip()
  const tableCounts = {}
  const skippedTables = {}

  console.log(`Exporting ${TABLES.length} Supabase tables...`)
  for (const table of TABLES) {
    let rows
    try {
      rows = await exportTable(client, table)
    } catch (error) {
      if (OPTIONAL_TABLES.has(table) && isMissingTableError(error)) {
        skippedTables[table] = error.message
        console.warn(`  ${table}: skipped (table is not present in production)`)
        continue
      }
      throw error
    }
    tableCounts[table] = rows.length
    zip.addFile(`database/${table}.json`, Buffer.from(JSON.stringify(rows, null, 2), 'utf8'))
    console.log(`  ${table}: ${rows.length} rows`)
  }

  const storageBucket = client.storage.from('room-images')
  const storagePaths = await listStorageFiles(storageBucket)
  const storageManifest = await addStorageToZip(zip, storageBucket, storagePaths)
  const localStateManifest = addLocalStateToZip(zip, collectLocalState())

  const metadata = {
    format: 'dby-home-logical-backup',
    version: SCRIPT_VERSION,
    createdAt: createdAt.toISOString(),
    sourceProject: config.url,
    tables: tableCounts,
    skippedTables,
    storage: { bucket: 'room-images', files: storageManifest },
    localState: localStateManifest,
    limitations: [
      'Logical export through Supabase API; it is not a PostgreSQL physical dump.',
      'Auth internal records, database schema objects and Supabase project settings are not included.',
      'Restore must be tested in an isolated project before production use.'
    ]
  }
  zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'))

  const bytes = zip.toBuffer()
  writeAtomic(localZip, bytes)
  const localHash = checksum(localZip)
  writeAtomic(join(args.local, `${baseName}.sha256`), Buffer.from(`${localHash}  ${zipName}\n`, 'utf8'))

  try {
    copyFileSync(localZip, onlineZip)
    writeAtomic(join(args.online, `${baseName}.sha256`), Buffer.from(`${localHash}  ${zipName}\n`, 'utf8'))
  } catch (error) {
    console.error(`[ERROR] Local backup succeeded, but online copy failed: ${error.message}`)
    process.exitCode = 2
    return
  }

  cleanupRetention(args.local, args.retentionDays || RETENTION_DAYS)
  cleanupRetention(args.online, args.retentionDays || RETENTION_DAYS)
  console.log(`Backup written to: ${localZip}`)
  console.log(`Backup copied to: ${onlineZip}`)
  console.log(`SHA-256: ${localHash}`)
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`)
  process.exitCode = 1
})
