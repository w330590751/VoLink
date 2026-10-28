import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppSettings, DevicePatch, EsimProfileInput, ProxyInput, UpdateInfo } from '../shared/types.js'
import { AppStore } from './store.js'
import { DeviceService } from './device-service.js'
import { SMSService } from './sms-service.js'
import { ProxyService } from './proxy-service.js'
import { EsimService } from './esim-service.js'
import { ModemCallService } from './modem-call-service.js'
import { sendConfiguredNotification } from './notification-service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | undefined
let scanTimer: NodeJS.Timeout | undefined
let services: Awaited<ReturnType<typeof createServices>> | undefined

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#080e1c',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#08101f', symbolColor: '#dbe5ff', height: 36 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.once('did-finish-load', () => { if (!win.isVisible()) win.show() })
  win.webContents.on('did-fail-load', (_, code, description) => {
    void services?.store.log('error', 'renderer', `界面加载失败 (${code})`, description)
  })
  if (process.env.VITE_DEV_SERVER_URL) void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  else void win.loadFile(path.join(__dirname, '../dist/index.html'))
  mainWindow = win
  return win
}

async function createServices() {
  const store = new AppStore(path.join(app.getPath('userData'), 'volink-data.json'))
  await store.init()
  const devices = new DeviceService(store)
  const sms = new SMSService(store, devices)
  const proxies = new ProxyService(store)
  const esim = new EsimService(store, devices)
  const calls = new ModemCallService(store, devices)
  await devices.init()
  await proxies.init()
  await store.log('info', 'system', `VoLink ${app.getVersion()} 已启动`)
  return { store, devices, sms, proxies, esim, calls }
}

function registerIPC(current: NonNullable<typeof services>) {
  const { store, devices, sms, proxies, esim, calls } = current
  ipcMain.handle('app:snapshot', () => devices.snapshot())
  ipcMain.handle('app:check-update', () => checkForUpdates(app.getVersion()))
  ipcMain.handle('app:open-external', async (_, url: string) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') throw new Error('仅允许打开 GitHub HTTPS 链接')
    await shell.openExternal(parsed.toString())
    return true
  })
  ipcMain.handle('device:rescan', () => devices.rescan())
  ipcMain.handle('device:add', (_, portPath: string, name?: string) => devices.addDevice(portPath, name))
  ipcMain.handle('device:update', (_, id: string, patch: DevicePatch) => devices.updateDevice(id, patch))
  ipcMain.handle('device:remove', (_, id: string) => devices.removeDevice(id))
  ipcMain.handle('device:at', (_, id: string, command: string, timeoutMs?: number) => devices.executeAT(id, command, timeoutMs))
  ipcMain.handle('device:ussd', (_, id: string, command: string) => devices.executeUSSD(id, command))
  ipcMain.handle('device:ussd-cancel', (_, id: string) => devices.cancelUSSD(id))
  ipcMain.handle('device:reboot', (_, id: string) => devices.reboot(id))
  ipcMain.handle('device:flight-mode', (_, id: string, enabled: boolean) => devices.setFlightMode(id, enabled))
  ipcMain.handle('device:data-enabled', (_, id: string, enabled: boolean) => devices.setDataEnabled(id, enabled))
  ipcMain.handle('device:operators-scan', (_, id: string) => devices.scanOperators(id))
  ipcMain.handle('device:operator-select', (_, id: string, plmn?: string) => devices.selectOperator(id, plmn))
  ipcMain.handle('device:diagnose', (_, id: string) => devices.diagnose(id))
  ipcMain.handle('device:list-ports', () => devices.listPorts())

  ipcMain.handle('sms:send', (_, deviceId: string, recipient: string, body: string) => sms.send(deviceId, recipient, body))
  ipcMain.handle('sms:refresh', (_, deviceId: string) => sms.refresh(deviceId))
  ipcMain.handle('sms:delete', (_, id: string) => sms.delete(id))

  ipcMain.handle('logs:delete', (_, id: string) => store.deleteLog(id))
  ipcMain.handle('logs:clear', () => store.clearLogs())

  ipcMain.handle('call:dial', (_, deviceId: string, number: string) => calls.dial(deviceId, number))
  ipcMain.handle('call:hangup', () => calls.hangup())
  ipcMain.handle('call:status', () => calls.status())

  ipcMain.handle('proxy:save', (_, input: ProxyInput) => proxies.save(input))
  ipcMain.handle('proxy:delete', (_, id: string) => proxies.delete(id))
  ipcMain.handle('proxy:start', (_, id: string) => proxies.start(id))
  ipcMain.handle('proxy:stop', (_, id: string) => proxies.stop(id))

  ipcMain.handle('esim:import', (_, input: EsimProfileInput) => esim.importProfile(input))
  ipcMain.handle('esim:rename', (_, id: string, name: string) => esim.rename(id, name))
  ipcMain.handle('esim:enable', (_, id: string) => esim.enable(id))
  ipcMain.handle('esim:disable', (_, id: string) => esim.disable(id))
  ipcMain.handle('esim:delete', (_, id: string) => esim.delete(id))

  ipcMain.handle('settings:update', async (_, patch: Partial<AppSettings>) => {
    await store.update(draft => {
      draft.settings = {
        ...draft.settings,
        ...patch,
        notifications: { ...draft.settings.notifications, ...patch.notifications }
      }
    })
    scheduleAutoScan(current)
    return store.snapshot().settings
  })
  ipcMain.handle('settings:test-notification', async () => {
    const settings = store.snapshot().settings.notifications
    return sendConfiguredNotification(settings, {
      title: 'VoLink 测试通知',
      body: '通知通道工作正常。',
      event: 'volink.test'
    }, true)
  })
}

