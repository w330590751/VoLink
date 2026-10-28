import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, Antenna, BatteryCharging, CheckCircle2, ChevronDown, CircleGauge, Download, Gauge, HardDrive,
  Mail, MessageSquareText, Phone, Plane, Power, Radio, RefreshCw, Save, Send, Settings2,
  Signal, Stethoscope, CreditCard, Smartphone, Terminal, Trash2, Wifi
} from 'lucide-react'
import type { DeviceDiagnostics, DevicePatch, DeviceRecord, EsimProfileInput } from '../shared/types'
import type { DeviceTab, MainPage, PageProps } from './app-types'
import { Empty, Field, Panel, SectionTitle, Status, Toggle, formatDate } from './components'

const tabs: Array<{ id: DeviceTab; label: string }> = [
  { id: 'overview', label: '概览' }, { id: 'esim', label: 'eSIM' }, { id: 'at', label: 'AT 终端' },
  { id: 'ussd', label: 'USSD 终端' }, { id: 'policy', label: '卡策略' }, { id: 'dial', label: '拨号' }, { id: 'config', label: '配置' }
]

type Props = PageProps & {
  selectedId: string
  setSelectedId: (id: string) => void
  tab: DeviceTab
  setTab: (tab: DeviceTab) => void
  navigate: (page: MainPage) => void
}

export function DevicePage({ snapshot, selectedId, setSelectedId, tab, setTab, navigate, busy, action, refresh }: Props) {
  const device = snapshot.devices.find(item => item.id === selectedId) ?? snapshot.devices[0]
  useEffect(() => { if (device && device.id !== selectedId) setSelectedId(device.id) }, [device?.id, selectedId, setSelectedId])

  if (!device) return <Panel><Empty title="暂无设备" subtitle="插入蜂窝模块后点击重新扫描" /><button className="primary" onClick={() => void action(() => window.voLink!.rescanDevices(), '扫描完成')}>重新扫描</button></Panel>

  return <div className="device-workspace">
    {snapshot.devices.length > 1 ? <div className="device-picker"><span>当前设备</span><select value={device.id} onChange={event => setSelectedId(event.target.value)}>{snapshot.devices.map(item => <option key={item.id} value={item.id}>{item.name} · {item.displayPort}</option>)}</select><ChevronDown size={16} /></div> : null}
    <Panel className="device-hero">
      <div className="device-identity"><span className="device-logo">V</span><div><h1>{device.name}</h1><p>{device.networkInterface || device.displayPort} · 公网 IP: {device.publicIp || '---'}</p><small className="subscriber-number"><Phone size={13} />{device.phoneNumberOverride || device.status.phoneNumber || 'SIM 未写入本机号码'}</small></div></div>
      <div className="hero-actions">
        <button disabled={busy || !device.capabilities.vowifi} title={device.capabilities.vowifi ? '' : '当前 Windows 模组未提供 VoWiFi 后端'} onClick={() => void action(async () => { throw new Error('当前设备未配置 VoWiFi/IMS 后端') })}><RefreshCw size={18} />重连 VoWiFi</button>
        <button disabled={busy} onClick={() => void action(() => window.voLink!.rebootDevice(device.id), '重启指令已发送')}><Power size={18} />重启模组</button>
        <button onClick={() => navigate('sms')}><Mail size={18} />短信</button>
      </div>
    </Panel>
    <Panel className="device-detail">
      <div className="tabbar">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
      {tab === 'overview' ? <Overview device={device} refresh={refresh} busy={busy} action={action} /> : null}
      {tab === 'esim' ? <EsimTab device={device} snapshot={snapshot} busy={busy} action={action} /> : null}
      {tab === 'at' ? <AtTab device={device} busy={busy} action={action} /> : null}
      {tab === 'ussd' ? <UssdTab device={device} busy={busy} action={action} /> : null}
      {tab === 'policy' ? <PolicyTab device={device} busy={busy} action={action} /> : null}
      {tab === 'dial' ? <DialTab device={device} calls={snapshot.calls.filter(call => call.deviceId === device.id)} busy={busy} action={action} /> : null}
      {tab === 'config' ? <ConfigTab device={device} ports={snapshot.availablePorts} busy={busy} action={action} /> : null}
    </Panel>
  </div>
}

