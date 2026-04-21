import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer - Database IPC
const api = {
  db: {
    read: (): Promise<unknown> => ipcRenderer.invoke('db:read'),
    write: (data: unknown): Promise<boolean> => ipcRenderer.invoke('db:write', data),
    getPath: (): Promise<string> => ipcRenderer.invoke('db:getPath')
  },
  zalo: {
    send: (payload: {
      phone: string
      html: string
      fileName: string
      message?: string
    }): Promise<{ ok: boolean; error?: string; imagePath?: string; phone?: string }> =>
      ipcRenderer.invoke('zalo:send', payload)
  },
  auth: {
    ensureAdmin: (): Promise<void> => ipcRenderer.invoke('auth:ensureAdmin'),
    login: (
      username: string,
      password: string
    ): Promise<{ ok: boolean; user?: unknown; error?: string }> =>
      ipcRenderer.invoke('auth:login', username, password),
    logout: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('auth:logout'),
    session: (): Promise<unknown> => ipcRenderer.invoke('auth:session'),
    updateUser: (
      userId: string,
      updates: { full_name?: string; avatar_url?: string }
    ): Promise<{ ok: boolean; user?: unknown; error?: string }> =>
      ipcRenderer.invoke('auth:updateUser', userId, updates)
  },
  update: {
    check: (): Promise<unknown> => ipcRenderer.invoke('update:check'),
    getHistory: (): Promise<unknown> => ipcRenderer.invoke('update:getHistory'),
    download: (url: string): Promise<unknown> => ipcRenderer.invoke('update:download', url),
    installLatest: (): Promise<unknown> => ipcRenderer.invoke('update:installLatest'),
    getCurrentVersion: (): Promise<unknown> => ipcRenderer.invoke('update:getCurrentVersion'),
    onAvailable: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('update:available', listener)
      return () => ipcRenderer.removeListener('update:available', listener)
    },
    onStatus: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.removeListener('update:status', listener)
    },
    onProgress: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('update:progress', listener)
      return () => ipcRenderer.removeListener('update:progress', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
