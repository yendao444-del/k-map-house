import { app, BrowserWindow, ipcMain } from 'electron'
import AdmZip from 'adm-zip'
import { createPackage, extractAll } from '@electron/asar'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { get } from 'http'
import { get as httpsGet, request as httpsRequest } from 'https'
import { cpus } from 'os'
import { dirname, join, relative } from 'path'
import { reportTelegramError } from './telegram-reporter'

interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
  digest?: string | null
}

interface GithubRelease {
  tag_name: string
  body?: string
  published_at: string
  assets: ReleaseAsset[]
}

interface LatestYmlInfo {
  version: string
  path: string
  size: number
  sha512?: string
  releaseDate: string
}

interface UpdateManifest {
  schema?: number
  type?: 'quick' | 'standard'
  version?: string
  fromVersion?: string | null
  deletedFiles?: string[]
}

interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseNotes: string
  publishedAt: string
  downloadUrl: string | null
  downloadSize: number
  artifactType: 'installer' | 'standard' | 'quick' | 'zip' | 'none'
  fileName: string | null
  checksum: string | null
}

let releaseCache: GithubRelease | null = null
let releaseCacheTime = 0
let updateInProgress = false
const CACHE_DURATION = 5 * 60 * 1000
const GENERIC_RELEASE_BASE_URL = 'https://github.com/yendao444-del/k-map-house/releases/latest/download/'

function readPackageJson(): { homepage?: string; version?: string } {
  try {
    return JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf-8'))
  } catch {
    return {}
  }
}

function resolveRepoInfo(): { owner: string; repo: string } | null {
  const homepage = readPackageJson().homepage || ''
  const match = homepage.match(/github\.com\/([^/]+)\/([^/#]+)/i)
  if (!match) return null

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, '')
  }
}

function sendToRenderer(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i += 1) {
    const a = parts1[i] || 0
    const b = parts2[i] || 0
    if (a > b) return 1
    if (a < b) return -1
  }
  return 0
}

function resolveReleaseAssetUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${GENERIC_RELEASE_BASE_URL}${encodeURIComponent(pathOrUrl)}`
}

function assertAllowedUpdateUrl(rawUrl: string): void {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Đường dẫn cập nhật không hợp lệ.')
  }

  const allowedHosts = new Set([
    'github.com',
    'objects.githubusercontent.com',
    'release-assets.githubusercontent.com'
  ])
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error('Bản cập nhật phải được tải từ GitHub chính thức.')
  }
}

async function verifyFileChecksum(filePath: string, expected: string | null | undefined): Promise<void> {
  if (!expected) throw new Error('Bản cập nhật không có checksum để xác minh.')

  const separator = expected.includes(':') ? ':' : '-'
  const [algorithm, expectedValue] = expected.split(separator, 2)
  if (!algorithm || !expectedValue || !['sha256', 'sha512'].includes(algorithm.toLowerCase())) {
    throw new Error('Checksum bản cập nhật không hợp lệ.')
  }

  const hash = createHash(algorithm.toLowerCase())
  hash.update(readFileSync(filePath))
  const actualHex = hash.digest('hex')
  const actualBase64 = Buffer.from(actualHex, 'hex').toString('base64')
  if (expectedValue !== actualHex && expectedValue !== actualBase64) {
    throw new Error('Checksum bản cập nhật không khớp.')
  }
}

function parseLatestYml(raw: string): LatestYmlInfo | null {
  const version = raw.match(/^version:\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim()
  const path =
    raw.match(/^path:\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim() ||
    raw.match(/^\s*-\s*url:\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim()
  const sizeValue = raw.match(/^\s*size:\s*(\d+)/m)?.[1]
  const sha512 = raw.match(/^sha512:\s*([^\r\n]+)$/m)?.[1]?.trim()
  const releaseDate = raw.match(/^releaseDate:\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim()

  if (!version || !path) return null

  return {
    version,
    path,
    size: sizeValue ? Number(sizeValue) : 0,
    sha512,
    releaseDate: releaseDate || new Date().toISOString()
  }
}

function fetchLatestRelease(repoInfo: { owner: string; repo: string }): Promise<GithubRelease> {
  if (releaseCache && Date.now() - releaseCacheTime < CACHE_DURATION) {
    return Promise.resolve(releaseCache)
  }

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: 'api.github.com',
        path: `/repos/${repoInfo.owner}/${repoInfo.repo}/releases/latest`,
        method: 'GET',
        headers: {
          'User-Agent': 'DBY-HOME-Desktop',
          Accept: 'application/vnd.github.v3+json'
        }
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Lỗi GitHub API: ${res.statusCode}`))
            return
          }

          try {
            const parsed = JSON.parse(raw) as GithubRelease
            releaseCache = parsed
            releaseCacheTime = Date.now()
            resolve(parsed)
          } catch {
            reject(new Error('Dữ liệu bản phát hành không hợp lệ.'))
          }
        })
      }
    )

    req.on('error', (error) => reject(new Error(`Lỗi mạng: ${error.message}`)))
    req.setTimeout(15000, () => {
      req.destroy()
      reject(new Error('Yêu cầu quá thời gian chờ.'))
    })
    req.end()
  })
}

