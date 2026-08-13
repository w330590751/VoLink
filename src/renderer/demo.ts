import type { AppSnapshot } from '../shared/types'

export function createDemoSnapshot(): AppSnapshot {
  const now = new Date().toISOString()
  return {
    devices: [
      {
        id: 'sim-ec25', name: '主卡模组', model: 'EC25-A', manufacturer: 'Quectel', displayPort: '模拟 COM3', mode: 'simulation', state: 'online', enabled: true, autoConnect: true,
        capabilities: { sms: true, voice: true, ussd: true, esim: false, vowifi: false, rawAT: true },
        status: { signal: 92, dbm: -83, network: '5G NSA', band: 'n78', channel: '633984', operator: '中国移动', imei: '866123045678912', imsi: '460001234567890', iccid: '8986001234567890123', simState: 'READY', registration: '已注册（本地）', firmware: 'EC25EFAR06A12M4G', rsrp: -83, rsrq: -8.5, sinr: 24, packetService: 'Attached', updatedAt: now }
      },
      {
        id: 'sim-ec20', name: '短信模组', model: 'EC20-C', manufacturer: 'Quectel', displayPort: '模拟 COM5', mode: 'simulation', state: 'online', enabled: true, autoConnect: true,
        capabilities: { sms: true, voice: true, ussd: true, esim: true, vowifi: true, rawAT: true },
        status: { signal: 61, dbm: -101, network: '4G LTE', band: 'B3', channel: '1650', operator: '中国联通', imei: '860512040123456', imsi: '460011234567890', iccid: '8986011234567890123', simState: 'READY', registration: '已注册（本地）', firmware: 'EC20CEHCLGR08A09M1G', rsrp: -101, rsrq: -13, sinr: 8, packetService: 'Attached', updatedAt: now }
      }
    ],
    messages: [
      { id: 'sms-1', deviceId: 'sim-ec25', sender: '10086', recipient: '', body: '本月剩余流量 12.5GB。', direction: 'inbound', status: 'received', timestamp: now, unread: true },
      { id: 'sms-2', deviceId: 'sim-ec20', sender: '', recipient: '13800138000', body: 'VoLink 测试短信', direction: 'outbound', status: 'sent', timestamp: now }
    ],
    calls: [
      { id: 'call-1', number: '13800138000', deviceId: 'sim-ec25', modem: '主卡模组', startedAt: now, duration: '02:18', direction: 'outbound', status: 'completed' }
    ],
    proxies: [
      { id: 'proxy-1', name: '主卡 SOCKS5', protocol: 'socks5', listenHost: '127.0.0.1', listenPort: 1080, deviceId: 'sim-ec25', autoStart: false, status: 'stopped', connections: 0, bytesUp: 0, bytesDown: 0 }
    ],
    esimProfiles: [
      { id: 'esim-1', deviceId: 'sim-ec20', iccid: '8985200000000000001', name: '中国联通测试卡', provider: 'China Unicom', status: 'enabled', createdAt: now, updatedAt: now }
    ],
    settings: {
      simulationMode: true, autoScan: true, scanIntervalSeconds: 15, lpacPath: '',
      notifications: {
        desktop: true, webhookEnabled: false, webhookUrl: '', barkEnabled: false, barkUrl: '', pushPlusEnabled: false, pushPlusToken: '',
        telegramEnabled: false, telegramBotToken: '', telegramChatId: '', feishuEnabled: false, feishuWebhookUrl: '',
        qqEnabled: false, qqAppId: '', qqAppSecret: '', qqGroupIds: '', qqUserIds: '', emailEnabled: false,
        emailHost: '', emailPort: 465, emailUsername: '', emailPassword: '', emailTo: ''
      }
    },
    logs: [{ id: 'log-1', level: 'info', scope: 'system', message: 'VoLink 已启动', timestamp: now }],
    availablePorts: []
  }
}
