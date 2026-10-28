import type { SmsMessage } from '../shared/types.js'

type ParsedMessage = SmsMessage & { rawBytes: number; concatRef?: number; partNumber?: number; totalParts?: number }

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
    const body = decodeModemText(rawBody, charset, true)
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

export function parsePduModeSMS(response: string, deviceId: string) {
  const lines = response.replace(/\r/g, '').split('\n')
  const messages: ParsedMessage[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trimStart().startsWith('+CMGL:')) continue
    const fields = parseCsv(lines[index].replace(/^\s*\+CMGL:\s*/, ''))
    const modemIndex = Number(fields[0])
    let pdu = ''
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor].trim()
      if (candidate.startsWith('+CMGL:') || /^(?:OK|ERROR)$/.test(candidate)) break
      if (isHex(candidate)) { pdu = candidate; break }
    }
    if (!Number.isInteger(modemIndex) || !pdu) continue
    const decoded = decodeDeliverPdu(pdu)
    if (!decoded) continue
    const storageStatus = fields[1].replace(/"/g, '').toUpperCase()
    const unread = storageStatus === '0' || storageStatus.includes('UNREAD')
    messages.push({
      id: crypto.randomUUID(), deviceId, sender: decoded.sender, recipient: '', body: decoded.body,
      direction: 'inbound', status: 'received', timestamp: decoded.timestamp, unread, modemIndex,
      modemIndexes: [modemIndex], rawBytes: decoded.rawBytes, concatRef: decoded.concatRef,
      partNumber: decoded.partNumber, totalParts: decoded.totalParts
    })
  }
  return mergePduMessages(messages).map(({ rawBytes: _rawBytes, concatRef: _concatRef, partNumber: _partNumber, totalParts: _totalParts, ...message }) => message)
}

