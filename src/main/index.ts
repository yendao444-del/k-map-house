import { app, shell, BrowserWindow, ipcMain, clipboard, nativeImage } from 'electron'
import * as https from 'https'
import { extname, join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, appendFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerUpdateHandlers } from './update-handlers'

interface DBState {
  [key: string]: unknown
}

interface ZaloSendPayload {
  phone: string
  html: string
  fileName: string
  message?: string
}

function writeCrashLog(scope: string, error: unknown): void {
  try {
    const logDir = join(app.getPath('temp'), 'k-map-house-logs')
    mkdirSync(logDir, { recursive: true })
    const message =
      error instanceof Error ? `${error.message}\n${error.stack || ''}` : JSON.stringify(error)
    appendFileSync(join(logDir, 'main-crash.log'), `[${new Date().toISOString()}] ${scope}\n${message}\n\n`, 'utf-8')
  } catch {
    // ignore logging failures
  }
}

function writeDebugLog(scope: string, details?: unknown): void {
  try {
    const logDir = join(app.getPath('temp'), 'k-map-house-logs')
    mkdirSync(logDir, { recursive: true })
    const message =
      typeof details === 'string'
        ? details
        : details instanceof Error
          ? `${details.message}\n${details.stack || ''}`
          : details === undefined
            ? ''
            : JSON.stringify(details, null, 2)
    appendFileSync(
      join(logDir, 'main-debug.log'),
      `[${new Date().toISOString()}] ${scope}${message ? `\n${message}` : ''}\n\n`,
      'utf-8'
    )
  } catch {
    // ignore logging failures
  }
}

process.on('uncaughtException', (error) => {
  writeCrashLog('uncaughtException', error)
})

process.on('unhandledRejection', (error) => {
  writeCrashLog('unhandledRejection', error)
})

function getDBPath(): string {
  return join(app.getPath('userData'), 'phongtro_db.json')
}

function getLegacyDBPath(): string {
  return join(app.getPath('appData'), 'app', 'phongtro_db.json')
}

function ensureDBLocation(): void {
  const currentPath = getDBPath()
  const legacyPath = getLegacyDBPath()

  if (existsSync(currentPath) || !existsSync(legacyPath)) return

  mkdirSync(app.getPath('userData'), { recursive: true })
  copyFileSync(legacyPath, currentPath)
}

function readDBFile(): DBState | null {
  ensureDBLocation()
  const dbPath = getDBPath()
  if (!existsSync(dbPath)) return null

  try {
    return JSON.parse(readFileSync(dbPath, 'utf-8')) as DBState
  } catch {
    return null
  }
}

function writeDBFile(data: DBState): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(getDBPath(), JSON.stringify(data, null, 2), 'utf-8')
}

function setupDBHandlers(): void {
  ipcMain.handle('db:read', () => readDBFile())
  ipcMain.handle('db:write', (_event, data: DBState) => {
    writeDBFile(data)
    return true
  })
  ipcMain.handle('db:getPath', () => getDBPath())
}

function normalizeVietnamPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('84')) return `0${digits.slice(2)}`
  if (!digits.startsWith('0')) return `0${digits}`
  return digits
}

function setupZaloHandlers(): void {
  ipcMain.removeHandler('zalo:send')

  ipcMain.handle('zalo:send', async (_event, payload: ZaloSendPayload) => {
    try {
      const normalizedPhone = normalizeVietnamPhone(payload.phone)
      if (!normalizedPhone) {
        return { ok: false, error: 'Thieu so dien thoai nguoi nhan.' }
      }

      const tempDir = join(app.getPath('temp'), 'phongtro-zalo')
      mkdirSync(tempDir, { recursive: true })

      const safeFileName = payload.fileName.replace(/[^\w.-]+/g, '_')
      const baseName = safeFileName.endsWith('.png') ? safeFileName.slice(0, -4) : safeFileName
      const imagePath = join(tempDir, `${baseName}.png`)
      const htmlPath = join(tempDir, `${baseName}.html`)

      const captureWindow = new BrowserWindow({
        width: 820,
        height: 1180,
        show: false,
        frame: false,
        webPreferences: { sandbox: false }
      })

      const htmlWithTailwind = payload.html.replace(
        '</head>',
        '<script src="https://cdn.tailwindcss.com"></script></head>'
      )
      writeFileSync(htmlPath, htmlWithTailwind, 'utf-8')
      try {
        await captureWindow.loadFile(htmlPath)
        await new Promise((resolve) => setTimeout(resolve, 1800))
        const image = await captureWindow.webContents.capturePage()
        writeFileSync(imagePath, image.toPNG())
        clipboard.writeImage(nativeImage.createFromPath(imagePath))
      } finally {
        captureWindow.destroy()
      }

      if (payload.message) {
        clipboard.writeText(payload.message)
      }

      await shell.openExternal(`https://zalo.me/${normalizedPhone}`)
      return { ok: true, imagePath, phone: normalizedPhone }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Khong the gui noi dung qua Zalo.'
      return { ok: false, error: message }
    }
  })
}

