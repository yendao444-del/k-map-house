import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { trustedIpcMain } from './trusted-ipc'

const tokenPattern = /^[a-f0-9]{64}\.[a-f0-9]{64}$/

// Native per-profile storage survives file:// <-> localhost renderer changes.
// Windows encrypts the bearer for the current OS user; never write plaintext.
export function registerTrustedDevice(): void {
  const file = () => join(app.getPath('userData'), 'management-trusted-device.bin')
  trustedIpcMain.handle('trustedDevice:read', () => {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(file())) return null
    try {
      const token = safeStorage.decryptString(readFileSync(file()))
      return tokenPattern.test(token) ? token : null
    } catch { return null }
  })
  trustedIpcMain.handle('trustedDevice:write', (_event, token: unknown) => {
    if (typeof token !== 'string' || !tokenPattern.test(token)) throw new Error('Token thiết bị không hợp lệ.')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Kho mã hóa thiết bị chưa sẵn sàng.')
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(file(), safeStorage.encryptString(token), { mode: 0o600 })
    return true
  })
  trustedIpcMain.handle('trustedDevice:clear', () => {
    if (existsSync(file())) unlinkSync(file())
    return true
  })
}
