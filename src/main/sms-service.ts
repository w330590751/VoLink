import type { SmsMessage } from '../shared/types.js'
import { AppStore } from './store.js'
import { DeviceService } from './device-service.js'
import { withATSession } from './at-channel.js'
import { sendConfiguredNotification } from './notification-service.js'
import { parseTextModeSMS } from './sms-codec.js'

export class SMSService {
  constructor(private readonly store: AppStore, private readonly devices: DeviceService) {}

  async send(deviceId: string, recipient: string, body: string) {
    const device = this.devices.requireDevice(deviceId)
    const cleanRecipient = recipient.replace(/\s/g, '')
    if (!/^\+?\d{3,20}$/.test(cleanRecipient)) throw new Error('收件号码格式不正确')
    if (!body.trim()) throw new Error('短信内容不能为空')

    const message: SmsMessage = {
      id: crypto.randomUUID(),
      deviceId,
      sender: '',
      recipient: cleanRecipient,
      body: body.trim(),
      direction: 'outbound',
      status: 'queued',
      timestamp: new Date().toISOString()
    }
    await this.store.update(draft => { draft.messages.unshift(message) })

    try {
      if (device.mode !== 'simulation') {
        if (!device.serialPath) throw new Error('设备未配置串口')
        await withATSession(device.serialPath, async session => {
          const useUCS2 = /[^\x00-\x7f]/.test(body)
          await session.command('AT+CMGF=1')
          await session.command(useUCS2 ? 'AT+CSCS="UCS2"' : 'AT+CSCS="GSM"')
          const target = useUCS2 ? encodeUCS2(cleanRecipient) : cleanRecipient
          const payload = useUCS2 ? encodeUCS2(body) : body
          await session.sendSMS(`AT+CMGS="${target}"`, payload)
        })
      }
      message.status = 'sent'
      await this.store.update(draft => {
        const target = draft.messages.find(item => item.id === message.id)
        if (target) target.status = 'sent'
      })
      await this.store.log('info', 'sms', `短信已发送至 ${cleanRecipient}`, `device=${device.name}`)
    } catch (error) {
      message.status = 'failed'
      await this.store.update(draft => {
        const target = draft.messages.find(item => item.id === message.id)
        if (target) target.status = 'failed'
      })
      await this.store.log('error', 'sms', `短信发送失败：${cleanRecipient}`, error instanceof Error ? error.message : String(error))
      throw error
    }
    return message
  }

  async refresh(deviceId: string) {
    const device = this.devices.requireDevice(deviceId)
    if (device.mode === 'simulation') return this.store.snapshot().messages.filter(message => message.deviceId === deviceId)
    if (!device.serialPath) throw new Error('设备未配置串口')

    const response = await withATSession(device.serialPath, async session => {
      await session.command('AT+CMGF=1')
      const charset = await session.command('AT+CSCS="UCS2"').then(() => 'UCS2' as const).catch(async () => {
        await session.command('AT+CSCS="GSM"').catch(() => undefined)
        return 'GSM' as const
      })
      try {
        return { charset, response: await session.command('AT+CMGL="ALL"', 15_000) }
      } finally {
        if (charset === 'UCS2') await session.command('AT+CSCS="GSM"').catch(() => undefined)
      }
    })
    const received = parseTextModeSMS(response.response, deviceId, response.charset)
    const existing = this.store.snapshot().messages
    const knownIndexes = new Set(existing.filter(item => item.deviceId === deviceId).flatMap(item => item.modemIndexes ?? (item.modemIndex === undefined ? [] : [item.modemIndex])))
    const fresh = received.filter(item => !(item.modemIndexes ?? []).some(index => knownIndexes.has(index)))
    await this.store.update(draft => {
      draft.messages = draft.messages.filter(item => item.deviceId !== deviceId || (item.modemIndex === undefined && !item.modemIndexes?.length))
      draft.messages.unshift(...received)
    })
    if (fresh.length) {
      await this.notify(fresh)
      await this.store.log('info', 'sms', `收到 ${fresh.length} 条新短信`, `device=${device.name}`)
    }
    await this.store.log('info', 'sms', `短信同步完成，共 ${received.length} 条`, `device=${device.name}`)
    return this.store.snapshot().messages.filter(message => message.deviceId === deviceId)
  }

  async delete(id: string) {
    const message = this.store.snapshot().messages.find(item => item.id === id)
    if (!message) return false
    const device = this.devices.requireDevice(message.deviceId)
    const modemIndexes = message.modemIndexes ?? (message.modemIndex === undefined ? [] : [message.modemIndex])
    if (modemIndexes.length && device.mode === 'serial' && device.serialPath) {
      await withATSession(device.serialPath, async session => {
        for (const index of modemIndexes) await session.command(`AT+CMGD=${index}`, 5000).catch(() => undefined)
      }).catch(() => undefined)
    }
    await this.store.update(draft => { draft.messages = draft.messages.filter(item => item.id !== id) })
    return true
  }

  private async notify(messages: SmsMessage[]) {
    const settings = this.store.snapshot().settings.notifications
    for (const message of messages) {
      const result = await sendConfiguredNotification(settings, {
        title: `VoLink 新短信 · ${message.sender}`,
        body: message.body,
        event: 'sms.received',
        data: { sender: message.sender, timestamp: message.timestamp }
      })
      if (result.failures.length) await this.store.log('warn', 'notify', '部分通知通道发送失败', result.failures.join('；'))
    }
  }
}

function encodeUCS2(value: string) {
  return [...value].map(character => character.charCodeAt(0).toString(16).padStart(4, '0')).join('').toUpperCase()
}