function Overview({ device, refresh, busy, action }: { device: DeviceRecord; refresh: () => Promise<void>; busy: boolean; action: PageProps['action'] }) {
  const status = device.status
  const phoneNumber = device.phoneNumberOverride || status.phoneNumber
  const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics>()
  const diagnose = async () => {
    if (!window.voLink) { setDiagnostics(demoDiagnostics(device)); return }
    setDiagnostics(await action(() => window.voLink!.diagnoseDevice(device.id), '设备诊断完成'))
  }
  const needsAttention = status.simState === 'READY' && (!status.registration.startsWith('已注册') || status.signal === 0)
  return <div className="tab-content">
    <SectionTitle icon={<Activity />} title="设备概览" subtitle="蜂窝网络、SIM 与模组实时状态" actions={<><button className="ghost" disabled={busy} onClick={() => void diagnose()}><Stethoscope size={16} />运行诊断</button><button className="ghost" onClick={() => void refresh()}><RefreshCw size={16} />刷新状态</button></>} />
    {device.state === 'error' ? <div className="health-banner error"><AlertTriangle /><div><strong>模组通信异常</strong><p>{device.lastError || 'AT 端口无法通信，请检查驱动和串口占用。'}</p></div></div> : device.state !== 'online' ? <div className="health-banner warning"><AlertTriangle /><div><strong>当前未检测到物理模组</strong><p>下面显示的是最后一次成功读取的状态。请检查 USB 连接与驱动，然后点击“刷新状态”或等待自动扫描。</p></div></div> : needsAttention ? <div className="health-banner warning"><AlertTriangle /><div><strong>SIM 已识别，但蜂窝网络尚未就绪</strong><p>建议运行诊断，检查天线、飞行模式、APN、频段和运营商注册状态。</p></div></div> : null}
    <div className="overview-grid">
      <Metric icon={<Signal />} label="信号强度" value={`${status.signal}%`} note={status.rsrp !== undefined ? `RSRP ${status.rsrp} dBm` : `${status.dbm} dBm`} />
      <Metric icon={<Antenna />} label="网络制式" value={status.network} note={[status.band, status.channel ? `信道 ${status.channel}` : ''].filter(Boolean).join(' · ')} />
      <Metric icon={<Radio />} label="运营商" value={status.operator} note={status.registration} />
      <Metric icon={<CreditCard />} label="SIM 状态" value={status.simState} note={status.iccid || '未读取 ICCID'} />
    </div>
    <div className="radio-quality-grid"><RadioValue label="RSRP" value={status.rsrp} unit="dBm" good={-90} weak={-110} /><RadioValue label="RSRQ" value={status.rsrq} unit="dB" good={-10} weak={-16} /><RadioValue label="SINR" value={status.sinr} unit="dB" good={20} weak={0} /><RadioValue label="网络附着" text={status.packetService || '未报告'} /></div>
    <div className="detail-columns">
      <div className="info-block"><h3>设备信息</h3><Info label="本机号码" value={phoneNumber || 'SIM 未写入，可在“配置”中填写'} /><Info label="型号" value={device.model} /><Info label="制造商" value={device.manufacturer} /><Info label="IMEI" value={status.imei || '---'} /><Info label="固件" value={status.firmware || '---'} /></div>
      <div className="info-block"><h3>网络信息</h3><Info label="接口" value={device.networkInterface || 'Windows WWAN'} /><Info label="移动数据" value={device.networkEnabled ? '已连接' : '已断开（保留蜂窝信号）'} /><Info label="AT 端口" value={device.serialPath || '自动检测'} /><Info label="后端" value={device.backend || 'AT'} /><Info label="更新时间" value={formatDate(status.updatedAt)} /></div>
    </div>
    {diagnostics ? <DiagnosticReport report={diagnostics} /> : null}
  </div>
}

