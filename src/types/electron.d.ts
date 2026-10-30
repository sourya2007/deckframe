export interface RecordingResult {
  videoPath: string;
  eventsPath: string;
  micPath?: string;
  webcamPath?: string;
}

export interface SourceInfo {
  id: string;
  name: string;
  thumbnail?: string;
}

export interface CaptionCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface LoadedProject {
  filePath: string;
  project: any;   // ProjectState JSON — shape validated by the renderer
}

export interface ElectronAPI {
  // recording
  getSources: (thumbnails?: boolean) => Promise<SourceInfo[]>;
  startRecording: (sourceId: string) => Promise<string>;
  stopRecording: (chunks: ArrayBuffer, micChunks?: ArrayBuffer, webcamChunks?: ArrayBuffer) => Promise<RecordingResult>;
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
  getExportScene: () => Promise<string>;
  exportStreamWrite: (bytes: Uint8Array) => void;
  exportStreamClose: () => void;
  exportProgressReport: (pct: number) => void;
  onExportProgress: (cb: (pct: number) => void) => () => void;

  // projects
  saveProject: (projectJson: string) => Promise<string | null>;
  openProject: () => Promise<LoadedProject | null>;
  filePathForFile: (file: File) => string;

  // captions
  transcribeAudio: (audioPath: string) => Promise<CaptionCue[]>;

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