function downloadFile(
  url: string,
  destinationPath: string,
  onProgress?: (downloaded: number, total: number, percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      assertAllowedUpdateUrl(url)
    } catch (error) {
      reject(error)
      return
    }
    const requestFn = url.startsWith('https:') ? httpsGet : get
    const request = requestFn(url, { headers: { 'User-Agent': 'DBY-HOME-Desktop' } }, (response) => {
      if (
        response.statusCode &&
        [301, 302, 307, 308].includes(response.statusCode) &&
        response.headers.location
      ) {
        try {
          assertAllowedUpdateUrl(response.headers.location)
        } catch (error) {
          reject(error)
          return
        }
        downloadFile(response.headers.location, destinationPath, onProgress).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Tải xuống thất bại: HTTP ${response.statusCode}`))
        return
      }

      const total = Number(response.headers['content-length'] || 0)
      let downloaded = 0
      let lastPercent = -1
      const fileStream = createWriteStream(destinationPath)

      response.on('data', (chunk) => {
        downloaded += chunk.length
        if (total > 0) {
          const percent = Math.round((downloaded / total) * 100)
          if (percent !== lastPercent) {
            lastPercent = percent
            onProgress?.(downloaded, total, percent)
          }
        }
      })

      response.pipe(fileStream)
      fileStream.on('finish', () => {
        fileStream.close()
        resolve()
      })
      fileStream.on('error', (error) => {
        try {
          unlinkSync(destinationPath)
        } catch {
          // ignore cleanup errors
        }
        reject(error)
      })
    })

    request.on('error', (error) => reject(new Error(`Lỗi tải xuống: ${error.message}`)))
    request.setTimeout(30000, () => {
      request.destroy()
      reject(new Error('Tải xuống quá thời gian chờ.'))
    })
  })
}

async function fetchText(url: string): Promise<string> {
  const tempDir = join(app.getPath('temp'), `kmaphouse-update-meta-${Date.now()}`)
  const tempPath = join(tempDir, 'latest.yml')
  mkdirSync(tempDir, { recursive: true })
  try {
    await downloadFile(url, tempPath)
    return readFileSync(tempPath, 'utf-8')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

async function fetchLatestYml(): Promise<LatestYmlInfo | null> {
  try {
    return parseLatestYml(await fetchText(`${GENERIC_RELEASE_BASE_URL}latest.yml`))
  } catch {
    return null
  }
}

function findAppRoot(rootDir: string): string | null {
  const directAppPackage = join(rootDir, 'resources', 'app', 'package.json')
  if (existsSync(directAppPackage)) return join(rootDir, 'resources', 'app')

  const directPackage = join(rootDir, 'package.json')
  if (existsSync(directPackage)) return rootDir

  for (const entry of readdirSync(rootDir)) {
    const fullPath = join(rootDir, entry)
    if (statSync(fullPath).isDirectory()) {
      const nested = findAppRoot(fullPath)
      if (nested) return nested
    }
  }

  return null
}

function collectFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const item of readdirSync(dir)) {
    const fullPath = join(dir, item)
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath))
    } else {
      files.push(fullPath)
    }
  }
  return files
}

function createLockedFileUpdater(tempDir: string, sourceRoot: string, targetRoot: string): void {
  const batPath = join(tempDir, 'apply-update.bat')
  const vbsPath = join(tempDir, 'apply-update.vbs')
  const batContent = `@echo off
chcp 65001 >nul
timeout /t 2 /nobreak >nul
xcopy "${sourceRoot}\\*" "${targetRoot}\\" /E /I /Y /Q >nul 2>&1
start "" "${process.execPath}"
timeout /t 3 /nobreak >nul
rmdir /S /Q "${tempDir}" 2>nul
exit
`
  writeFileSync(batPath, batContent, 'utf-8')
  writeFileSync(
    vbsPath,
    `Set shell = CreateObject("WScript.Shell")\r\nshell.Run chr(34) & "${batPath}" & chr(34), 0`,
    'utf-8'
  )
  spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore' }).unref()
}

function createAsarFileUpdater(tempDir: string, sourceAsar: string, targetAsar: string): void {
  const batPath = join(tempDir, 'apply-asar-update.bat')
  const vbsPath = join(tempDir, 'apply-asar-update.vbs')
  const batContent = `@echo off
chcp 65001 >nul
set "LOG=%TEMP%\\k-map-house-logs\\update-apply.log"
if not exist "%TEMP%\\k-map-house-logs" mkdir "%TEMP%\\k-map-house-logs"
set /a attempts=0
:retry
set /a attempts+=1
timeout /t 2 /nobreak >nul
copy /Y "${sourceAsar}" "${targetAsar}" >nul 2>&1
if not errorlevel 1 (
  fc /B "${sourceAsar}" "${targetAsar}" >nul 2>&1
  if not errorlevel 1 goto success
)
if %attempts% LSS 30 goto retry
echo [%date% %time%] Failed to replace app.asar after %attempts% attempts. >> "%LOG%"
exit /b 1
:success
echo [%date% %time%] Replaced and verified app.asar after %attempts% attempts. >> "%LOG%"
start "" "${process.execPath}"
timeout /t 3 /nobreak >nul
rmdir /S /Q "${tempDir}" 2>nul
exit
`
  writeFileSync(batPath, batContent, 'utf-8')
  writeFileSync(
    vbsPath,
    `Set shell = CreateObject("WScript.Shell")\r\nshell.Run chr(34) & "${batPath}" & chr(34), 0`,
    'utf-8'
  )
  spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore' }).unref()
}

function createSilentInstallerRunner(tempDir: string, installerPath: string): void {
  const batPath = join(tempDir, 'install-update.bat')
  const vbsPath = join(tempDir, 'install-update.vbs')
const batContent = `@echo off
chcp 65001 >nul
set "LOG=%TEMP%\\k-map-house-logs\\update-apply.log"
if not exist "%TEMP%\\k-map-house-logs" mkdir "%TEMP%\\k-map-house-logs"
timeout /t 2 /nobreak >nul
start /wait "" "${installerPath}" /S
if errorlevel 1 (
  echo [%date% %time%] Installer failed with exit code %errorlevel%. >> "%LOG%"
  exit /b 1
)
echo [%date% %time%] Installer completed. >> "%LOG%"
start "" "${process.execPath}"
timeout /t 3 /nobreak >nul
rmdir /S /Q "${tempDir}" 2>nul
exit
`

  writeFileSync(batPath, batContent, 'utf-8')
  writeFileSync(
    vbsPath,
    `Set shell = CreateObject("WScript.Shell")\r\nshell.Run chr(34) & "${batPath}" & chr(34), 0`,
    'utf-8'
  )
  spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore' }).unref()
}

async function readUpdateManifest(asset: ReleaseAsset | null): Promise<UpdateManifest | null> {
  if (!asset) return null
  try {
    return JSON.parse(await fetchText(asset.browser_download_url)) as UpdateManifest
  } catch {
    return null
  }
}

async function selectReleaseAsset(
  release: GithubRelease,
  currentVersion: string
): Promise<{ asset: ReleaseAsset | null; artifactType: UpdateCheckResult['artifactType'] }> {
  const zipAssets = release.assets.filter((asset) => asset.name.toLowerCase().endsWith('.zip'))
  const quickZip = zipAssets.find((asset) => /-quick\.zip$/i.test(asset.name)) || null
  const quickManifestAsset =
    release.assets.find((asset) => /-quick-manifest\.json$/i.test(asset.name)) ||
    release.assets.find((asset) => /update-manifest\.json$/i.test(asset.name)) ||
    null
  const quickManifest = await readUpdateManifest(quickManifestAsset)
  if (quickZip && quickZip.digest && quickManifest?.fromVersion === currentVersion) {
    return { asset: quickZip, artifactType: 'quick' }
  }

  const standardZip = zipAssets.find((asset) => /-standard\.zip$/i.test(asset.name)) || null
  const installer = release.assets.find((asset) => /-setup\.exe$/i.test(asset.name) && asset.digest) || null
  if (installer) {
    return { asset: installer, artifactType: 'installer' }
  }

  if (standardZip && standardZip.digest) {
    return { asset: standardZip, artifactType: 'standard' }
  }

  const patchZip = zipAssets.find((asset) => /DBYHOME-PATCH-v[\d.]+\.zip$/i.test(asset.name) && asset.digest)

  if (patchZip) return { asset: patchZip, artifactType: 'zip' }
  return { asset: null, artifactType: 'none' }
}

function isInstallerAsset(asset: ReleaseAsset | null): boolean {
  return Boolean(asset?.name.toLowerCase().endsWith('.exe'))
}

async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const repoInfo = resolveRepoInfo()
  if (repoInfo) {
    try {
      const latestRelease = await fetchLatestRelease(repoInfo)
      let release = latestRelease
      let selected = await selectReleaseAsset(latestRelease, currentVersion)

      // Quick releases are intentionally chained. If a machine is behind the
      // newest release, choose the first newer release whose package applies
      // to the installed version instead of showing an unusable update.
      if (!selected.asset) {
        let releases: GithubRelease[] = []
        try {
          releases = await fetchReleases(repoInfo)
        } catch {
          releases = []
        }
        for (const candidate of releases) {
          const candidateVersion = candidate.tag_name.replace(/^v/i, '')
          if (compareVersions(candidateVersion, currentVersion) <= 0) continue
          const candidateSelection = await selectReleaseAsset(candidate, currentVersion)
          if (candidateSelection.asset) {
            release = candidate
            selected = candidateSelection
            break
          }
        }
      }

      const latestVersion = release.tag_name.replace(/^v/i, '')
      const selectedAsset = selected.asset

      return {
        currentVersion,
        latestVersion,
        hasUpdate: compareVersions(latestVersion, currentVersion) > 0 && Boolean(selectedAsset?.digest),
        releaseNotes: release.body || 'Không có ghi chú.',
        publishedAt: release.published_at,
        downloadUrl: selectedAsset?.browser_download_url || null,
        downloadSize: selectedAsset?.size || 0,
        artifactType: isInstallerAsset(selectedAsset) ? 'installer' : selected.artifactType,
        fileName: selectedAsset?.name || null,
        checksum: selectedAsset?.digest || null
      }
    } catch {
      // Fallback to electron-builder latest.yml below.
    }
  }

  const latestYml = await fetchLatestYml()
  if (!latestYml || latestYml.path.toLowerCase().endsWith('.exe')) {
    throw new Error('Không tìm thấy gói cập nhật nhẹ trên GitHub. Hãy dùng bộ cài thủ công.')
  }

  return {
    currentVersion,
    latestVersion: latestYml.version,
    hasUpdate: compareVersions(latestYml.version, currentVersion) > 0,
    releaseNotes: 'Bản cập nhật đã sẵn sàng cài đặt.',
    publishedAt: latestYml.releaseDate,
    downloadUrl: resolveReleaseAssetUrl(latestYml.path),
    downloadSize: latestYml.size,
    artifactType: latestYml.path.toLowerCase().endsWith('.exe') ? 'installer' : 'zip',
    fileName: latestYml.path,
    checksum: latestYml.sha512 || null
  }
}

async function installUpdate(downloadUrl: string, checksum: string | null): Promise<{ version: string }> {
  if (updateInProgress) {
    throw new Error('Đang có bản cập nhật chạy.')
  }

  updateInProgress = true
  try {
    assertAllowedUpdateUrl(downloadUrl)
    return downloadUrl.toLowerCase().endsWith('.exe')
      ? await installWithSetup(downloadUrl, checksum)
      : await installWithZip(downloadUrl, checksum)
  } finally {
    updateInProgress = false
  }
}

async function installLatestUpdate(): Promise<{ version: string; latestVersion: string; applied: boolean }> {
  const update = await checkForUpdate()
  if (!update.hasUpdate) {
    sendToRenderer('update:status', {
      status: 'idle',
      message: 'Đang sử dụng bản mới nhất.',
      data: update
    })
    return { version: update.currentVersion, latestVersion: update.latestVersion, applied: false }
  }

  if (!update.downloadUrl || !update.checksum) {
    throw new Error('Bản phát hành không có tệp cập nhật phù hợp.')
  }

  sendToRenderer('update:available', update)
  const result = await installUpdate(update.downloadUrl, update.checksum)
  return { ...result, latestVersion: update.latestVersion, applied: true }
}

async function runAutoUpdateCheck(): Promise<void> {
  sendToRenderer('update:status', {
    status: 'checking',
    message: 'Đang tự động kiểm tra bản cập nhật...',
    silent: true
  })

  try {
    const data = await checkForUpdate()
    const silentData = { ...data, silent: true }
    sendToRenderer('update:status', {
      status: data.hasUpdate ? 'available' : 'idle',
      message: data.hasUpdate ? `Có bản mới v${data.latestVersion}.` : 'Đang sử dụng bản mới nhất.',
      data: silentData,
      silent: true
    })

    if (data.hasUpdate) {
      sendToRenderer('update:available', silentData)

      if (!data.downloadUrl || !data.checksum) {
        throw new Error('Bản phát hành không có tệp cập nhật phù hợp.')
      }

      // Keep the production flow unattended: download, verify and apply the
      // package as soon as the startup check finds a valid release.
      sendToRenderer('update:status', {
        status: 'downloading',
        message: `Đang tự động tải bản v${data.latestVersion}...`
      })
      await installUpdate(data.downloadUrl, data.checksum)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : error
    void reportTelegramError('update-auto-install-failed', { message })
    sendToRenderer('update:status', {
      status: 'error',
      message: typeof message === 'string' ? message : 'Không thể tự động cập nhật.',
      silent: true
    })
  }
}

async function installWithSetup(downloadUrl: string, checksum: string | null): Promise<{ version: string }> {
  const tempDir = join(app.getPath('temp'), `kmaphouse-installer-${Date.now()}`)
  const installerPath = join(tempDir, downloadUrl.split('/').pop() || 'DBYHOME-update-setup.exe')
  mkdirSync(tempDir, { recursive: true })

  sendToRenderer('update:status', { status: 'downloading', message: 'Đang tải bộ cài cập nhật...' })
  await downloadFile(downloadUrl, installerPath, (downloaded, total, percent) => {
    sendToRenderer('update:progress', { downloaded, total, percent })
  })
  await verifyFileChecksum(installerPath, checksum)

  sendToRenderer('update:status', { status: 'installing', message: 'Đang cài đặt bản cập nhật...' })
  createSilentInstallerRunner(tempDir, installerPath)

  setTimeout(() => {
    sendToRenderer('update:status', { status: 'restarting', message: 'Ứng dụng sẽ tự động hoàn tất cài đặt và khởi động lại...' })
  }, 300)
  // Phải quit trước khi VBS chạy installer (VBS timeout /t 2 = 2000ms)
  setTimeout(() => app.quit(), 1400)
  return { version: 'installer' }
}

async function installWithZip(downloadUrl: string, checksum: string | null): Promise<{ version: string }> {
  const tempDir = join(app.getPath('temp'), `kmaphouse-update-${Date.now()}-${cpus().length}`)
  const zipPath = join(tempDir, 'update.zip')
  const extractDir = join(tempDir, 'extracted')
  mkdirSync(tempDir, { recursive: true })
  mkdirSync(extractDir, { recursive: true })

  sendToRenderer('update:status', { status: 'downloading', message: 'Đang tải bản cập nhật...' })
  await downloadFile(downloadUrl, zipPath, (downloaded, total, percent) => {
    sendToRenderer('update:progress', { downloaded, total, percent })
  })
  await verifyFileChecksum(zipPath, checksum)

  sendToRenderer('update:status', { status: 'extracting', message: 'Đang giải nén...' })
  new AdmZip(zipPath).extractAllTo(extractDir, true)

  const sourceRoot = findAppRoot(extractDir) || extractDir
  const targetRoot = app.getAppPath()
  const sourceFiles = collectFiles(sourceRoot)
  const manifestPath = join(sourceRoot, '.update-manifest.json')
  let updateManifest: UpdateManifest | null = null
  if (existsSync(manifestPath)) {
    try {
      updateManifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as UpdateManifest
    } catch {
      throw new Error('Manifest bản cập nhật không hợp lệ.')
    }
  }
  if (
    updateManifest?.type === 'quick' &&
    updateManifest.fromVersion &&
    updateManifest.fromVersion !== app.getVersion()
  ) {
    throw new Error(
      `Gói quick chỉ dành cho v${updateManifest.fromVersion}, máy hiện tại đang v${app.getVersion()}.`
    )
  }

  const deletedFiles = (updateManifest?.deletedFiles || []).filter((file) => {
    const normalized = file.replace(/\\/g, '/')
    return normalized && !normalized.startsWith('/') && !normalized.includes('../') && !normalized.includes('..\\')
  })

  sendToRenderer('update:status', { status: 'installing', message: 'Đang cài đặt bản cập nhật...' })

  // app.getAppPath() points to the app.asar file in production. Build a replacement
  // archive instead of treating that file as a directory (which causes ENOTDIR).
  if (targetRoot.toLowerCase().endsWith('.asar')) {
    const mergedRoot = join(tempDir, 'merged-app')
    const replacementAsar = join(tempDir, 'replacement.asar')
    sendToRenderer('update:status', {
      status: 'installing',
      message: 'Đang chuẩn bị dữ liệu ứng dụng để cập nhật...'
    })
    await extractAll(targetRoot, mergedRoot)
    for (const sourceFile of sourceFiles) {
      const relativePath = relative(sourceRoot, sourceFile)
      const targetFile = join(mergedRoot, relativePath)
      mkdirSync(dirname(targetFile), { recursive: true })
      copyFileSync(sourceFile, targetFile)
    }
    for (const deletedFile of deletedFiles) {
      rmSync(join(mergedRoot, deletedFile), { force: true })
    }
    rmSync(join(mergedRoot, '.update-manifest.json'), { force: true })
    sendToRenderer('update:status', {
      status: 'installing',
      message: 'Đang tạo gói ứng dụng mới; bước này có thể mất vài phút...'
    })
    await createPackage(mergedRoot, replacementAsar)
    createAsarFileUpdater(tempDir, replacementAsar, targetRoot)
    setTimeout(() => {
      sendToRenderer('update:status', { status: 'restarting', message: 'Đang khởi động lại...' })
      setTimeout(() => app.quit(), 1400)
    }, 300)
    return { version: 'zip' }
  }

  let hadLockedFiles = false
  for (const sourceFile of sourceFiles) {
    const relativePath = relative(sourceRoot, sourceFile)
    const targetFile = join(targetRoot, relativePath)
    mkdirSync(dirname(targetFile), { recursive: true })
    try {
      copyFileSync(sourceFile, targetFile)
    } catch {
      hadLockedFiles = true
    }
  }

  for (const deletedFile of deletedFiles) {
    rmSync(join(targetRoot, deletedFile), { force: true })
  }
  rmSync(join(targetRoot, '.update-manifest.json'), { force: true })

  const packageJsonPath = join(sourceRoot, 'package.json')
  const newVersion = existsSync(packageJsonPath)
    ? JSON.parse(readFileSync(packageJsonPath, 'utf-8')).version || 'không rõ'
    : 'không rõ'

  if (hadLockedFiles) {
    createLockedFileUpdater(tempDir, sourceRoot, targetRoot)
  } else {
    rmSync(tempDir, { recursive: true, force: true })
  }

  setTimeout(() => {
    sendToRenderer('update:status', { status: 'restarting', message: 'Đang khởi động lại...' })
    // Delay để renderer kịp hiển thị banner "restarting" trước khi process exit
    setTimeout(() => {
      if (hadLockedFiles) {
        app.quit()
      } else {
        app.relaunch()
        app.exit(0)
      }
    }, 2000)
  }, 1200)

  return { version: newVersion }
}

function fetchReleases(repoInfo: { owner: string; repo: string }): Promise<GithubRelease[]> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: 'api.github.com',
        path: `/repos/${repoInfo.owner}/${repoInfo.repo}/releases?per_page=10`,
        method: 'GET',
        headers: {
          'User-Agent': 'DBY-HOME-Desktop',
          Accept: 'application/vnd.github.v3+json'
        }
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Lỗi GitHub API: ${res.statusCode}`))
            return
          }

          try {
            const parsed = JSON.parse(raw) as GithubRelease[]
            resolve(parsed)
          } catch {
            reject(new Error('Dữ liệu danh sách phát hành không hợp lệ.'))
          }
        })
      }
    )

    req.on('error', (error) => reject(new Error(`Lỗi mạng: ${error.message}`)))
    req.setTimeout(15000, () => {
      req.destroy()
      reject(new Error('Yêu cầu quá thời gian chờ.'))
    })
    req.end()
  })
}