export function decodeModemText(value: string, charset: 'GSM' | 'UCS2' = 'GSM', preserveWhitespace = false) {
  const trimmed = value.trim()
  const finish = (decoded: string) => preserveWhitespace ? decoded : decoded.trim()
  if (!isHex(trimmed)) return finish(value)
  const bytes = Buffer.from(trimmed, 'hex')
  if (!bytes.length) return ''

  const hasAlternatingNulls = bytes.length % 2 === 0 && bytes.filter((byte, index) => index % 2 === 0 && byte === 0).length >= bytes.length / 6
  const ascii = bytes.every(byte => byte === 9 || byte === 10 || byte === 13 || (byte >= 0x20 && byte <= 0x7e))
  if (ascii && (!hasAlternatingNulls || /[A-Za-z]{3,}|\s/.test(bytes.toString('ascii')))) return finish(bytes.toString('utf8'))
  if (charset === 'UCS2' && bytes.length % 2 === 0) return finish(decodeUtf16Be(bytes))
  try { return finish(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch {
    return finish(bytes.length % 2 === 0 ? decodeUtf16Be(bytes) : bytes.toString('latin1'))
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

function decodeDeliverPdu(value: string) {
  const bytes = Buffer.from(value, 'hex')
  let offset = 0
  if (!bytes.length) return undefined
  const serviceCenterLength = bytes[offset++]
  offset += serviceCenterLength
  if (offset + 12 >= bytes.length) return undefined
  const firstOctet = bytes[offset++]
  if ((firstOctet & 0x03) !== 0) return undefined
  const addressLength = bytes[offset++]
  const typeOfAddress = bytes[offset++]
  const addressByteLength = Math.ceil(addressLength / 2)
  const addressBytes = bytes.subarray(offset, offset + addressByteLength)
  offset += addressByteLength
  const sender = decodePduAddress(addressBytes, addressLength, typeOfAddress)
  offset += 1
  const dataCodingScheme = bytes[offset++]
  const timestamp = decodeServiceCenterTimestamp(bytes.subarray(offset, offset + 7))
  offset += 7
  const userDataLength = bytes[offset++]
  const alphabet = dataCodingScheme & 0x0c
  const encodedLength = alphabet === 0 ? Math.ceil(userDataLength * 7 / 8) : userDataLength
  const userData = bytes.subarray(offset, Math.min(bytes.length, offset + encodedLength))
  const header = (firstOctet & 0x40) !== 0 ? parseUserDataHeader(userData) : undefined
  const headerOctets = header?.octets ?? 0
  let body = ''
  if (alphabet === 0x08) {
    body = decodeUtf16Be(userData.subarray(headerOctets))
  } else if (alphabet === 0x04) {
    body = userData.subarray(headerOctets).toString('latin1')
  } else {
    const headerSeptets = Math.ceil(headerOctets * 8 / 7)
    body = decodeGsm7(userData, Math.max(0, userDataLength - headerSeptets), headerSeptets * 7)
  }
  return { sender, body, timestamp, rawBytes: userData.length, ...header?.concat }
}

function decodePduAddress(bytes: Buffer, length: number, typeOfAddress: number) {
  const typeOfNumber = typeOfAddress & 0x70
  if (typeOfNumber === 0x50) return decodeGsm7(bytes, Math.floor(length * 4 / 7))
  let digits = ''
  for (const byte of bytes) digits += `${byte & 0x0f}${byte >> 4}`
  digits = digits.slice(0, length).replace(/F/gi, '')
  return typeOfNumber === 0x10 ? `+${digits}` : digits
}

function decodeServiceCenterTimestamp(bytes: Buffer) {
  if (bytes.length < 7) return new Date().toISOString()
  const bcd = (byte: number) => (byte & 0x0f) * 10 + (byte >> 4)
  const year = 2000 + bcd(bytes[0])
  const month = bcd(bytes[1]) - 1
  const day = bcd(bytes[2])
  const hour = bcd(bytes[3])
  const minute = bcd(bytes[4])
  const second = bcd(bytes[5])
  const negative = (bytes[6] & 0x08) !== 0
  const quarterHours = (bytes[6] & 0x07) * 10 + (bytes[6] >> 4)
  const offsetMinutes = quarterHours * 15 * (negative ? -1 : 1)
  return new Date(Date.UTC(year, month, day, hour, minute, second) - offsetMinutes * 60_000).toISOString()
}

function parseUserDataHeader(bytes: Buffer) {
  if (!bytes.length) return undefined
  const octets = Math.min(bytes.length, bytes[0] + 1)
  let cursor = 1
  let concat: { concatRef: number; totalParts: number; partNumber: number } | undefined
  while (cursor + 1 < octets) {
    const identifier = bytes[cursor++]
    const length = bytes[cursor++]
    if (cursor + length > octets) break
    if (identifier === 0x00 && length === 3) concat = { concatRef: bytes[cursor], totalParts: bytes[cursor + 1], partNumber: bytes[cursor + 2] }
    if (identifier === 0x08 && length === 4) concat = { concatRef: bytes.readUInt16BE(cursor), totalParts: bytes[cursor + 2], partNumber: bytes[cursor + 3] }
    cursor += length
  }
  return { octets, concat }
}

const GSM7_BASIC = [
  '@','£','$','¥','è','é','ù','ì','ò','Ç','\n','Ø','ø','\r','Å','å','Δ','_','Φ','Γ','Λ','Ω','Π','Ψ','Σ','Θ','Ξ','\u001b','Æ','æ','ß','É',
  ' ','!','"','#','¤','%','&',"'",'(',')','*','+',',','-','.','/','0','1','2','3','4','5','6','7','8','9',':',';','<','=','>','?','¡',
  'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Ä','Ö','Ñ','Ü','§','¿',
  'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','ä','ö','ñ','ü','à'
]
const GSM7_EXTENSION = new Map([[0x0a, '\f'], [0x14, '^'], [0x28, '{'], [0x29, '}'], [0x2f, '\\'], [0x3c, '['], [0x3d, '~'], [0x3e, ']'], [0x40, '|'], [0x65, '€']])

function decodeGsm7(bytes: Buffer, count: number, startBit = 0) {
  const septets: number[] = []
  for (let index = 0; index < count; index += 1) {
    const bit = startBit + index * 7
    const byteIndex = Math.floor(bit / 8)
    const shift = bit % 8
    if (byteIndex >= bytes.length) break
    let value = (bytes[byteIndex] >> shift) & 0x7f
    if (shift > 1 && byteIndex + 1 < bytes.length) value |= (bytes[byteIndex + 1] << (8 - shift)) & 0x7f
    septets.push(value)
  }
  let result = ''
  for (let index = 0; index < septets.length; index += 1) {
    if (septets[index] === 0x1b) result += GSM7_EXTENSION.get(septets[++index]) ?? ''
    else result += GSM7_BASIC[septets[index]] ?? '�'
  }
  return result
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

function mergePduMessages(messages: ParsedMessage[]) {
  const merged: ParsedMessage[] = []
  const groups = new Map<string, ParsedMessage[]>()
  for (const message of messages) {
    if (message.concatRef === undefined || !message.totalParts || !message.partNumber) {
      merged.push(message)
      continue
    }
    const key = `${message.direction}|${message.sender}|${message.recipient}|${message.concatRef}|${message.totalParts}|${message.timestamp}`
    const group = groups.get(key)
    if (group) group.push(message)
    else {
      groups.set(key, [message])
      merged.push(message)
    }
  }
  for (const group of groups.values()) {
    const first = group[0]
    const ordered = [...group].sort((left, right) => (left.partNumber ?? 0) - (right.partNumber ?? 0))
    first.body = ordered.map(message => message.body).join('')
    first.rawBytes = ordered.reduce((total, message) => total + message.rawBytes, 0)
    first.modemIndexes = ordered.flatMap(message => message.modemIndexes ?? [])
    first.unread = ordered.some(message => message.unread)
  }
  return merged
}
