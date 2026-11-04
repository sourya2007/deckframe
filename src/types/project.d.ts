export interface InteractionEvent {
  timestamp: number;
  type: 'click' | 'keypress' | 'scroll' | 'drag' | 'move';
  coordinates?: { x: number; y: number };
  details: { key?: number | string; button?: 'left' | 'right'; duration?: number; state?: 'down' | 'up'; amount?: number };
}

export interface SoundEffect {
  id: string;
  trackType: string;
  volume: number;
  timestamp: number;
  path?: string;      // library file; absent = label-only legacy effect
}

export interface CameraTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  zoom: number;
}

// full-pose camera keyframes: interpolate between snapshots instead of
// per-channel tracks — enough for lite-AE moves without a curve editor
export interface CameraKeyframe {
  id: string;
  time: number;       // ms along the source video
  camera: CameraTransform;
  easing: 'linear' | 'ease' | 'hold'; // easing into the next keyframe
}

export type MotionEffectType = 'shake' | 'pulse' | 'glitch' | 'fade-black' | 'fade-white';

export interface MotionEffect {
  id: string;
  type: MotionEffectType;
  start: number;
  end: number;
  intensity: number;  // 0..1
}

// editor regions (all times in ms along the source video)
export interface TrimState { start: number; end: number }

export interface ZoomRegion {
  id: string;
  start: number;
  end: number;
  scale: number;        // 1..4 magnification
  centerX: number;      // 0..1 in video space
  centerY: number;      // 0..1 in video space
}

export interface SpeedRegion {
  id: string;
  start: number;
  end: number;
  rate: number;         // 0.25..4
}

export interface Annotation {
  id: string;
  kind: 'text' | 'arrow';
  start: number;
  end: number;
  x: number;            // 0..1
  y: number;            // 0..1
  text?: string;
  color: string;
  size: number;         // 0.02..0.3 of frame height
}

export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface FrameStyle {
  mode: 'none' | 'solid' | 'gradient' | 'image';
  colorA: string;
  colorB: string;
  wallpaper: string;    // built-in id or absolute path
  blur: number;         // 0..8 px at 1920 reference width
  shadow: number;       // 0..1
  radius: number;       // 0..50 % of the video's short side
  padding: number;      // 0..0.2 fraction of frame
  borderColor: string;
  borderWidth: number;  // 0..0.05
}

export interface WebcamStyle {
  enabled: boolean;
  corner: 'br' | 'bl' | 'tr' | 'tl';
  size: number;         // 0.1..0.5 of frame width
  circle: boolean;
}

export type CursorVisualStyle = 'macos' | 'tahoe' | 'windows11' | 'dot' | 'figma';
export type CursorClickEffect = 'none' | 'spotlight' | 'ripple' | 'echo';

// defaults mirror Recordly's cursor section
export interface CursorStyleSettings {
  style: CursorVisualStyle;
  size: number;                    // 0.5..6
  smoothing: number;               // 0..1
  motionBlur: number;              // 0..1
  clickBounce: number;             // 0..2
  clickBounceDuration: number;     // ms
  clickEffect: CursorClickEffect;
  clickEffectColor: string;
  clickEffectScale: number;        // 0.5..2
  clickEffectOpacity: number;      // 0..1
  clickEffectDurationMs: number;   // 120..1200
  sway: number;                    // 0..2
}

// envelope written by inputHook: display size maps click coords → video space
export interface EventsFile {
  version: 1;
  display: { width: number; height: number };
  events: InteractionEvent[];
}

export interface ProjectState {
  videoUrl: string | null;
  videoPath: string | null;   // absolute path for project persistence
  micPath: string | null;
  webcamPath: string | null;
  events: InteractionEvent[];
  displaySize: { width: number; height: number } | null;
  soundEffects: SoundEffect[];
  camera: CameraTransform;
  cameraKeyframes: CameraKeyframe[];
  motionEffects: MotionEffect[];
  isCinematic: boolean;
  dofEnabled: boolean;
  trim: TrimState;
  zoomRegions: ZoomRegion[];
  speedRegions: SpeedRegion[];
  annotations: Annotation[];
  captions: Caption[];
  frame: FrameStyle;
  webcam: WebcamStyle;
  cursor: CursorStyleSettings;
}

export type ProjectAction =
  | { type: 'SET_VIDEO'; url: string; path?: string | null }
  | { type: 'SET_SIDECARS'; micPath?: string | null; webcamPath?: string | null }
  | { type: 'SET_EVENTS'; events: InteractionEvent[]; displaySize?: { width: number; height: number } | null }
  | { type: 'UPDATE_CAMERA'; payload: Partial<CameraTransform> }
  | { type: 'SET_CAMERA_KEYFRAMES'; keyframes: CameraKeyframe[] }
  | { type: 'SET_MOTION_EFFECTS'; effects: MotionEffect[] }
  | { type: 'SET_MODE'; isCinematic: boolean }
  | { type: 'TOGGLE_DOF' }
  | { type: 'ADD_SOUND_EFFECT'; effect: SoundEffect }
  | { type: 'REMOVE_SOUND_EFFECT'; id: string }
  | { type: 'SET_TRIM'; trim: TrimState }
  | { type: 'SET_ZOOM_REGIONS'; regions: ZoomRegion[] }
  | { type: 'SET_SPEED_REGIONS'; regions: SpeedRegion[] }
  | { type: 'SET_ANNOTATIONS'; annotations: Annotation[] }
  | { type: 'SET_CAPTIONS'; captions: Caption[] }
  | { type: 'SET_FRAME'; frame: Partial<FrameStyle> }
  | { type: 'SET_WEBCAM'; webcam: Partial<WebcamStyle> }
  | { type: 'SET_CURSOR'; cursor: Partial<CursorStyleSettings> }
  | { type: 'SET_PROJECT'; project: Partial<ProjectState> };
