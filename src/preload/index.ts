import { contextBridge, ipcRenderer } from 'electron'
const electronAPI = {
  process: {
    versions: process.versions
  }
}

// Custom APIs for renderer - Database IPC
const api = {
  windowTheme: {
    setInvestmentTitleBar: (active: boolean): Promise<void> =>
      ipcRenderer.invoke('window:setInvestmentTitleBar', active)
  },
  db: {
    read: (): Promise<unknown> => ipcRenderer.invoke('db:read'),
    write: (data: unknown): Promise<boolean> => ipcRenderer.invoke('db:write', data),
    getPath: (): Promise<string> => ipcRenderer.invoke('db:getPath')
  },
  investment: {
    read: (): Promise<unknown> => ipcRenderer.invoke('investment:read'),
    write: (data: unknown): Promise<boolean> => ipcRenderer.invoke('investment:write', data),
    fundNav: (symbol: string): Promise<unknown> => ipcRenderer.invoke('investment:fundNav', symbol)
  },
  marketData: {
    getSnapshot: (propertyAddress?: string): Promise<unknown> =>
      ipcRenderer.invoke('marketData:getSnapshot', propertyAddress),
    scanMarket: (payload: {
      propertyAddress: string
      maxPages?: number
      sourceIds?: Array<'phongtro123' | 'nhatot' | 'muaban' | 'batdongsan'>
    }): Promise<unknown> => ipcRenderer.invoke('marketData:scanMarket', payload),
    scanPhongTro123: (payload: { locationUrl: string; maxPages?: number }): Promise<unknown> =>
      ipcRenderer.invoke('marketData:scanPhongTro123', payload)
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
  gmail: {
    getAvailability: (): Promise<{ available: boolean; authenticated?: boolean; reason?: string }> => ipcRenderer.invoke('gmail:getAvailability'),
    reauthenticate: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('gmail:reauthenticate'),
    sendNotification: (payload: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string; reauthRequired?: boolean; messageId?: string }> => ipcRenderer.invoke('gmail:sendNotification', payload)
  },
  invoice: {
    saveImage: (payload: {
      html: string
      fileName: string
    }): Promise<{ ok: boolean; error?: string; filePath?: string; canceled?: boolean }> =>
      ipcRenderer.invoke('invoice:saveImage', payload),
    saveImageToDownloads: (payload: {
      html: string
      fileName: string
    }): Promise<{ ok: boolean; error?: string; filePath?: string }> =>
      ipcRenderer.invoke('invoice:saveImageToDownloads', payload)
  },
  contract: {
    savePDF: (payload: {
      html: string
      fileName: string
    }): Promise<{ ok: boolean; error?: string; filePath?: string; canceled?: boolean }> =>
      ipcRenderer.invoke('contract:savePDF', payload)
  },
  tts: {
    synthesizePayment: (
      amount: number
    ): Promise<{ ok: boolean; audioBase64?: string; error?: string }> =>
      ipcRenderer.invoke('tts:synthesizePayment', amount)
  },
  perf: {
    benchmarkMode: process.argv.includes('--kmap-benchmark'),
    getMetrics: (): Promise<unknown> => ipcRenderer.invoke('perf:getMetrics'),
    markStartup: (name: string): void => ipcRenderer.send('perf:startup-mark', name)
  },
  update: {
    check: (): Promise<unknown> => ipcRenderer.invoke('update:check'),
    getHistory: (): Promise<unknown> => ipcRenderer.invoke('update:getHistory'),
    installLatest: (): Promise<unknown> => ipcRenderer.invoke('update:installLatest'),
    getCurrentVersion: (): Promise<unknown> => ipcRenderer.invoke('update:getCurrentVersion'),
    getResult: (): Promise<unknown> => ipcRenderer.invoke('update:getResult'),
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