function setupInvoiceHandlers(): void {
  ipcMain.removeHandler('invoice:saveImage')

  ipcMain.handle('invoice:saveImage', async (_event, payload: { html: string, fileName: string }) => {
    try {
      const { dialog } = require('electron')
      const rawFileName = typeof payload?.fileName === 'string' ? payload.fileName : ''
      const rawHtml = typeof payload?.html === 'string' ? payload.html : ''

      if (!rawHtml.trim()) {
        return { ok: false, error: 'Du lieu hoa don rong, khong the tao anh.' }
      }

      const safeDefaultName =
        rawFileName.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_').trim() || `hoa-don-${Date.now()}.jpg`

      const saveResult = await dialog.showSaveDialog({
        title: 'Luu anh hoa don',
        defaultPath: safeDefaultName,
        filters: [{ name: 'Images', extensions: ['jpg', 'png'] }]
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { ok: true, canceled: true }
      }

      const tempDir = join(app.getPath('temp'), 'phongtro-invoices')
      mkdirSync(tempDir, { recursive: true })
      const htmlPath = join(tempDir, `invoice_temp_${Date.now()}.html`)

      const captureWindow = new BrowserWindow({
        width: 820,
        height: 1180,
        show: false,
        frame: false,
        webPreferences: { sandbox: false }
      })

      const htmlWithTailwind = rawHtml.replace(
        '</head>',
        '<script src="https://cdn.tailwindcss.com"></script></head>'
      )
      writeFileSync(htmlPath, htmlWithTailwind, 'utf-8')

      try {
        await captureWindow.loadFile(htmlPath)
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const image = await captureWindow.webContents.capturePage()
        const selectedExt = extname(saveResult.filePath).toLowerCase()
        const targetExt =
          selectedExt === '.jpg' || selectedExt === '.jpeg' || selectedExt === '.png'
            ? selectedExt
            : '.jpg'
        const targetPath = selectedExt ? saveResult.filePath : `${saveResult.filePath}${targetExt}`

        if (targetExt === '.png') {
          writeFileSync(targetPath, image.toPNG())
        } else {
          writeFileSync(targetPath, image.toJPEG(92))
        }

        return { ok: true, filePath: targetPath }
      } finally {
        captureWindow.destroy()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Khong the luu anh hoa don.'
      return { ok: false, error: message }
    }
  })
}

function setupBankLookupHandlers(): void {
  ipcMain.removeHandler('bank:lookup')

  ipcMain.handle('bank:lookup', (_event, bin: string, accountNumber: string) => {
    return new Promise((resolve) => {
      const body = JSON.stringify({ bin, accountNumber })
      const options = {
        hostname: 'api.vietqr.io',
        path: '/v2/lookup',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-client-id': 'REDACTED_VIETQR_CLIENT_ID',
          'x-api-key': 'REDACTED_VIETQR_API_KEY'
        }
      }
      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        res.on('end', () => {
          try {
            resolve({ ok: true, data: JSON.parse(data) })
          } catch {
            resolve({ ok: false, error: 'Phan hoi khong hop le tu ngan hang.' })
          }
        })
      })
      req.on('error', (err: Error) => {
        resolve({ ok: false, error: err.message })
      })
      req.setTimeout(10000, () => {
        req.destroy()
        resolve({ ok: false, error: 'Yeu cau qua thoi gian cho.' })
      })
      req.write(body)
      req.end()
    })
  })
}

function setupSepayHandlers(): void {
  ipcMain.removeHandler('sepay:fetchTransactions')

  ipcMain.handle('sepay:fetchTransactions', (_event, token: string) => {
    return new Promise((resolve) => {
      const options = {
        hostname: 'my.sepay.vn',
        path: '/userapi/transactions/list',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        res.on('end', () => {
          try {
            resolve({ ok: true, data: JSON.parse(data) })
          } catch {
            resolve({ ok: false, error: 'Phản hồi không hợp lệ từ SePay.' })
          }
        })
      })
      req.on('error', (err: Error) => {
        resolve({ ok: false, error: err.message })
      })
      req.setTimeout(10000, () => {
        req.destroy()
        resolve({ ok: false, error: 'Yêu cầu quá thời gian chờ.' })
      })
      req.end()
    })
  })
}

