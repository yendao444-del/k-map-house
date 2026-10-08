import { app, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function registerContractTestLauncher(): void {
  ipcMain.handle('contractTest:open', async () => {
    if (app.isPackaged) return { ok: false, error: 'Chạy start-contract-test.bat trong thư mục mã nguồn để mở môi trường TEST.' }
    const workspace = resolve(__dirname, '../..')
    const script = join(workspace, 'webmobile/scripts/start-contract-test.mjs')
    if (!existsSync(script)) return { ok: false, error: 'Không tìm thấy launcher Electron TEST.' }
    const profile = join(workspace, 'webmobile/.contract-test-profile')
    mkdirSync(profile, { recursive: true })
    const log = openSync(join(profile, 'launcher.log'), 'a')
    try {
      // Fixed entry point only: the renderer cannot choose an executable or
      // database. The launcher validates the TEST project and schema itself.
      const child = spawn(process.platform === 'win32' ? 'node.exe' : 'node', ['--use-system-ca', script], {
        cwd: workspace, env: process.env, detached: true, windowsHide: true, stdio: ['ignore', log, log]
      })
      const result = await new Promise<{ ok: boolean; error?: string }>(resolveResult => {
        child.once('spawn', () => resolveResult({ ok: true }))
        child.once('error', () => resolveResult({ ok: false, error: 'Không chạy được Node.js. Mở start-contract-test.bat để xem lỗi khởi động.' }))
      })
      child.unref()
      return result
    } finally { closeSync(log) }
  })
}
