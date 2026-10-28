import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AppSettings, LogRecord, StoreData } from '../shared/types.js'

const defaultSettings: AppSettings = {
  simulationMode: true,
  autoScan: true,
  scanIntervalSeconds: 15,
  lpacPath: '',
  notifications: {
    desktop: true,
    webhookEnabled: false,
    webhookUrl: '',
    barkEnabled: false,
    barkUrl: '',
    pushPlusEnabled: false,
    pushPlusToken: '',
    telegramEnabled: false,
    telegramBotToken: '',
    telegramChatId: '',
    feishuEnabled: false,
    feishuWebhookUrl: '',
    qqEnabled: false,
    qqAppId: '',
    qqAppSecret: '',
    qqGroupIds: '',
    qqUserIds: '',
    emailEnabled: false,
    emailHost: '',
    emailPort: 465,
    emailUsername: '',
    emailPassword: '',
    emailTo: ''
  }
}

const initialData = (): StoreData => ({
  schemaVersion: 1,
  devices: [],
  messages: [],
  calls: [],
  proxies: [],
  esimProfiles: [],
  settings: structuredClone(defaultSettings),
  logs: []
})

export class AppStore {
  private data: StoreData = initialData()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoreData>
      this.data = {
        ...initialData(),
        ...parsed,
        settings: {
          ...defaultSettings,
          ...parsed.settings,
          notifications: {
            ...defaultSettings.notifications,
            ...parsed.settings?.notifications
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const backup = `${this.filePath}.corrupt-${Date.now()}`
        await fs.copyFile(this.filePath, backup).catch(() => undefined)
      }
      await this.persist()
    }
  }

  snapshot(): StoreData {
    return structuredClone(this.data)
  }

  async update(mutator: (draft: StoreData) => void | StoreData) {
    const next = structuredClone(this.data)
    const result = mutator(next)
    this.data = result ?? next
    await this.persist()
    return this.snapshot()
  }

  async log(level: LogRecord['level'], scope: string, message: string, details?: string) {
    const entry: LogRecord = {
      id: crypto.randomUUID(),
      level,
      scope,
      message,
      details,
      timestamp: new Date().toISOString()
    }
    await this.update(draft => {
      draft.logs.unshift(entry)
      draft.logs = draft.logs.slice(0, 500)
    })
    return entry
  }

  async deleteLog(id: string) {
    if (!this.data.logs.some(log => log.id === id)) return false
    await this.update(draft => { draft.logs = draft.logs.filter(log => log.id !== id) })
    return true
  }

  async clearLogs() {
    const deleted = this.data.logs.length
    if (deleted) await this.update(draft => { draft.logs = [] })
    return deleted
  }

  private persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      const tempPath = `${this.filePath}.tmp`
      await fs.writeFile(tempPath, JSON.stringify(this.data, null, 2), 'utf8')
      await fs.rename(tempPath, this.filePath)
    })
    return this.writeQueue
  }
}