async function checkForUpdates(currentVersion: string): Promise<UpdateInfo> {
  const response = await fetch('https://api.github.com/repos/w330590751/VoLink/releases/latest', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': `VoLink/${currentVersion}` }
  })
  if (!response.ok) throw new Error(`检查更新失败：GitHub HTTP ${response.status}`)
  const release = await response.json() as {
    tag_name?: string
    html_url?: string
    published_at?: string
    assets?: Array<{ name?: string; browser_download_url?: string }>
  }
  const latestVersion = (release.tag_name || currentVersion).replace(/^v/i, '')
  return {
    currentVersion,
    latestVersion,
    available: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl: release.html_url || 'https://github.com/w330590751/VoLink/releases/latest',
    downloadUrl: release.assets?.find(asset => asset.name?.endsWith('-portable.exe'))?.browser_download_url,
    publishedAt: release.published_at,
    checkedAt: new Date().toISOString()
  }
}

function compareVersions(left: string, right: string) {
  const a = left.split(/[.-]/).map(part => Number.parseInt(part, 10) || 0)
  const b = right.split(/[.-]/).map(part => Number.parseInt(part, 10) || 0)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0)
  }
  return 0
}

function scheduleAutoScan(current: NonNullable<typeof services>) {
  if (scanTimer) clearInterval(scanTimer)
  const settings = current.store.snapshot().settings
  if (!settings.autoScan) return
  scanTimer = setInterval(() => void current.devices.rescan().catch(error => current.store.log('warn', 'device', '自动扫描失败', String(error))), Math.max(5, settings.scanIntervalSeconds) * 1000)
}

app.whenReady().then(async () => {
  services = await createServices()
  registerIPC(services)
  scheduleAutoScan(services)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
}).catch(error => {
  console.error(error)
  dialog.showErrorBox('VoLink 启动失败', error instanceof Error ? error.stack ?? error.message : String(error))
  app.quit()
})

app.on('before-quit', event => {
  if (!services) return
  event.preventDefault()
  const current = services
  services = undefined
  if (scanTimer) clearInterval(scanTimer)
  void current.proxies.shutdown().finally(() => app.quit())
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
