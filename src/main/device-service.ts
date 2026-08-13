import { SerialPort } from 'serialport'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  ATCommandResult,
  AppSnapshot,
  DevicePatch,
  DeviceDiagnostics,
  DeviceRecord,
  DeviceStatus,
  SerialPortDescriptor,
  USSDResult
} from '../shared/types.js'
import { AppStore } from './store.js'
import { withATSession } from './at-channel.js'

const MODEM_HINT = /quectel|qualcomm|fibocom|sierra|huawei|zte|mobile|modem|wwan|telit|simcom/i
const NON_AT_PORT_HINT = /\bnmea\b|\bdm port\b|diagnostic|diagnostics|\bgps\b/i
const execFileAsync = promisify(execFile)

const emptyStatus = (): DeviceStatus => ({
  signal: 0,
  dbm: -113,
  network: '未知',
  band: '—',
  operator: '未注册',
  imei: '',
  imsi: '',
  iccid: '',
  simState: '未知',
  registration: '未注册',
  firmware: '',
  updatedAt: new Date().toISOString()
})

const simulationDevices = (): DeviceRecord[] => [
  {
    id: 'sim-ec25', name: '主卡模组', model: 'EC25-A', manufacturer: 'Quectel', displayPort: '模拟 COM3', mode: 'simulation',
    state: 'online', enabled: true, autoConnect: true,
    capabilities: { sms: true, voice: true, ussd: true, esim: false, vowifi: false, rawAT: true },
    status: { signal: 92, dbm: -67, network: '5G NSA', band: 'n78', operator: '中国移动', imei: '866123045678912', imsi: '460001234567890', iccid: '8986001234567890123', simState: 'READY', registration: '已注册', firmware: 'EC25EFAR06A12M4G', updatedAt: new Date().toISOString() }
  },
  {
    id: 'sim-ec20', name: '短信模组', model: 'EC20-C', manufacturer: 'Quectel', displayPort: '模拟 COM5', mode: 'simulation',
    state: 'online', enabled: true, autoConnect: true,
    capabilities: { sms: true, voice: true, ussd: true, esim: true, vowifi: true, rawAT: true },
    status: { signal: 61, dbm: -81, network: '4G LTE', band: 'B3', operator: '中国联通', imei: '860512040123456', imsi: '460011234567890', iccid: '8986011234567890123', simState: 'READY', registration: '已注册', firmware: 'EC20CEHCLGR08A09M1G', updatedAt: new Date().toISOString() }
  }
]

export class DeviceService {
  private availablePorts: SerialPortDescriptor[] = []
  private locks = new Map<string, Promise<unknown>>()
  private activeScan?: Promise<AppSnapshot>

  constructor(private readonly store: AppStore) {}

  async init() {
    const data = this.store.snapshot()
    if (data.settings.simulationMode && data.devices.length === 0) {
      await this.store.update(draft => { draft.devices = simulationDevices() })
    }
    if (data.settings.autoScan) {
      void this.rescan().catch(error => this.store.log('warn', 'device', '启动扫描失败', String(error)))
    }
  }

  async snapshot(): Promise<AppSnapshot> {
    const data = this.store.snapshot()
    return { ...data, availablePorts: structuredClone(this.availablePorts) }
  }

  async listPorts() {
    const ports = await SerialPort.list()
    const descriptors: SerialPortDescriptor[] = ports.map(port => {
      const description = [port.manufacturer, port.friendlyName, port.pnpId].filter(Boolean).join(' ')
      return {
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        vendorId: port.vendorId,
        productId: port.productId,
        friendlyName: port.friendlyName,
        likelyModem: MODEM_HINT.test(description) && !NON_AT_PORT_HINT.test(description)
      }
    })
    if (process.platform === 'win32') {
      const modemPorts = await listWindowsModemPorts()
      for (const modem of modemPorts) {
        const existing = descriptors.find(port => port.path.toUpperCase() === modem.path.toUpperCase())
        if (existing) Object.assign(existing, modem)
        else descriptors.push(modem)
      }
    }
    this.availablePorts = descriptors
    return structuredClone(this.availablePorts)
  }

