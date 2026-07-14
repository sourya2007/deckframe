export interface InteractionEvent {
  timestamp: number;
  type: 'click' | 'keypress' | 'scroll' | 'drag';
  coordinates?: { x: number; y: number };
  details: { key?: number | string; button?: 'left' | 'right'; duration?: number; state?: 'down' | 'up'; amount?: number };
}

export interface SoundEffect {
  id: string;
  trackType: string;
  volume: number;
  timestamp: number;
}

export interface CameraTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  zoom: number;
}

export interface ProjectState {
  videoUrl: string | null;
  events: InteractionEvent[];
  soundEffects: SoundEffect[];
  camera: CameraTransform;
  isCinematic: boolean;
  dofEnabled: boolean;
}

export type ProjectAction = 
  | { type: 'SET_VIDEO'; url: string }
  | { type: 'SET_EVENTS'; events: InteractionEvent[] }
  | { type: 'UPDATE_CAMERA'; payload: Partial<CameraTransform> }
  | { type: 'SET_MODE'; isCinematic: boolean }
  | { type: 'TOGGLE_DOF' }
  | { type: 'ADD_SOUND_EFFECT'; effect: SoundEffect }
  | { type: 'REMOVE_SOUND_EFFECT'; id: string };
