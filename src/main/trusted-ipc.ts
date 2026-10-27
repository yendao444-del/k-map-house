import {
  ipcMain,
  shell,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'

const trustedRenderers = new Map<WebContents, string>()

export function isTrustedRendererUrl(value: string, expectedUrl: string): boolean {
  try {
    const target = new URL(value)
    const expected = new URL(expectedUrl)
    if (target.username || target.password || target.protocol !== expected.protocol) return false
    if (expected.protocol === 'file:') {
      return target.host === expected.host && target.pathname === expected.pathname
    }
    if (expected.protocol === 'http:' || expected.protocol === 'https:') {
      return target.origin === expected.origin
    }
    // The diagnostic safe window uses a fixed data document without preload.
    return value === expectedUrl
  } catch {
    return false
  }
}

function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const expected = trustedRenderers.get(event.sender)
  return Boolean(
    expected &&
    !event.sender.isDestroyed() &&
    event.senderFrame &&
    event.senderFrame === event.sender.mainFrame &&
    isTrustedRendererUrl(event.senderFrame.url, expected)
  )
}

export function registerTrustedRenderer(window: BrowserWindow, rendererUrl: string): void {
  const contents = window.webContents
  trustedRenderers.set(contents, rendererUrl)
  contents.once('destroyed', () => trustedRenderers.delete(contents))
  contents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url, rendererUrl)) return
    event.preventDefault()
    try {
      const external = new URL(url)
      if (external.protocol === 'https:' && !external.username && !external.password) {
        void shell.openExternal(external.href).catch(() => {})
      }
    } catch {
      // Invalid navigation remains blocked.
    }
  })
  contents.on('will-redirect', (event, url, _inPlace, isMainFrame) => {
    if (isMainFrame && !isTrustedRendererUrl(url, rendererUrl)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
}

// Every privileged handler checks both the registered window and its main frame.
// A local preview window, iframe or unexpected navigation cannot use the bridge.
export const trustedIpcMain = {
  handle(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedSender(event)) throw new Error('Nguồn yêu cầu không hợp lệ.')
      return listener(event, ...args)
    })
  },
  on(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): void {
    ipcMain.on(channel, (event, ...args) => {
      if (isTrustedSender(event)) listener(event, ...args)
    })
  },
  removeHandler: (channel: string): void => ipcMain.removeHandler(channel),
  removeAllListeners: (channel: string): void => {
    ipcMain.removeAllListeners(channel)
  }
}