  rescan() {
    if (this.activeScan) return this.activeScan
    const scan = this.performScan()
    this.activeScan = scan
    void scan.then(
      () => { if (this.activeScan === scan) this.activeScan = undefined },
      () => { if (this.activeScan === scan) this.activeScan = undefined }
    )
    return scan
  }

  private async performScan() {
    const ports = await this.listPorts()
    const likelyPorts = ports.filter(port => port.likelyModem)
    const current = this.store.snapshot()

    for (const descriptor of likelyPorts) {
      const existing = current.devices.find(device => device.serialPath === descriptor.path)
      if (existing) {
        await this.refreshDevice(existing.id).catch(() => undefined)
        continue
      }
      await this.addDevice(descriptor.path).catch(async error => {
        await this.store.log('warn', 'device', `无法识别 ${descriptor.path}`, String(error))
      })
    }

    await this.store.update(draft => {
      for (const device of draft.devices) {
        if (device.mode === 'serial' && !ports.some(port => port.path === device.serialPath)) device.state = 'offline'
      }
      if (draft.settings.simulationMode && !draft.devices.some(device => device.mode === 'simulation')) {
        draft.devices.push(...simulationDevices())
      }
      if (!draft.settings.simulationMode) draft.devices = draft.devices.filter(device => device.mode !== 'simulation')
    })
    await this.store.log('info', 'device', `设备扫描完成，发现 ${likelyPorts.length} 个候选模组`)
    return this.snapshot()
  }

  async addDevice(portPath: string, name?: string) {
    const existing = this.store.snapshot().devices.find(device => device.serialPath === portPath)
    if (existing) return existing
    const descriptor = (await this.listPorts()).find(port => port.path === portPath)
    const probed = await this.probe(portPath)
    const device: DeviceRecord = {
      id: `dev-${crypto.randomUUID()}`,
      name: name?.trim() || probed.model || `模组 ${portPath}`,
      model: probed.model || 'Unknown Modem',
      manufacturer: descriptor?.manufacturer || probed.manufacturer || 'Unknown',
      serialPath: portPath,
      displayPort: portPath,
      mode: 'serial',
      state: 'online',
      enabled: true,
      autoConnect: true,
      backend: 'AT', ipVersion: 'IPv4', apn: '', networkEnabled: true, vowifiEnabled: false, airplaneEnabled: false,
      capabilities: { sms: true, voice: true, ussd: true, esim: true, vowifi: false, rawAT: true },
      status: probed.status
    }
    await this.store.update(draft => { draft.devices.push(device) })
    await this.store.log('info', 'device', `已添加 ${device.name}（${portPath}）`)
    return device
  }

  async updateDevice(id: string, patch: DevicePatch) {
    let updated: DeviceRecord | undefined
    await this.store.update(draft => {
      const device = draft.devices.find(item => item.id === id)
      if (!device) throw new Error('设备不存在')
      Object.assign(device, patch)
      updated = structuredClone(device)
    })
    return updated!
  }

  async removeDevice(id: string) {
    const before = this.store.snapshot().devices.length
    await this.store.update(draft => { draft.devices = draft.devices.filter(device => device.id !== id) })
    return this.store.snapshot().devices.length < before
  }

  async refreshDevice(id: string) {
    const device = this.requireDevice(id)
    if (device.mode === 'simulation') return device
    if (!device.serialPath) throw new Error('设备未配置串口')
    try {
      const probed = await this.probe(device.serialPath)
      await this.store.update(draft => {
        const target = draft.devices.find(item => item.id === id)
        if (!target) return
        target.state = 'online'
        target.model = probed.model || target.model
        target.manufacturer = probed.manufacturer || target.manufacturer
        target.status = probed.status
        delete target.lastError
      })
    } catch (error) {
      await this.store.update(draft => {
        const target = draft.devices.find(item => item.id === id)
        if (!target) return
        target.state = 'error'
        target.lastError = error instanceof Error ? error.message : String(error)
      })
      throw error
    }
    return this.requireDevice(id)
  }

