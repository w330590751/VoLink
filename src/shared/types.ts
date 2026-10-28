export type DeviceMode = 'serial' | 'simulation'
export type DeviceConnectionState = 'online' | 'offline' | 'connecting' | 'error'

export type SerialPortDescriptor = {
  path: string
  manufacturer?: string
  serialNumber?: string
  vendorId?: string
  productId?: string
  friendlyName?: string
  likelyModem: boolean
}

export type DeviceCapabilities = {
  sms: boolean
  voice: boolean
  ussd: boolean
  esim: boolean
  vowifi: boolean
  rawAT: boolean
}

export type DeviceStatus = {
  signal: number
  dbm: number
  network: string
  band: string
  operator: string
  imei: string
  imsi: string
  iccid: string
  simState: string
  registration: string
  firmware: string
  phoneNumber?: string
  rsrp?: number
  rsrq?: number
  sinr?: number
  channel?: string
  packetService?: string
  updatedAt: string
}

export type DiagnosticCheck = {
  id: string
  label: string
  state: 'pass' | 'warning' | 'error' | 'unknown'
  value: string
  suggestion?: string
}

export type DeviceDiagnostics = {
  deviceId: string
  generatedAt: string
  summary: 'healthy' | 'attention' | 'offline'
  checks: DiagnosticCheck[]
  raw: Record<string, string>
}

export type UpdateInfo = {
  currentVersion: string
  latestVersion: string
  available: boolean
  releaseUrl: string
  downloadUrl?: string
  publishedAt?: string
  checkedAt: string
}

export type DeviceRecord = {
  id: string
  name: string
  model: string
  manufacturer: string
  serialPath?: string
  displayPort: string
  mode: DeviceMode
  state: DeviceConnectionState
  enabled: boolean
  autoConnect: boolean
  networkInterface?: string
  backend?: 'AT' | 'MBIM' | 'QMI'
  ipVersion?: 'IPv4' | 'IPv6' | 'IPv4/IPv6'
  apn?: string
  networkEnabled?: boolean
  vowifiEnabled?: boolean
  airplaneEnabled?: boolean
  publicIp?: string
  publicIpv6?: string
  cardIccid?: string
  phoneNumberOverride?: string
  capabilities: DeviceCapabilities
  status: DeviceStatus
  lastError?: string
}

export type Modem = {
  id: string
  model: string
  port: string
  serialPath?: string
  signal: number
  dbm: number
  network: string
  band: string
  imei: string
  sim: '已注册' | '未插入' | '锁定'
  status: '在线' | '离线' | '连接中'
  accent: 'blue' | 'violet' | 'teal'
}

export type CallState = 'idle' | 'dialing' | 'active' | 'ended' | 'error'

export type CallLog = {
  id: string
  number: string
  deviceId: string
  modem: string
  startedAt: string
  endedAt?: string
  duration: string
  direction: 'inbound' | 'outbound'
  status: 'completed' | 'missed' | 'failed' | 'active'
}

export type SmsMessage = {
  id: string
  deviceId: string
  sender: string
  recipient: string
  body: string
  direction: 'inbound' | 'outbound'
  status: 'received' | 'queued' | 'sent' | 'failed'
  timestamp: string
  unread?: boolean
  modemIndex?: number
  modemIndexes?: number[]
}

export type ProxyProtocol = 'http' | 'socks5'
export type ProxyStatus = 'stopped' | 'starting' | 'running' | 'error'

export type ProxyInstance = {
  id: string
  name: string
  protocol: ProxyProtocol
  listenHost: string
  listenPort: number
  username?: string
  password?: string
  deviceId?: string
  bindAddress?: string
  autoStart: boolean
  status: ProxyStatus
  connections: number
  bytesUp: number
  bytesDown: number
  lastError?: string
}

export type EsimProfile = {
  id: string
  deviceId: string
  iccid: string
  name: string
  provider: string
  status: 'enabled' | 'disabled' | 'downloading' | 'error'
  activationCode?: string
  createdAt: string
  updatedAt: string
}

