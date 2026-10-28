import type { SmsMessage } from '../shared/types.js'

type ParsedMessage = SmsMessage & { rawBytes: number }

export function parseTextModeSMS(response: string, deviceId: string, charset: 'GSM' | 'UCS2' = 'GSM') {
  const lines = response.replace(/\r/g, '').split('\n')
  const messages: ParsedMessage[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trimStart().startsWith('+CMGL:')) continue
    const fields = parseCsv(lines[index].replace(/^\s*\+CMGL:\s*/, ''))
    const modemIndex = Number(fields[0])
    if (!Number.isInteger(modemIndex)) continue
    const storageStatus = fields[1].toUpperCase()
    const address = decodeModemText(fields[2], charset)
    const bodyLines: string[] = []
    while (index + 1 < lines.length) {
      const candidate = lines[index + 1]
      if (candidate.trimStart().startsWith('+CMGL:') || /^(?:OK|ERROR)$/.test(candidate.trim())) break
      index += 1
      if (!/^AT\+CMGL/i.test(candidate.trim())) bodyLines.push(candidate)
    }
    const rawBody = bodyLines.join('\n').trim()
    const body = decodeModemText(rawBody, charset)
    const inbound = !storageStatus.startsWith('STO')
    messages.push({
      id: crypto.randomUUID(), deviceId, sender: inbound ? address : '', recipient: inbound ? '' : address, body,
      direction: inbound ? 'inbound' : 'outbound', status: inbound ? 'received' : storageStatus.includes('UNSENT') ? 'failed' : 'sent',
      timestamp: normalizeTimestamp(fields[4]), unread: storageStatus.includes('UNREAD'), modemIndex,
      modemIndexes: [modemIndex], rawBytes: isHex(rawBody) ? rawBody.length / 2 : Buffer.byteLength(rawBody)
    })
  }
  return mergeMultipartMessages(messages).map(({ rawBytes: _rawBytes, ...message }) => message)
}

export function decodeModemText(value: string, charset: 'GSM' | 'UCS2' = 'GSM') {
  const trimmed = value.trim()
  if (!isHex(trimmed)) return trimmed
  const bytes = Buffer.from(trimmed, 'hex')
  if (!bytes.length) return ''

  const hasAlternatingNulls = bytes.length % 2 === 0 && bytes.filter((byte, index) => index % 2 === 0 && byte === 0).length >= bytes.length / 6
  const ascii = bytes.every(byte => byte === 9 || byte === 10 || byte === 13 || (byte >= 0x20 && byte <= 0x7e))
  if (ascii && (!hasAlternatingNulls || /[A-Za-z]{3,}|\s/.test(bytes.toString('ascii')))) return bytes.toString('utf8').trim()
  if (charset === 'UCS2' && bytes.length % 2 === 0) return decodeUtf16Be(bytes).trim()
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim() } catch {
    return bytes.length % 2 === 0 ? decodeUtf16Be(bytes).trim() : bytes.toString('latin1').trim()
  }
}

function normalizeTimestamp(value?: string) {
  if (!value) return new Date().toISOString()
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{2}),(\d{2}):(\d{2}):(\d{2})([+-])(\d{2})/)
  if (!match) return new Date().toISOString()
  const offsetMinutes = Number(match[8]) * 15 * (match[7] === '+' ? 1 : -1)
  const utc = Date.UTC(2000 + Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])) - offsetMinutes * 60_000
  return new Date(utc).toISOString()
}

function isHex(value: string) {
  return value.length >= 2 && value.length % 2 === 0 && /^[0-9A-F]+$/i.test(value)
}

function decodeUtf16Be(bytes: Buffer) {
  const swapped = Buffer.allocUnsafe(bytes.length)
  for (let index = 0; index < bytes.length; index += 2) {
    swapped[index] = bytes[index + 1]
    swapped[index + 1] = bytes[index]
  }
  return swapped.toString('utf16le')
}

function parseCsv(value: string) {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '"') {
      if (quoted && value[index + 1] === '"') { field += '"'; index += 1 } else quoted = !quoted
    } else if (character === ',' && !quoted) {
      fields.push(field.trim())
      field = ''
    } else field += character
  }
  fields.push(field.trim())
  return fields
}

function mergeMultipartMessages(messages: ParsedMessage[]) {
  const merged: ParsedMessage[] = []
  for (const message of messages) {
    const previous = merged.at(-1)
    const sameConversation = previous && previous.direction === message.direction && previous.sender === message.sender && previous.recipient === message.recipient && previous.timestamp === message.timestamp
    const consecutive = previous && (previous.modemIndexes?.at(-1) ?? previous.modemIndex ?? -2) + 1 === message.modemIndex
    const likelyMultipart = previous && (previous.rawBytes >= 140 || message.rawBytes >= 140 || previous.body.length >= 140)
    if (sameConversation && consecutive && likelyMultipart) {
      previous.body += message.body
      previous.rawBytes += message.rawBytes
      previous.modemIndexes = [...(previous.modemIndexes ?? [previous.modemIndex!]), ...(message.modemIndexes ?? [message.modemIndex!])]
      previous.unread ||= message.unread
    } else merged.push(message)
  }
  return merged
}