  async executeAT(deviceId: string, command: string, timeoutMs = 5000): Promise<ATCommandResult> {
    const device = this.requireDevice(deviceId)
    const normalized = command.trim()
    if (!/^AT[+&A-Z0-9?=,"*#._\-]*$/i.test(normalized)) throw new Error('AT 指令格式不合法')
    const started = Date.now()
    if (device.mode === 'simulation') {
      const response = simulateAT(normalized, device)
      await this.store.log('info', 'at', `${device.name}: ${normalized}`, response)
      return { command: normalized, response, durationMs: Date.now() - started }
    }
    if (!device.serialPath) throw new Error('设备未配置串口')
    const response = await this.exclusive(device.serialPath, () => withATSession(device.serialPath!, session => session.command(normalized, timeoutMs)))
    await this.store.log('info', 'at', `${device.name}: ${normalized}`, response)
    return { command: normalized, response, durationMs: Date.now() - started }
  }

  async executeUSSD(deviceId: string, command: string): Promise<USSDResult> {
    const device = this.requireDevice(deviceId)
    if (!command.trim()) throw new Error('请输入 USSD 指令')
    if (device.mode === 'simulation') return { command, response: '余额 38.60 元，有效期至 2027-12-31', sessionActive: false }
    if (!device.serialPath) throw new Error('设备未配置串口')
    const safe = command.replace(/["\r\n]/g, '')
    const response = await this.exclusive(device.serialPath, () => withATSession(device.serialPath!, session => session.commandUntil(`AT+CUSD=1,"${safe}",15`, /\+CUSD:/, 30_000)))
    const match = response.match(/\+CUSD:\s*\d+,"([^"]*)"/)
    return { command, response: decodeMaybeUCS2(match?.[1] ?? response), sessionActive: /^\+CUSD:\s*1/.test(response) }
  }

  async cancelUSSD(deviceId: string) {
    await this.executeAT(deviceId, 'AT+CUSD=2')
    return true
  }

  async reboot(deviceId: string) {
    const device = this.requireDevice(deviceId)
    if (device.mode === 'simulation') return true
    await this.executeAT(deviceId, 'AT+CFUN=1,1', 10_000)
    return true
  }

  async setFlightMode(deviceId: string, enabled: boolean) {
    await this.executeAT(deviceId, enabled ? 'AT+CFUN=0' : 'AT+CFUN=1', 15_000)
    await this.updateDevice(deviceId, { airplaneEnabled: enabled, networkEnabled: !enabled })
    return true
  }

  async scanOperators(deviceId: string) {
    const result = await this.executeAT(deviceId, 'AT+COPS=?', 90_000)
    return [...result.response.matchAll(/\(\d+,"[^"]*","[^"]*","(\d{5,6})"/g)].map(match => match[1])
  }

  async selectOperator(deviceId: string, plmn?: string) {
    await this.executeAT(deviceId, plmn ? `AT+COPS=1,2,"${plmn}"` : 'AT+COPS=0', 45_000)
    return true
  }

  async diagnose(deviceId: string): Promise<DeviceDiagnostics> {
    const device = this.requireDevice(deviceId)
    if (device.mode === 'simulation') return buildDiagnostics(device, {})
    if (!device.serialPath) throw new Error('设备未配置 AT 端口')
    const commands = ['AT', 'AT+CPIN?', 'AT+CCID', 'AT+CIMI', 'AT+CSQ', 'AT+CESQ', 'AT+CEREG?', 'AT+CGREG?', 'AT+CREG?', 'AT+COPS?', 'AT!GSTATUS?']
    const raw = await this.exclusive(device.serialPath, () => withATSession(device.serialPath!, async session => {
      const responses: Record<string, string> = {}
      for (const command of commands) responses[command] = await session.command(command, 5000).catch(error => `ERROR: ${error instanceof Error ? error.message : String(error)}`)
      return responses
    }))
    const fresh = await this.refreshDevice(deviceId).catch(() => this.requireDevice(deviceId))
    const diagnostics = buildDiagnostics(fresh, raw)
    await this.store.log(diagnostics.summary === 'healthy' ? 'info' : 'warn', 'diagnostics', `${fresh.name} 诊断完成`, diagnostics.checks.filter(check => check.state !== 'pass').map(check => `${check.label}: ${check.value}`).join('；'))
    return diagnostics
  }

  requireDevice(id: string) {
    const device = this.store.snapshot().devices.find(item => item.id === id)
    if (!device) throw new Error('设备不存在')
    return device
  }

  private async probe(portPath: string) {
    return this.exclusive(portPath, () => withATSession(portPath, async session => {
      await session.command('AT', 2500)
      // Modems use one request/response stream. Sending commands concurrently can
      // associate the ICCID/IMSI response with the wrong pending command.
      const query = (command: string) => session.command(command, 3000).catch(() => '')
      const identity = await query('ATI')
      const imei = await query('AT+CGSN')
      const sim = await query('AT+CPIN?')
      const iccid = await query('AT+CCID')
      const imsi = await query('AT+CIMI')
      const signal = await query('AT+CSQ')
      const extendedSignal = await query('AT+CESQ')
      const operator = await query('AT+COPS?')
      const epsRegistration = await query('AT+CEREG?')
      const csRegistration = await query('AT+CREG?')
      const firmware = await query('AT+CGMR')
      const sierraStatus = /sierra/i.test(identity) ? await query('AT!GSTATUS?') : ''
      const csq = Number(signal.match(/\+CSQ:\s*(\d+)/)?.[1] ?? 0)
      const dbm = csq === 99 ? -113 : -113 + 2 * csq
      const radio = parseRadioMetrics(extendedSignal, sierraStatus)
      const operatorMatch = operator.match(/\+COPS:\s*\d+,\d+,"([^"]*)"(?:,(\d+))?/)
      const idLines = identity.split('\n').filter(line => !/^(ATI|OK)$/i.test(line))
      const model = idLines.find(line => /EC\d|EG\d|EM\d|RM\d|SIMCOM|HUAWEI|MODEM/i.test(line)) || idLines.at(-1) || 'Cellular Modem'
      return {
        model,
        manufacturer: idLines[0] || '',
        status: {
          ...emptyStatus(),
          signal: radio.rsrp !== undefined ? rsrpToPercent(radio.rsrp) : csq === 99 ? 0 : Math.min(100, Math.round(csq / 31 * 100)),
          dbm: radio.rsrp ?? dbm,
          network: radio.network || actToNetwork(operatorMatch?.[2]),
          band: radio.band || '—',
          operator: operatorMatch?.[1] || '未知',
          imei: extractDigits(imei, 14, 17),
          imsi: extractDigits(imsi, 14, 17),
          iccid: extractDigits(iccid, 18, 22),
          simState: sim.match(/\+CPIN:\s*([^\n]+)/)?.[1]?.trim() || '未知',
          registration: registrationLabel(epsRegistration || csRegistration),
          firmware: firmware.split('\n').find(line => !/^(AT\+CGMR|OK)$/i.test(line)) || '',
          rsrp: radio.rsrp,
          rsrq: radio.rsrq,
          sinr: radio.sinr,
          channel: radio.channel,
          packetService: radio.packetService,
          updatedAt: new Date().toISOString()
        } satisfies DeviceStatus
      }
    }))
  }

  private exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve()
    const current = previous.then(task, task)
    const settled = current.catch(() => undefined)
    this.locks.set(key, settled)
    return current.finally(() => {
      if (this.locks.get(key) === settled) this.locks.delete(key)
    })
  }
}

function buildDiagnostics(device: DeviceRecord, raw: Record<string, string>): DeviceDiagnostics {
  const status = device.status
  const portReady = device.state === 'online'
  const simReady = status.simState === 'READY'
  const registered = status.registration.startsWith('已注册')
  const hasSignal = status.signal > 0 || (status.rsrp !== undefined && status.rsrp > -140)
  const checks: DeviceDiagnostics['checks'] = [
    { id: 'port', label: 'AT 控制端口', state: portReady ? 'pass' : 'error', value: portReady ? `${device.serialPath || device.displayPort} 可通信` : device.lastError || '端口不可用', suggestion: portReady ? undefined : '关闭占用串口的软件，检查驱动后重新扫描。' },
    { id: 'sim', label: 'SIM 状态', state: simReady ? 'pass' : status.simState.includes('PIN') ? 'warning' : 'error', value: status.simState || '未知', suggestion: simReady ? undefined : '重新插卡并确认卡槽方向；若需要 PIN，请先解锁 SIM。' },
    { id: 'identity', label: 'SIM 标识读取', state: status.iccid && status.imsi ? 'pass' : simReady ? 'warning' : 'unknown', value: status.iccid && status.imsi ? `ICCID ${maskIdentifier(status.iccid)} · IMSI ${maskIdentifier(status.imsi)}` : 'ICCID/IMSI 不完整', suggestion: status.iccid && status.imsi ? undefined : '刷新状态；部分模组需要厂商专用 ICCID 指令。' },
    { id: 'signal', label: '射频信号', state: hasSignal ? status.signal >= 25 ? 'pass' : 'warning' : 'error', value: status.rsrp !== undefined ? `RSRP ${status.rsrp} dBm${status.rsrq !== undefined ? ` · RSRQ ${status.rsrq} dB` : ''}${status.sinr !== undefined ? ` · SINR ${status.sinr} dB` : ''}` : `${status.signal}% · ${status.dbm} dBm`, suggestion: hasSignal ? status.signal < 25 ? '信号较弱，调整天线位置或检查馈线。' : undefined : '检查主/分集天线连接，确认飞行模式已关闭。' },
    { id: 'registration', label: '网络注册', state: registered ? 'pass' : status.registration.includes('搜索') ? 'warning' : 'error', value: `${status.registration} · ${status.operator} · ${status.network}`, suggestion: registered ? undefined : '确认 APN、频段与运营商兼容；必要时执行运营商扫描。' },
    { id: 'packet', label: '分组数据', state: /attached|connected/i.test(status.packetService || '') ? 'pass' : registered ? 'warning' : 'unknown', value: status.packetService || '未报告', suggestion: registered && !/attached|connected/i.test(status.packetService || '') ? 'SIM 已注册但数据未附着，请检查 APN 和 Windows WWAN 连接。' : undefined }
  ]
  const severe = checks.some(check => check.state === 'error')
  const attention = checks.some(check => check.state === 'warning')
  return { deviceId: device.id, generatedAt: new Date().toISOString(), summary: !portReady ? 'offline' : severe || attention ? 'attention' : 'healthy', checks, raw }
}

function maskIdentifier(value: string) {
  if (value.length < 9) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function parseRadioMetrics(cesq: string, sierra: string) {
  const result: { rsrp?: number; rsrq?: number; sinr?: number; band?: string; channel?: string; network?: string; packetService?: string } = {}
  const cesqMatch = cesq.match(/\+CESQ:\s*\d+,\d+,\d+,\d+,(\d+),(\d+)/)
  if (cesqMatch) {
    const rsrqIndex = Number(cesqMatch[1])
    const rsrpIndex = Number(cesqMatch[2])
    if (rsrqIndex >= 0 && rsrqIndex <= 34) result.rsrq = roundOne(-19.5 + rsrqIndex * 0.5)
    if (rsrpIndex >= 0 && rsrpIndex <= 97) result.rsrp = -140 + rsrpIndex
  }
  result.rsrp = parseSignedMetric(sierra, /RSRP[^\n]*?(-?\d+(?:\.\d+)?)\s*dBm/i) ?? result.rsrp
  result.rsrq = parseSignedMetric(sierra, /RSRQ[^\n]*?(-?\d+(?:\.\d+)?)\s*dB/i) ?? result.rsrq
  result.sinr = parseSignedMetric(sierra, /SINR[^\n]*?(-?\d+(?:\.\d+)?)\s*dB/i)
  result.band = sierra.match(/LTE band:\s*([^\r\n]+)/i)?.[1]?.trim() || sierra.match(/LTE band[^\n]*?B(\d+)/i)?.[1]?.replace(/^/, 'B')
  result.channel = sierra.match(/LTE Rx chan:\s*(\d+)/i)?.[1]
  result.network = sierra.match(/System mode:\s*([^\r\n]+)/i)?.[1]?.trim()
  result.packetService = sierra.match(/PS state:\s*([^\r\n]+)/i)?.[1]?.trim()
  return result
}

function parseSignedMetric(value: string, pattern: RegExp) {
  const matched = value.match(pattern)?.[1]
  return matched === undefined ? undefined : Number(matched)
}

function roundOne(value: number) { return Math.round(value * 10) / 10 }
function rsrpToPercent(rsrp: number) { return Math.max(0, Math.min(100, Math.round((rsrp + 120) / 40 * 100))) }

function simulateAT(command: string, device: DeviceRecord) {
  const upper = command.toUpperCase()
  if (upper === 'AT') return 'OK'
  if (upper === 'ATI') return `${device.manufacturer}\n${device.model}\nOK`
  if (upper === 'AT+CSQ') return `+CSQ: ${Math.round(device.status.signal / 100 * 31)},99\nOK`
  if (upper === 'AT+CGSN') return `${device.status.imei}\nOK`
  if (upper === 'AT+CIMI') return `${device.status.imsi}\nOK`
  if (upper === 'AT+CCID') return `+CCID: ${device.status.iccid}\nOK`
  if (upper === 'AT+CPIN?') return `+CPIN: ${device.status.simState}\nOK`
  if (upper === 'AT+COPS?') return `+COPS: 0,0,"${device.status.operator}",7\nOK`
  if (upper === 'AT+CREG?') return '+CREG: 0,1\nOK'
  if (upper === 'AT+CGMR') return `${device.status.firmware}\nOK`
  return 'OK'
}

function extractDigits(value: string, min: number, max: number) {
  return value.match(new RegExp(`\\d{${min},${max}}`))?.[0] ?? ''
}

function actToNetwork(value?: string) {
  return ({ '0': '2G GSM', '2': '3G UTRAN', '7': '4G LTE', '9': '5G NSA', '11': '5G SA' } as Record<string, string>)[value ?? ''] ?? '未知'
}

function registrationLabel(response: string) {
  const status = Number(response.match(/\+(?:CE|C|CG)REG:\s*\d,\s*(\d+)/)?.[1] ?? 0)
  if (status === 1) return '已注册（本地）'
  if (status === 5) return '已注册（漫游）'
  if (status === 6) return '已注册（仅短信）'
  if (status === 7) return '已注册（漫游/仅短信）'
  if (status === 2) return '正在搜索网络'
  if (status === 3) return '注册被拒绝'
  if (status === 8) return '仅紧急服务'
  return '未注册'
}

function decodeMaybeUCS2(value: string) {
  if (!/^[0-9A-F]+$/i.test(value) || value.length % 4 !== 0) return value
  try {
    let output = ''
    for (let index = 0; index < value.length; index += 4) output += String.fromCharCode(Number.parseInt(value.slice(index, index + 4), 16))
    return output
  } catch { return value }
}

async function listWindowsModemPorts(): Promise<SerialPortDescriptor[]> {
  const command = [
    'Get-CimInstance Win32_POTSModem -ErrorAction SilentlyContinue',
    "Where-Object { $_.Status -eq 'OK' -and $_.AttachedTo -match '^COM\\d+$' }",
    'Select-Object AttachedTo,Name,PNPDeviceID',
    'ConvertTo-Json -Compress'
  ].join(' | ')
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 1024 * 1024
    })
    if (!stdout.trim()) return []
    const parsed = JSON.parse(stdout) as Record<string, string> | Array<Record<string, string>>
    return (Array.isArray(parsed) ? parsed : [parsed]).map(item => {
      const pnpId = item.PNPDeviceID ?? ''
      return {
        path: item.AttachedTo,
        manufacturer: item.Name?.split(' ')[0] || 'Windows Modem',
        friendlyName: item.Name || `WWAN Modem (${item.AttachedTo})`,
        vendorId: pnpId.match(/VID_([0-9A-F]{4})/i)?.[1],
        productId: pnpId.match(/PID_([0-9A-F]{4})/i)?.[1],
        likelyModem: true
      }
    })
  } catch {
    return []
  }
}
