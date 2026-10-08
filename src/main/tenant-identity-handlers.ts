import { app, clipboard, ipcMain } from 'electron'
import { join } from 'node:path'
import { MAX_IDENTITY_IMAGE_BYTES, type IdentityReadResult } from '../shared/tenant-identity'

export function registerTenantIdentityHandlers(): void {
  let busy = false
  ipcMain.handle('tenantIdentity:read', async (event, dataUrl: unknown): Promise<IdentityReadResult> => {
    if (event.senderFrame !== event.sender.mainFrame) return { ok: false, error: 'Yêu cầu không hợp lệ.' }
    if (busy) return { ok: false, error: 'Đang đọc ảnh khác. Vui lòng đợi một chút.' }
    busy = true
    try {
      const { decodeIdentityImage, readTenantIdentity } = await import('./tenant-identity-reader')
      const languagePath = app.isPackaged ? join(process.resourcesPath, 'identity-ocr') : join(app.getAppPath(), 'resources', 'identity-ocr')
      return await readTenantIdentity(decodeIdentityImage(dataUrl), languagePath)
    } catch {
      // Do not expose OCR internals, card text or personal data through crash logs.
      return { ok: false, error: 'Không đọc được ảnh. Hãy dùng ảnh JPG/PNG rõ nét, tối đa 5 MB.' }
    } finally { busy = false }
  })
  ipcMain.handle('tenantIdentity:clipboard', async (event) => {
    if (event.senderFrame !== event.sender.mainFrame) return null
    const items = await clipboard.read()
    for (const item of items) {
      const type = item.types.find(type => ['image/png', 'image/jpeg'].includes(type))
      if (!type) continue
      const blob = await item.getType(type) as Blob
      if (blob.size > MAX_IDENTITY_IMAGE_BYTES) return null
      return `data:${type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
    }
    return null
  })
}