/* function setupAuthHandlers(): void {
  ipcMain.handle('auth:ensureAdmin', async () => {
    const db = ensureBaseStructure(readDBFile())
    let changed = false
    for (const user of db.users || []) {
      if (
        user.role === 'admin' &&
        user.username.trim().toLowerCase() === 'admin' &&
        user.full_name.trim().toLowerCase() !== 'admin'
      ) {
        user.full_name = 'Admin'
        changed = true
      }
    }

    const hasAdmin = (db.users || []).some((user) => user.role === 'admin' && user.status === 'active')
    if (!hasAdmin) {
      const hash = await bcrypt.hash('admin123', 10)
      db.users?.push({
        id: `user-${Date.now()}`,
        username: 'admin',
        full_name: 'Admin',
        password_hash: hash,
        role: 'admin',
        status: 'active',
        created_at: new Date().toISOString()
      })
      changed = true
    }

    if (changed) {
      writeDBFile(db)
    }
  })

  ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
    const db = ensureBaseStructure(readDBFile())
    const normalizedUsername = username.trim().toLowerCase()
    const user = (db.users || []).find(
      (entry) => entry.username.trim().toLowerCase() === normalizedUsername && entry.status === 'active'
    )

    if (!user) {
      return { ok: false, error: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.' }
    }

    const isValid = await bcrypt.compare(password, user.password_hash)
    if (!isValid) {
      return { ok: false, error: 'Mật khẩu không đúng.' }
    }

    user.last_login_at = new Date().toISOString()
    writeDBFile(db)
    currentSession = { id: user.id, username: user.username, role: user.role }
    const { password_hash: _passwordHash, ...safeUser } = user
    return { ok: true, user: safeUser }
  })

  ipcMain.handle('auth:logout', () => {
    currentSession = null
    return { ok: true }
  })

  ipcMain.handle('auth:session', () => currentSession)

  ipcMain.handle('auth:updateUser', async (_event, userId: string, updates: { full_name?: string; avatar_url?: string }) => {
    try {
      const db = ensureBaseStructure(readDBFile())
      const user = (db.users || []).find((u) => u.id === userId)
      if (!user) {
        return { ok: false, error: 'Không tìm thấy tài khoản.' }
      }
      if (updates.full_name !== undefined) user.full_name = updates.full_name
      if (updates.avatar_url !== undefined) (user as any).avatar_url = updates.avatar_url
      writeDBFile(db)
      const { password_hash: _ph, ...safeUser } = user as any
      return { ok: true, user: safeUser }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Cập nhật thất bại.' }
    }
  })
} */

function createWindow(): void {
  const useSafeWindow = process.env.KMAP_SAFE_WINDOW === '1'
  const useCustomTitleBar = !useSafeWindow && process.platform === 'win32'
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    title: 'DBY HOME',
    backgroundColor: '#002b36',
    icon: useSafeWindow ? undefined : icon,
    ...(useCustomTitleBar
      ? {
        titleBarStyle: 'hidden' as const,
        titleBarOverlay: {
          color: '#002b36',
          symbolColor: '#ffffff',
          height: 40
        }
      }
      : {}),
    webPreferences: {
      preload: useSafeWindow ? undefined : join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    writeDebugLog('window:ready-to-show')
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    writeDebugLog('window:closed')
  })

  mainWindow.webContents.on('did-start-loading', () => {
    writeDebugLog('webContents:did-start-loading')
  })

  mainWindow.webContents.on('did-finish-load', () => {
    writeDebugLog('webContents:did-finish-load', mainWindow.webContents.getURL())
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeDebugLog('webContents:did-fail-load', { errorCode, errorDescription, validatedURL })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeDebugLog('webContents:render-process-gone', details)
  })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    writeDebugLog('webContents:preload-error', { preloadPath, error: error.message, stack: error.stack })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (useSafeWindow) {
    mainWindow.loadURL('data:text/html;charset=utf-8,<html><body><h1>DBY HOME Safe Window</h1></body></html>')
  } else if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setName('DBY HOME')
  electronApp.setAppUserModelId('com.kmaphouse.app')
  writeDebugLog('app:ready', { version: app.getVersion(), userData: app.getPath('userData') })
  ensureDBLocation()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  setupDBHandlers()
  setupZaloHandlers()
  setupInvoiceHandlers()
  setupBankLookupHandlers()
  setupSepayHandlers()
  registerUpdateHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('child-process-gone', (_event, details) => {
  writeDebugLog('app:child-process-gone', details)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
