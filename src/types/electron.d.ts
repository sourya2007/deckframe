export interface RecordingResult {
  videoPath: string;
  eventsPath: string;
}

export interface SourceInfo {
  id: string;
  name: string;
}

export interface ElectronAPI {
  getSources: () => Promise<SourceInfo[]>;
  startRecording: (sourceId: string) => Promise<string>;
  stopRecording: (chunks: ArrayBuffer) => Promise<RecordingResult>;
  loadEvents: (path: string) => Promise<string>;
  exportVideo: (opts: any) => Promise<void>;
  onExportProgress: (cb: (pct: number) => void) => () => void;
  saveSettings: (settings: any) => Promise<boolean>;
  loadSettings: () => Promise<any>;
  selectDirectory: () => Promise<string | null>;
  scanAudioFiles: (dirPath: string) => Promise<{name:string, path:string}[]>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