function RadioValue({ label, value, text, unit, good = 0, weak = 0 }: { label: string; value?: number; text?: string; unit?: string; good?: number; weak?: number }) {
  const state = value === undefined ? 'unknown' : value >= good ? 'good' : value >= weak ? 'warning' : 'poor'
  return <div className={`radio-value ${state}`}><small>{label}</small><strong>{text || (value === undefined ? '—' : `${value} ${unit}`)}</strong></div>
}

function DiagnosticReport({ report }: { report: DeviceDiagnostics }) {
  return <div className="diagnostic-report"><div className="diagnostic-heading"><div><h3>设备诊断报告</h3><p>{formatDate(report.generatedAt)} · {report.summary === 'healthy' ? '状态良好' : report.summary === 'offline' ? '设备离线' : '需要关注'}</p></div><Status state={report.summary === 'healthy' ? 'online' : report.summary === 'offline' ? 'error' : 'warning'}>{report.summary === 'healthy' ? '通过' : '需处理'}</Status></div><div className="diagnostic-checks">{report.checks.map(check => <article key={check.id} className={check.state}><span>{check.state === 'pass' ? <CheckCircle2 /> : <AlertTriangle />}</span><div><strong>{check.label}</strong><p>{check.value}</p>{check.suggestion ? <small>{check.suggestion}</small> : null}</div></article>)}</div></div>
}

function demoDiagnostics(device: DeviceRecord): DeviceDiagnostics {
  return { deviceId: device.id, generatedAt: new Date().toISOString(), summary: 'healthy', raw: {}, checks: [
    { id: 'port', label: 'AT 控制端口', state: 'pass', value: `${device.displayPort} 可通信` },
    { id: 'sim', label: 'SIM 状态', state: 'pass', value: device.status.simState },
    { id: 'identity', label: 'SIM 标识读取', state: 'pass', value: 'ICCID 与 IMSI 已读取' },
    { id: 'signal', label: '射频信号', state: 'pass', value: `${device.status.signal}% · ${device.status.dbm} dBm` },
    { id: 'registration', label: '网络注册', state: 'pass', value: `${device.status.registration} · ${device.status.operator}` },
    { id: 'packet', label: '分组数据', state: 'pass', value: 'Attached' }
  ] }
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <article className="metric-card"><span>{icon}</span><div><small>{label}</small><strong>{value || '---'}</strong><p>{note || '---'}</p></div></article>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="info-row"><span>{label}</span><strong>{value}</strong></div> }