export type NotificationSettings = {
  desktop: boolean
  webhookEnabled: boolean
  webhookUrl: string
  barkEnabled: boolean
  barkUrl: string
  pushPlusEnabled: boolean
  pushPlusToken: string
  telegramEnabled: boolean
  telegramBotToken: string
  telegramChatId: string
  feishuEnabled: boolean
  feishuWebhookUrl: string
  qqEnabled: boolean
  qqAppId: string
  qqAppSecret: string
  qqGroupIds: string
  qqUserIds: string
  emailEnabled: boolean
  emailHost: string
  emailPort: number
  emailUsername: string
  emailPassword: string
  emailTo: string
}

export type AppSettings = {
  simulationMode: boolean
  autoScan: boolean
  scanIntervalSeconds: number
  lpacPath: string
  notifications: NotificationSettings
}

export type LogRecord = {
  id: string
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  message: string
  timestamp: string
  details?: string
}

export type AppSnapshot = {
  devices: DeviceRecord[]
  messages: SmsMessage[]
  calls: CallLog[]
  proxies: ProxyInstance[]
  esimProfiles: EsimProfile[]
  settings: AppSettings
  logs: LogRecord[]
  availablePorts: SerialPortDescriptor[]
}

export type StoreData = Omit<AppSnapshot, 'availablePorts'> & { schemaVersion: number }

export type ATCommandResult = {
  command: string
  response: string
  durationMs: number
}

export type USSDResult = {
  command: string
  response: string
  sessionActive: boolean
}

export type DevicePatch = Partial<Pick<DeviceRecord,
  'name' | 'serialPath' | 'enabled' | 'autoConnect' | 'networkInterface' | 'backend' |
  'ipVersion' | 'apn' | 'networkEnabled' | 'vowifiEnabled' | 'airplaneEnabled' | 'cardIccid' | 'phoneNumberOverride'
>>

export type ProxyInput = Omit<ProxyInstance, 'id' | 'status' | 'connections' | 'bytesUp' | 'bytesDown' | 'lastError'> & { id?: string }

export type EsimProfileInput = Pick<EsimProfile, 'deviceId' | 'name' | 'provider'> & { activationCode: string; iccid?: string }

export interface VoLinkAPI {
  getSnapshot(): Promise<AppSnapshot>
  rescanDevices(): Promise<AppSnapshot>
  addDevice(portPath: string, name?: string): Promise<DeviceRecord>
  updateDevice(id: string, patch: DevicePatch): Promise<DeviceRecord>
  removeDevice(id: string): Promise<boolean>
  executeAT(deviceId: string, command: string, timeoutMs?: number): Promise<ATCommandResult>
  executeUSSD(deviceId: string, command: string): Promise<USSDResult>
  cancelUSSD(deviceId: string): Promise<boolean>
  rebootDevice(deviceId: string): Promise<boolean>
  setFlightMode(deviceId: string, enabled: boolean): Promise<boolean>
  setDataEnabled(deviceId: string, enabled: boolean): Promise<boolean>
  scanOperators(deviceId: string): Promise<string[]>
  selectOperator(deviceId: string, plmn?: string): Promise<boolean>
  diagnoseDevice(deviceId: string): Promise<DeviceDiagnostics>
  sendSMS(deviceId: string, recipient: string, body: string): Promise<SmsMessage>
  refreshSMS(deviceId: string): Promise<SmsMessage[]>
  deleteSMS(id: string): Promise<boolean>
  dial(deviceId: string, number: string): Promise<{ state: CallState; number: string; transport: string }>
  hangup(): Promise<{ state: CallState }>
  callStatus(): Promise<CallState>
  saveProxy(input: ProxyInput): Promise<ProxyInstance>
  deleteProxy(id: string): Promise<boolean>
  startProxy(id: string): Promise<ProxyInstance>
  stopProxy(id: string): Promise<ProxyInstance>
  importEsim(input: EsimProfileInput): Promise<EsimProfile>
  renameEsim(id: string, name: string): Promise<EsimProfile>
  enableEsim(id: string): Promise<EsimProfile>
  disableEsim(id: string): Promise<EsimProfile>
  deleteEsim(id: string): Promise<boolean>
  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>
  testNotification(): Promise<boolean>
  checkForUpdates(): Promise<UpdateInfo>
  openExternal(url: string): Promise<boolean>
  listPorts(): Promise<SerialPortDescriptor[]>
}