export function registerUpdateHandlers(): void {
  ipcMain.handle('update:getHistory', async () => {
    try {
      const repoInfo = resolveRepoInfo()
      if (!repoInfo) throw new Error('Chưa cấu hình kho phát hành.')
      const releases = await fetchReleases(repoInfo)
      return { success: true, data: releases }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Thao tác thất bại.' }
    }
  })

  ipcMain.handle('update:check', async () => {
    try {
      const data = await checkForUpdate()
      sendToRenderer('update:status', {
        status: data.hasUpdate ? 'available' : 'idle',
        message: data.hasUpdate ? `Có bản mới v${data.latestVersion}.` : 'Đang sử dụng bản mới nhất.',
        data
      })
      if (data.hasUpdate) {
        sendToRenderer('update:available', data)
      }
      return { success: true, data }
    } catch (error) {
      void reportTelegramError('update-check-failed', { message: error instanceof Error ? error.message : error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Kiểm tra cập nhật thất bại.'
      }
    }
  })

  ipcMain.handle('update:installLatest', async () => {
    try {
      const data = await installLatestUpdate()
      return { success: true, data }
    } catch (error) {
      void reportTelegramError('update-install-failed', { message: error instanceof Error ? error.message : error })
      sendToRenderer('update:status', {
        status: 'error',
        message: error instanceof Error ? error.message : 'Cập nhật thất bại.'
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cài đặt bản cập nhật mới nhất thất bại.'
      }
    }
  })

  ipcMain.handle('update:getCurrentVersion', async () => {
    return { success: true, data: app.getVersion() }
  })

  if (app.isPackaged) {
    setTimeout(() => {
      void runAutoUpdateCheck()
    }, 8000)
  }
}