function EsimTab({ device, snapshot, busy, action }: { device: DeviceRecord; snapshot: PageProps['snapshot']; busy: boolean; action: PageProps['action'] }) {
  const profiles = snapshot.esimProfiles.filter(item => item.deviceId === device.id)
  const [server, setServer] = useState('')
  const [matchingId, setMatchingId] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [name, setName] = useState('')
  const download = () => {
    const input: EsimProfileInput = { deviceId: device.id, name: name || '新 eSIM Profile', provider: server, activationCode: `LPA:1$${server}$${matchingId}${confirmation ? `$${confirmation}` : ''}` }
    return action(() => window.voLink!.importEsim(input), 'Profile 下载任务已完成')
  }
  return <div className="tab-content">
    <div className="euicc-banner"><span>ESIM</span><div><h2>eUICC</h2><p>通过 lpac / AT+CSIM 管理 Profile</p></div><div className="banner-tools"><RefreshCw /><MessageSquareText /><CircleGauge /></div></div>
    <Panel className="profiles-panel"><SectionTitle title={`eUICC #1`} subtitle={device.status.iccid ? `当前卡 ${device.status.iccid}` : '等待读取 eUICC 信息'} actions={<Status state={profiles.some(item => item.status === 'enabled') ? 'online' : 'offline'}>{profiles.length} 个 Profile</Status>} />
      {profiles.length ? <div className="profile-table">{profiles.map(profile => <div className="profile-item" key={profile.id}><span className={`profile-dot ${profile.status}`} /><div><strong>{profile.name}</strong><p>{profile.provider}　{profile.iccid}</p></div><span className={`tag ${profile.status}`}>{profile.status === 'enabled' ? '已启用' : '已禁用'}</span><div className="row-buttons">{profile.status === 'enabled' ? <button onClick={() => void action(() => window.voLink!.disableEsim(profile.id), 'Profile 已停用')}>停用</button> : <button className="green" onClick={() => void action(() => window.voLink!.enableEsim(profile.id), 'Profile 已启用')}>切换</button>}<button onClick={() => { const next = window.prompt('新的 Profile 名称', profile.name); if (next) void action(() => window.voLink!.renameEsim(profile.id, next), '已改名') }}>改名</button><button className="red" disabled={profile.status === 'enabled'} onClick={() => void action(() => window.voLink!.deleteEsim(profile.id), 'Profile 已删除')}><Trash2 size={14} />删除</button></div></div>)}</div> : <Empty title="暂无 eSIM Profile" subtitle="使用下方表单下载第一个 Profile" />}
    </Panel>
    <Panel className="download-panel"><SectionTitle icon={<Download />} title="下载新 Profile" />
      <div className="form-grid"><Field label="SM-DP+ 地址 *"><input value={server} onChange={e => setServer(e.target.value)} placeholder="例如 rsp.truphone.com" /></Field><Field label="MATCHING ID"><input value={matchingId} onChange={e => setMatchingId(e.target.value)} placeholder="可选" /></Field><Field label="确认码"><input value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="可选" /></Field><Field label="显示名称"><input value={name} onChange={e => setName(e.target.value)} placeholder="旅行流量卡" /></Field><Field label="目标 EUICC"><select><option>eUICC #1 — {device.displayPort}</option></select></Field></div>
      <div className="panel-footer"><button className="primary" disabled={busy || !server || !window.voLink} onClick={() => void download()}><Download size={16} />开始下载</button></div>
    </Panel>
  </div>
}

function AtTab({ device, busy, action }: { device: DeviceRecord; busy: boolean; action: PageProps['action'] }) {
  const [command, setCommand] = useState('AT+CSQ')
  const [history, setHistory] = useState('VoLink AT Terminal\n')
  const run = async () => { const result = await action(() => window.voLink!.executeAT(device.id, command)); setHistory(value => `${value}\n> ${result.command}\n${result.response}\n`) }
  return <div className="tab-content"><SectionTitle icon={<Terminal />} title="AT 终端" subtitle={`通过 ${device.serialPath || '自动端口'} 直接发送 AT 指令`} />
    <div className="terminal-shell"><div className="terminal-toolbar"><span /><span /><span /><strong>{device.name}</strong></div><pre>{history}</pre><div className="terminal-input"><span>&gt;</span><input value={command} onChange={e => setCommand(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void run() }} /><button disabled={busy} onClick={() => void run()}><Send size={16} />发送</button></div></div>
  </div>
}

function UssdTab({ device, busy, action }: { device: DeviceRecord; busy: boolean; action: PageProps['action'] }) {
  const [code, setCode] = useState('*100#')
  const [response, setResponse] = useState('')
  const run = async () => { const result = await action(() => window.voLink!.executeUSSD(device.id, code)); setResponse(result.response) }
  return <div className="tab-content narrow-content"><SectionTitle icon={<MessageSquareText />} title="USSD 终端" subtitle="查询余额、套餐或运营商服务" /><Field label="USSD 指令"><div className="inline-control"><input value={code} onChange={e => setCode(e.target.value)} /><button className="primary" disabled={busy} onClick={() => void run()}><Send size={16} />发送</button></div></Field><div className="response-box">{response || '发送指令后，运营商响应会显示在这里。'}</div></div>
}

