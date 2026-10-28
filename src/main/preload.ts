import { contextBridge, ipcRenderer } from 'electron'
import type { VoLinkAPI } from '../shared/types.js'

const api: VoLinkAPI = {
  getSnapshot: () => ipcRenderer.invoke('app:snapshot'),
  rescanDevices: () => ipcRenderer.invoke('device:rescan'),
  addDevice: (portPath, name) => ipcRenderer.invoke('device:add', portPath, name),
  updateDevice: (id, patch) => ipcRenderer.invoke('device:update', id, patch),
  removeDevice: id => ipcRenderer.invoke('device:remove', id),
  executeAT: (id, command, timeoutMs) => ipcRenderer.invoke('device:at', id, command, timeoutMs),
  executeUSSD: (id, command) => ipcRenderer.invoke('device:ussd', id, command),
  cancelUSSD: id => ipcRenderer.invoke('device:ussd-cancel', id),
  rebootDevice: id => ipcRenderer.invoke('device:reboot', id),
  setFlightMode: (id, enabled) => ipcRenderer.invoke('device:flight-mode', id, enabled),
  setDataEnabled: (id, enabled) => ipcRenderer.invoke('device:data-enabled', id, enabled),
  scanOperators: id => ipcRenderer.invoke('device:operators-scan', id),
  selectOperator: (id, plmn) => ipcRenderer.invoke('device:operator-select', id, plmn),
  diagnoseDevice: id => ipcRenderer.invoke('device:diagnose', id),
  listPorts: () => ipcRenderer.invoke('device:list-ports'),
  sendSMS: (deviceId, recipient, body) => ipcRenderer.invoke('sms:send', deviceId, recipient, body),
  refreshSMS: deviceId => ipcRenderer.invoke('sms:refresh', deviceId),
  deleteSMS: id => ipcRenderer.invoke('sms:delete', id),
  dial: (deviceId, number) => ipcRenderer.invoke('call:dial', deviceId, number),
  hangup: () => ipcRenderer.invoke('call:hangup'),
  callStatus: () => ipcRenderer.invoke('call:status'),
  saveProxy: input => ipcRenderer.invoke('proxy:save', input),
  deleteProxy: id => ipcRenderer.invoke('proxy:delete', id),
  startProxy: id => ipcRenderer.invoke('proxy:start', id),
  stopProxy: id => ipcRenderer.invoke('proxy:stop', id),
  importEsim: input => ipcRenderer.invoke('esim:import', input),
  renameEsim: (id, name) => ipcRenderer.invoke('esim:rename', id, name),
  enableEsim: id => ipcRenderer.invoke('esim:enable', id),
  disableEsim: id => ipcRenderer.invoke('esim:disable', id),
  deleteEsim: id => ipcRenderer.invoke('esim:delete', id),
  updateSettings: settings => ipcRenderer.invoke('settings:update', settings),
  testNotification: () => ipcRenderer.invoke('settings:test-notification'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-update'),
  openExternal: url => ipcRenderer.invoke('app:open-external', url)
}

contextBridge.exposeInMainWorld('voLink', api)
