const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('platform', {
  isMac: process.platform === 'darwin'
})