function PolicyTab({ device, busy, action }: { device: DeviceRecord; busy: boolean; action: PageProps['action'] }) {
  const [ipVersion, setIpVersion] = useState(device.ipVersion || 'IPv4')
  const [apn, setApn] = useState(device.apn || '')
  const applyPatch = (patch: DevicePatch, success: string) => action(() => window.voLink!.updateDevice(device.id, patch), success)
  return <div className="tab-content"><SectionTitle icon={<CreditCard />} title="卡策略" subtitle="网络/VoWiFi 开关跟着 SIM 卡走，切换即时生效" />
    <div className="current-sim"><div><small>当前卡 ICCID</small><strong>{device.cardIccid || device.status.iccid || '尚未读取'}</strong></div><button onClick={() => { const next = window.prompt('设置用于卡策略的 ICCID', device.cardIccid || device.status.iccid); if (next?.trim()) void applyPatch({ cardIccid: next.trim() }, '卡策略 ICCID 已保存') }}>手动设置</button></div>
    <div className="form-grid policy-form"><Field label="IP 版本" hint="下次开启网络时生效"><select value={ipVersion} onChange={e => { const value = e.target.value as DeviceRecord['ipVersion']; setIpVersion(value!); void applyPatch({ ipVersion: value }, 'IP 版本已保存') }}><option>IPv4</option><option>IPv6</option><option>IPv4/IPv6</option></select></Field><Field label="APN（可选）" hint="下次开启网络时生效"><input value={apn} onChange={e => setApn(e.target.value)} onBlur={() => void applyPatch({ apn }, 'APN 已保存')} placeholder="留空自动识别" /></Field></div>
    <div className="policy-grid"><PolicySwitch icon={<Wifi />} title="移动数据" note="只连接/断开 Windows 流量；信号和注册保持" checked={device.networkEnabled ?? false} disabled={busy || Boolean(device.airplaneEnabled)} onChange={enabled => void action(() => window.voLink!.setDataEnabled(device.id, enabled), enabled ? '移动数据已连接' : '移动数据已断开，蜂窝信号保持')} /><PolicySwitch icon={<Phone />} title="VoWiFi" note={device.capabilities.vowifi ? '启用后进入飞行模式' : '当前 Windows 模组未配置 IMS 后端'} checked={device.vowifiEnabled ?? false} disabled={busy || !device.capabilities.vowifi} onChange={enabled => void applyPatch({ vowifiEnabled: enabled }, enabled ? 'VoWiFi 已启用' : 'VoWiFi 已停用')} /><PolicySwitch icon={<Plane />} title="飞行模式" note="关闭全部蜂窝射频；与移动数据开关相互独立" checked={device.airplaneEnabled ?? false} disabled={busy} onChange={enabled => void action(() => window.voLink!.setFlightMode(device.id, enabled), enabled ? '飞行模式已开启' : '飞行模式已关闭')} /></div>
  </div>
}

function PolicySwitch({ icon, title, note, checked, disabled, onChange }: { icon: React.ReactNode; title: string; note: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <div className="policy-switch"><span>{icon}</span><div><strong>{title}</strong><p>{note}</p></div><Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} /></div>
}

