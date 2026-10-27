import { app } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { trustedIpcMain } from './trusted-ipc'

export function registerDevDevice(): void {
  trustedIpcMain.handle('devDevice:credential', () => {
    // A packaged/preview application cannot use this workstation exception.
    if (app.isPackaged || !process.env.ELECTRON_RENDERER_URL || process.platform !== 'win32') return null
    try {
      const renderer = new URL(process.env.ELECTRON_RENDERER_URL)
      if (renderer.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(renderer.hostname)) return null
    } catch { return null }
    const path = join(__dirname, '../../.dev-auth/device.dpapi')
    if (!existsSync(path)) return null
    try {
      const token = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        'Add-Type -AssemblyName System.Security; $encrypted=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))'
      ], { input: readFileSync(path, 'utf8'), encoding: 'utf8', timeout: 10000, windowsHide: true }).trim()
      return /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token) ? token : null
    } catch { return null }
  })
}
