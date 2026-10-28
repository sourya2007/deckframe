export interface RecordingResult {
  videoPath: string;
  eventsPath: string;
  micPath?: string;
}

export interface SourceInfo {
  id: string;
  name: string;
  thumbnail?: string;
}

export interface ElectronAPI {
  // recording
  getSources: (thumbnails?: boolean) => Promise<SourceInfo[]>;
  startRecording: (sourceId: string) => Promise<string>;
  stopRecording: (chunks: ArrayBuffer, micChunks?: ArrayBuffer) => Promise<RecordingResult>;
  loadEvents: (path: string) => Promise<string>;

  // capture flow (main window)
  showSourceSelector: () => Promise<void>;
  onSourceSelected: (cb: (sourceId: string) => void) => () => void;
  beginCountdown: () => Promise<'started' | 'cancelled'>;
  onHudControl: (cb: (action: 'stop' | 'pause' | 'resume') => void) => () => void;
  onCursorTelemetry: (cb: (ev: any) => void) => () => void;

  // overlay windows
  sourcePicked: (sourceId: string) => Promise<void>;
  cancelSourceSelector: () => Promise<void>;
  cancelCountdown: () => void;
  onCountdownTick: (cb: (p: { remaining: number }) => void) => () => void;
  onHudTick: (cb: (p: { elapsedSeconds: number }) => void) => () => void;
  hudControl: (action: string) => Promise<void>;
  setHudPassthrough: (enabled: boolean) => Promise<void>;

  // export
  exportOpen: (opts: any) => Promise<{ outPath: string }>;
  exportCancel: (reason?: string) => Promise<void>;
  revealExportedFile: (filePath: string) => Promise<void>;
  exportStreamWrite: (bytes: Uint8Array) => void;
  exportStreamClose: () => void;
  exportProgressReport: (pct: number) => void;
  onExportProgress: (cb: (pct: number) => void) => () => void;

  // settings / misc
  saveSettings: (settings: any) => Promise<boolean>;
  loadSettings: () => Promise<any>;
  selectDirectory: () => Promise<string | null>;
  scanAudioFiles: (dirPath: string) => Promise<{ name: string; path: string }[]>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