function DialTab({ device, calls, busy, action }: { device: DeviceRecord; calls: PageProps['snapshot']['calls']; busy: boolean; action: PageProps['action'] }) {
  const [number, setNumber] = useState('')
  const [calling, setCalling] = useState(false)
  const keys = useMemo(() => ['1','2','3','4','5','6','7','8','9','*','0','#'], [])
  const dial = async () => { await action(() => window.voLink!.dial(device.id, number), '拨号指令已发送'); setCalling(true) }
  const hangup = async () => { await action(() => window.voLink!.hangup(), '通话已结束'); setCalling(false) }
  return <div className="tab-content"><SectionTitle icon={<Phone />} title="直接拨号" subtitle="新增功能：通过当前模组发起语音呼叫" actions={<Status state={calling ? 'online' : 'offline'}>{calling ? '通话中' : '空闲'}</Status>} />
    <div className="dial-layout"><div className="dial-card"><input className="phone-number" value={number} onChange={e => setNumber(e.target.value)} placeholder="输入电话号码" /><div className="number-pad">{keys.map(key => <button key={key} onClick={() => setNumber(value => value + key)}>{key}</button>)}</div><div className="dial-actions">{calling ? <button className="hangup" onClick={() => void hangup()}><Phone size={20} />挂断</button> : <button className="call" disabled={busy || !number} onClick={() => void dial()}><Phone size={20} />拨打</button>}</div><p>需模组支持语音固件；电脑通话音频还需 USB Audio 或厂商音频线路。</p></div><div className="call-history"><h3>通话记录</h3>{calls.length ? calls.map(call => <div className="call-row" key={call.id}><span><Phone size={15} /></span><div><strong>{call.number}</strong><p>{formatDate(call.startedAt)}</p></div><small>{call.duration}</small><em>{call.status}</em></div>) : <Empty title="暂无通话记录" />}</div></div>
  </div>
}

function ConfigTab({ device, ports, busy, action }: { device: DeviceRecord; ports: PageProps['snapshot']['availablePorts']; busy: boolean; action: PageProps['action'] }) {
  const [form, setForm] = useState<DevicePatch>({ name: device.name, serialPath: device.serialPath, networkInterface: device.networkInterface || '', backend: device.backend || 'AT', autoConnect: device.autoConnect, phoneNumberOverride: device.phoneNumberOverride || '' })
  const remove = () => { if (window.confirm(`确定删除设备“${device.name}”吗？真实硬件可通过重新扫描再次添加。`)) void action(() => window.voLink!.removeDevice(device.id), '设备已删除') }
  return <div className="tab-content"><SectionTitle icon={<Settings2 />} title="设备配置" subtitle="配置存储在本地数据库中，部分字段可能需要重启生效" actions={<><button className="danger" disabled={busy} onClick={remove}><Trash2 size={16} />删除设备</button><button className="primary" disabled={busy} onClick={() => void action(() => window.voLink!.updateDevice(device.id, form), '设备配置已保存')}><Save size={16} />保存配置</button></>} />
    <div className="form-grid config-grid"><Field label="ID"><input disabled value={device.id} /></Field><Field label="名称"><input value={form.name || ''} onChange={e => setForm({...form, name:e.target.value})} placeholder="显示名称" /></Field><Field label="本机号码" hint="优先自动读取；SIM 未写入号码时可手动填写"><input value={form.phoneNumberOverride || ''} onChange={e => setForm({...form, phoneNumberOverride:e.target.value.replace(/[^+\d]/g, '')})} placeholder={device.status.phoneNumber || '+8613800138000'} /></Field><Field label="IMEI 绑定"><input disabled value={device.status.imei || '未读取'} /></Field><Field label="设备路径"><input disabled value={device.displayPort} /></Field><Field label="网卡接口"><input value={form.networkInterface || ''} onChange={e => setForm({...form,networkInterface:e.target.value})} placeholder="Windows WWAN" /></Field><Field label="AT 端口"><select value={form.serialPath || ''} onChange={e => setForm({...form,serialPath:e.target.value})}><option value={device.serialPath}>{device.serialPath || '系统自动检测'}</option>{ports.filter(port => port.path !== device.serialPath).map(port => <option key={port.path} value={port.path}>{port.path} · {port.friendlyName}</option>)}</select></Field><Field label="控制设备"><input disabled value={device.model} /></Field><Field label="设备运行模式"><select value={form.backend} onChange={e => setForm({...form,backend:e.target.value as DevicePatch['backend']})}><option>AT</option><option>MBIM</option><option>QMI</option></select></Field></div>
  </div>
}
