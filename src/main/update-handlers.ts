import { app, BrowserWindow, ipcMain } from 'electron'
import AdmZip from 'adm-zip'
import { spawn } from 'child_process'
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

interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
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
  releaseDate: string
}

interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseNotes: string
  publishedAt: string
  downloadUrl: string | null
  downloadSize: number
  artifactType: 'installer' | 'zip' | 'none'
  fileName: string | null
}

let releaseCache: GithubRelease | null = null
let releaseCacheTime = 0
let updateInProgress = false
let forcedInstallQueued = false
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

function parseLatestYml(raw: string): LatestYmlInfo | null {
  const version = raw.match(/^version:\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim()
  const path =
    raw.match(/^path:\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim() ||
    raw.match(/^\s*-\s*url:\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim()
  const sizeValue = raw.match(/^\s*size:\s*(\d+)/m)?.[1]
  const releaseDate = raw.match(/^releaseDate:\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim()

  if (!version || !path) return null

  return {
    version,
    path,
    size: sizeValue ? Number(sizeValue) : 0,
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
    const requestFn = url.startsWith('https:') ? httpsGet : get
    const request = requestFn(url, { headers: { 'User-Agent': 'DBY-HOME-Desktop' } }, (response) => {
      if (
        response.statusCode &&
        [301, 302, 307, 308].includes(response.statusCode) &&
        response.headers.location
      ) {
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

function createSilentInstallerRunner(tempDir: string, installerPath: string): void {
  const batPath = join(tempDir, 'install-update.bat')
  const vbsPath = join(tempDir, 'install-update.vbs')
  const batContent = `@echo off
chcp 65001 >nul
timeout /t 2 /nobreak >nul
start /wait "" "${installerPath}" /S
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

function selectReleaseAsset(release: GithubRelease): ReleaseAsset | null {
  const installerAsset =
    release.assets.find((asset) => asset.name.toLowerCase().endsWith('-setup.exe')) ||
    release.assets.find((asset) => asset.name.toLowerCase().endsWith('.exe')) ||
    null
  const zipAssets = release.assets.filter((asset) => asset.name.toLowerCase().endsWith('.zip'))
  const patchZip = zipAssets.find((asset) => asset.name.toUpperCase().includes('PATCH'))
  const fullZip = zipAssets.find((asset) => /DBYHOME|KMAPHOUSE/i.test(asset.name))

  return installerAsset || patchZip || fullZip || zipAssets[0] || null
}

function isInstallerAsset(asset: ReleaseAsset | null): boolean {
  return Boolean(asset?.name.toLowerCase().endsWith('.exe'))
}

async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const repoInfo = resolveRepoInfo()
  if (repoInfo) {
    try {
      const release = await fetchLatestRelease(repoInfo)
      const latestVersion = release.tag_name.replace(/^v/i, '')
      const selectedAsset = selectReleaseAsset(release)

      return {
        currentVersion,
        latestVersion,
        hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
        releaseNotes: release.body || 'Không có ghi chú.',
        publishedAt: release.published_at,
        downloadUrl: selectedAsset?.browser_download_url || null,
        downloadSize: selectedAsset?.size || 0,
        artifactType: isInstallerAsset(selectedAsset) ? 'installer' : selectedAsset ? 'zip' : 'none',
        fileName: selectedAsset?.name || null
      }
    } catch {
      // Fallback to electron-builder latest.yml below.
    }
  }

  const latestYml = await fetchLatestYml()
  if (!latestYml) {
    throw new Error('Không thể lấy thông tin bản cập nhật từ GitHub.')
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
    fileName: latestYml.path
  }
}

async function installUpdate(downloadUrl: string): Promise<{ version: string }> {
  if (updateInProgress) {
    throw new Error('Đang có bản cập nhật chạy.')
  }

  updateInProgress = true
  try {
    return downloadUrl.toLowerCase().endsWith('.exe')
      ? await installWithSetup(downloadUrl)
      : await installWithZip(downloadUrl)
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

  if (!update.downloadUrl) {
    throw new Error('Bản phát hành không có tệp cập nhật phù hợp.')
  }

  sendToRenderer('update:available', update)
  const result = await installUpdate(update.downloadUrl)
  return { ...result, latestVersion: update.latestVersion, applied: true }
}

function forceInstallUpdate(update: UpdateCheckResult): void {
  if (!app.isPackaged || !update.hasUpdate || forcedInstallQueued || updateInProgress) return

  if (!update.downloadUrl) {
    sendToRenderer('update:status', {
      status: 'error',
      message: 'Bản phát hành không có tệp cập nhật phù hợp.',
      data: update
    })
    return
  }

  forcedInstallQueued = true
  sendToRenderer('update:status', {
    status: 'available',
    message: `Có bản mới v${update.latestVersion}. Đang tự động cập nhật...`,
    data: update
  })

  setTimeout(() => {
    void installUpdate(update.downloadUrl as string)
      .catch((error) => {
        sendToRenderer('update:status', {
          status: 'error',
          message: error instanceof Error ? error.message : 'Tự động cập nhật thất bại.',
          data: update
        })
      })
      .finally(() => {
        forcedInstallQueued = false
      })
  }, 1500)
}

async function runAutoUpdateCheck(): Promise<void> {
  sendToRenderer('update:status', {
    status: 'checking',
    message: 'Đang tự động kiểm tra bản cập nhật...'
  })

  try {
    const data = await checkForUpdate()
    sendToRenderer('update:status', {
      status: data.hasUpdate ? 'available' : 'idle',
      message: data.hasUpdate ? `Có bản mới v${data.latestVersion}.` : 'Đang sử dụng bản mới nhất.',
      data
    })

    if (data.hasUpdate) {
      sendToRenderer('update:available', data)
      forceInstallUpdate(data)
    }
  } catch (error) {
    sendToRenderer('update:status', {
      status: 'error',
      message: error instanceof Error ? error.message : 'Không thể kiểm tra cập nhật.'
    })
  }
}

async function installWithSetup(downloadUrl: string): Promise<{ version: string }> {
  const tempDir = join(app.getPath('temp'), `kmaphouse-installer-${Date.now()}`)
  const installerPath = join(tempDir, downloadUrl.split('/').pop() || 'DBYHOME-update-setup.exe')
  mkdirSync(tempDir, { recursive: true })

  sendToRenderer('update:status', { status: 'downloading', message: 'Đang tải bộ cài cập nhật...' })
  await downloadFile(downloadUrl, installerPath, (downloaded, total, percent) => {
    sendToRenderer('update:progress', { downloaded, total, percent })
  })

  sendToRenderer('update:status', { status: 'installing', message: 'Đang cài đặt bản cập nhật...' })
  createSilentInstallerRunner(tempDir, installerPath)

  setTimeout(() => app.quit(), 800)
  return { version: 'installer' }
}

async function installWithZip(downloadUrl: string): Promise<{ version: string }> {
  const tempDir = join(app.getPath('temp'), `kmaphouse-update-${Date.now()}-${cpus().length}`)
  const zipPath = join(tempDir, 'update.zip')
  const extractDir = join(tempDir, 'extracted')
  mkdirSync(tempDir, { recursive: true })
  mkdirSync(extractDir, { recursive: true })

  sendToRenderer('update:status', { status: 'downloading', message: 'Đang tải bản cập nhật...' })
  await downloadFile(downloadUrl, zipPath, (downloaded, total, percent) => {
    sendToRenderer('update:progress', { downloaded, total, percent })
  })

  sendToRenderer('update:status', { status: 'extracting', message: 'Đang giải nén...' })
  new AdmZip(zipPath).extractAllTo(extractDir, true)

  const sourceRoot = findAppRoot(extractDir) || extractDir
  const targetRoot = app.getAppPath()
  const sourceFiles = collectFiles(sourceRoot)
  let hadLockedFiles = false

  sendToRenderer('update:status', { status: 'installing', message: 'Đang cài đặt bản cập nhật...' })
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
    if (hadLockedFiles) {
      app.quit()
    } else {
      app.relaunch()
      app.exit(0)
    }
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
        forceInstallUpdate(data)
      }
      return { success: true, data }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Kiểm tra cập nhật thất bại.'
      }
    }
  })

  ipcMain.handle('update:download', async (_event, downloadUrl: string) => {
    try {
      if (!downloadUrl) {
        return { success: false, error: 'Thiếu đường dẫn tải cập nhật.' }
      }

      const data = await installUpdate(downloadUrl)
      return { success: true, data }
    } catch (error) {
      sendToRenderer('update:status', {
        status: 'error',
        message: error instanceof Error ? error.message : 'Cập nhật thất bại.'
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tải cập nhật thất bại.'
      }
    }
  })

  ipcMain.handle('update:installLatest', async () => {
    try {
      const data = await installLatestUpdate()
      return { success: true, data }
    } catch (error) {
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
