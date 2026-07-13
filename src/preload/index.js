import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },

  // File dialog
  openFile: () => ipcRenderer.invoke('dialog:openFile'),

  // Profile management
  profiles: {
    getAll: () => ipcRenderer.invoke('profiles:getAll'),
    save: (profile) => ipcRenderer.invoke('profiles:save', JSON.parse(JSON.stringify(profile))),
    delete: (id) => ipcRenderer.invoke('profiles:delete', id)
  },

  // Connection testing
  connection: {
    testSsh: (config) => ipcRenderer.invoke('connection:testSsh', JSON.parse(JSON.stringify(config))),
    testFull: (profile) => ipcRenderer.invoke('connection:testFull', JSON.parse(JSON.stringify(profile))),
    listTables: (profile) => ipcRenderer.invoke('connection:listTables', JSON.parse(JSON.stringify(profile)))
  },

  // Sync Engine
  sync: {
    start: (profile, tables) => ipcRenderer.invoke('sync:start', { 
      profile: JSON.parse(JSON.stringify(profile)), 
      tables: JSON.parse(JSON.stringify(tables))
    }),
    abort: (syncId) => ipcRenderer.invoke('sync:abort', syncId),
    getHistory: () => ipcRenderer.invoke('sync:getHistory'),
    onProgress: (syncId, callback) => {
      const channel = `sync:progress:${syncId}`
      const handler = (_, stats) => callback(stats)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    onLog: (syncId, callback) => {
      const channel = `sync:log:${syncId}`
      const handler = (_, logEvent) => callback(logEvent)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
