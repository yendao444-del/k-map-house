import { app, BrowserWindow, ipcMain } from 'electron'
import AdmZip from 'adm-zip'
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync, copyFileSync, readdirSync } from 'fs'
import { cpus } from 'os'
import { dirname, join, relative } from 'path'
import { get } from 'http'
import { get as httpsGet, request as httpsRequest } from 'https'

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

interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseNotes: string
  publishedAt: string
  downloadUrl: string | null
  downloadSize: number
}

let releaseCache: GithubRelease | null = null
let releaseCacheTime = 0
const CACHE_DURATION = 5 * 60 * 1000

function readPackageJson(): { homepage?: string; version?: string } {
  try {
    const packageJsonPath = join(app.getAppPath(), 'package.json')
    return JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
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
          'User-Agent': 'K-Map-House-Desktop',
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
            reject(new Error(`GitHub API error: ${res.statusCode}`))
            return
          }

          try {
            const parsed = JSON.parse(raw) as GithubRelease
            releaseCache = parsed
            releaseCacheTime = Date.now()
            resolve(parsed)
          } catch {
            reject(new Error('Invalid release payload'))
          }
        })
      }
    )

    req.on('error', (error) => reject(new Error(`Network error: ${error.message}`)))
    req.setTimeout(15000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
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
    const request = requestFn(
      url,
      { headers: { 'User-Agent': 'K-Map-House-Desktop' } },
      (response) => {
        if (
          response.statusCode &&
          [301, 302, 307, 308].includes(response.statusCode) &&
          response.headers.location
        ) {
          downloadFile(response.headers.location, destinationPath, onProgress)
            .then(resolve)
            .catch(reject)
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`))
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
            // ignore
          }
          reject(error)
        })
      }
    )

    request.on('error', (error) => reject(new Error(`Download error: ${error.message}`)))
  })
}

function findAppRoot(rootDir: string): string | null {
  const directAppPackage = join(rootDir, 'resources', 'app', 'package.json')
  if (existsSync(directAppPackage)) {
    return join(rootDir, 'resources', 'app')
  }

  const directPackage = join(rootDir, 'package.json')
  if (existsSync(directPackage)) {
    return rootDir
  }

  const entries = readdirSync(rootDir)
  for (const entry of entries) {
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
  require('child_process').spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore' }).unref()
}

export function registerUpdateHandlers(): void {
  ipcMain.handle('update:check', async () => {
    try {
      const repoInfo = resolveRepoInfo()
      if (!repoInfo) {
        return {
          success: false,
          error: 'Chưa cấu hình GitHub repo trong package.json homepage.'
        }
      }

      const currentVersion = app.getVersion()
      const release = await fetchLatestRelease(repoInfo)
      const latestVersion = release.tag_name.replace(/^v/i, '')
      const zipAssets = release.assets.filter((asset) => asset.name.toLowerCase().endsWith('.zip'))
      const patchZip = zipAssets.find((asset) => asset.name.toUpperCase().includes('PATCH'))
      const fullZip = zipAssets.find((asset) => asset.name.toUpperCase().includes('KMAPHOUSE'))
      const selectedAsset = patchZip || fullZip || zipAssets[0] || null

      const data: UpdateCheckResult = {
        currentVersion,
        latestVersion,
        hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
        releaseNotes: release.body || 'Không có ghi chú.',
        publishedAt: release.published_at,
        downloadUrl: selectedAsset?.browser_download_url || null,
        downloadSize: selectedAsset?.size || 0
      }

      return { success: true, data }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'update_check_failed'
      }
    }
  })

  ipcMain.handle('update:download', async (_event, downloadUrl: string) => {
    try {
      if (!downloadUrl) {
        return { success: false, error: 'Thiếu download url.' }
      }

      const tempDir = join(app.getPath('temp'), `kmaphouse-update-${Date.now()}-${cpus().length}`)
      const zipPath = join(tempDir, 'update.zip')
      const extractDir = join(tempDir, 'extracted')
      mkdirSync(tempDir, { recursive: true })
      mkdirSync(extractDir, { recursive: true })

      sendToRenderer('update:step', { step: 'downloading', message: 'Đang tải bản cập nhật...' })
      await downloadFile(downloadUrl, zipPath, (downloaded, total, percent) => {
        sendToRenderer('update:progress', { downloaded, total, percent })
      })

      sendToRenderer('update:step', { step: 'extracting', message: 'Đang giải nén...' })
      const zip = new AdmZip(zipPath)
      zip.extractAllTo(extractDir, true)

      const sourceRoot = findAppRoot(extractDir) || extractDir
      const targetRoot = app.getAppPath()
      const sourceFiles = collectFiles(sourceRoot)
      let hadLockedFiles = false

      sendToRenderer('update:step', { step: 'installing', message: 'Đang cài đặt bản cập nhật...' })
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
        ? JSON.parse(readFileSync(packageJsonPath, 'utf-8')).version || 'unknown'
        : 'unknown'

      if (hadLockedFiles) {
        createLockedFileUpdater(tempDir, sourceRoot, targetRoot)
      } else {
        rmSync(tempDir, { recursive: true, force: true })
      }

      setTimeout(() => {
        sendToRenderer('update:step', { step: 'restarting', message: 'Đang khởi động lại...' })
        if (hadLockedFiles) {
          app.quit()
        } else {
          app.relaunch()
          app.exit(0)
        }
      }, 1200)

      return {
        success: true,
        data: {
          version: newVersion
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'update_download_failed'
      }
    }
  })

  ipcMain.handle('update:getCurrentVersion', async () => {
    return { success: true, data: app.getVersion() }
  })
}
