import { contextBridge, ipcRenderer, webUtils } from 'electron';

function subscribe<T>(channel: string, cb: (payload: T) => void) {
  const handler = (_: any, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // recording
  getSources: (thumbnails?: boolean) => ipcRenderer.invoke('get-sources', { thumbnails }),
  startRecording: (sourceId: string) => ipcRenderer.invoke('start-recording', sourceId),
  stopRecording: (chunks: ArrayBuffer, micChunks?: ArrayBuffer, webcamChunks?: ArrayBuffer) =>
    ipcRenderer.invoke('stop-recording', new Uint8Array(chunks), micChunks ? new Uint8Array(micChunks) : undefined, webcamChunks ? new Uint8Array(webcamChunks) : undefined),
  loadEvents: (filePath: string) => ipcRenderer.invoke('load-events', filePath),

  // projects
  saveProject: (projectJson: string) => ipcRenderer.invoke('save-project', projectJson),
  openProject: () => ipcRenderer.invoke('open-project'),
  openProjectPath: (filePath: string) => ipcRenderer.invoke('open-project-path', filePath),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  autosaveProject: (projectJson: string) => ipcRenderer.invoke('autosave-project', projectJson),
  loadAutosave: () => ipcRenderer.invoke('load-autosave'),
  // resolve an imported File to its real path (project files need stable paths)
  filePathForFile: (file: File) => webUtils.getPathForFile(file),

  // captions
  transcribeAudio: (audioPath: string) => ipcRenderer.invoke('transcribe-audio', audioPath),

  // ai assistant
  aiChat: (payload: { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }) =>
    ipcRenderer.invoke('ai-chat', payload),

  // capture flow (main window)
  showSourceSelector: () => ipcRenderer.invoke('show-source-selector'),
  onSourceSelected: (cb: (sourceId: string) => void) => subscribe('source-selected', cb),
  beginCountdown: () => ipcRenderer.invoke('begin-countdown'),
  onHudControl: (cb: (action: 'stop' | 'pause' | 'resume') => void) => subscribe('hud-control', cb),
  onCursorTelemetry: (cb: (ev: any) => void) => subscribe('cursor-telemetry', cb),

  // overlay windows
  sourcePicked: (sourceId: string) => ipcRenderer.invoke('source-picked', sourceId),
  cancelSourceSelector: () => ipcRenderer.invoke('cancel-source-selector'),
  cancelCountdown: () => ipcRenderer.send('countdown-cancel'),
  onCountdownTick: (cb: (p: { remaining: number }) => void) => subscribe('countdown-tick', cb),
  onHudTick: (cb: (p: { elapsedSeconds: number }) => void) => subscribe('hud-tick', cb),
  hudControl: (action: string) => ipcRenderer.invoke('hud-control', action),
  setHudPassthrough: (enabled: boolean) => ipcRenderer.invoke('hud-set-passthrough', enabled),

  // export
  exportOpen: (opts: any) => ipcRenderer.invoke('export-open', opts),
  exportCancel: (reason?: string) => ipcRenderer.invoke('export-cancel', reason),
  revealExportedFile: (filePath: string) => ipcRenderer.invoke('reveal-file', filePath),
  getExportScene: () => ipcRenderer.invoke('get-export-scene'),
  exportStreamWrite: (bytes: Uint8Array) => ipcRenderer.send('export-stream-write', bytes),
  exportStreamClose: () => ipcRenderer.send('export-stream-close'),
  exportProgressReport: (pct: number) => ipcRenderer.send('export-progress-report', pct),
  onExportProgress: (cb: (pct: number) => void) => subscribe('export-progress', cb),

  // settings / misc
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scanAudioFiles: (dirPath: string) => ipcRenderer.invoke('scan-audio-files', dirPath),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
});
