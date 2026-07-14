import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  startRecording: (sourceId: string) => ipcRenderer.invoke('start-recording', sourceId),
  stopRecording: (chunks: ArrayBuffer) => ipcRenderer.invoke('stop-recording', new Uint8Array(chunks)),
  loadEvents: (filePath: string) => ipcRenderer.invoke('load-events', filePath),
  exportVideo: (opts: any) => ipcRenderer.invoke('export-video', opts),
  onExportProgress: (cb: (pct: number) => void) => {
    const handler = (_: any, pct: number) => cb(pct);
    ipcRenderer.on('export-progress', handler);
    return () => ipcRenderer.removeListener('export-progress', handler);
  },
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scanAudioFiles: (dirPath: string) => ipcRenderer.invoke('scan-audio-files', dirPath),
});
