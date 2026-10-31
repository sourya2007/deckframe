import { useCallback, useRef, useState } from 'react';
import { ProjectState, ProjectAction } from '../types/project';
import { createHistory, pushHistory, redoHistory, undoHistory } from '../lib/history';

const initialState: ProjectState = {
  videoUrl: null,
  videoPath: null,
  micPath: null,
  webcamPath: null,
  events: [],
  displaySize: null,
  soundEffects: [],
  camera: {
    position: [0, 0, 5],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    zoom: 1,
  },
  cameraKeyframes: [],
  motionEffects: [],
  isCinematic: false,
  dofEnabled: false,
  trim: { start: 0, end: 0 },   // end=0 means "full duration"
  zoomRegions: [],
  speedRegions: [],
  annotations: [],
  captions: [],
  frame: { mode: 'none', colorA: '#1a1a2e', colorB: '#16213e', padding: 0.08, rounded: true, borderColor: '#ffffff', borderWidth: 0 },
  webcam: { enabled: false, corner: 'br', size: 0.22, circle: true },
};

function reducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'SET_VIDEO':
      return { ...state, videoUrl: action.url, videoPath: action.path !== undefined ? action.path : state.videoPath };
    case 'SET_SIDECARS':
      return {
        ...state,
        micPath: action.micPath !== undefined ? action.micPath : state.micPath,
        webcamPath: action.webcamPath !== undefined ? action.webcamPath : state.webcamPath,
      };
    case 'SET_EVENTS':
      return { ...state, events: action.events, displaySize: action.displaySize !== undefined ? action.displaySize : state.displaySize };
    case 'UPDATE_CAMERA':
      return { ...state, camera: { ...state.camera, ...action.payload } };
    case 'SET_CAMERA_KEYFRAMES':
      return { ...state, cameraKeyframes: action.keyframes };
    case 'SET_MOTION_EFFECTS':
      return { ...state, motionEffects: action.effects };
    case 'SET_MODE':
      return { ...state, isCinematic: action.isCinematic };
    case 'TOGGLE_DOF':
      return { ...state, dofEnabled: !state.dofEnabled };
    case 'ADD_SOUND_EFFECT':
      return { ...state, soundEffects: [...state.soundEffects, action.effect] };
    case 'REMOVE_SOUND_EFFECT':
      return { ...state, soundEffects: state.soundEffects.filter(s => s.id !== action.id) };
    case 'SET_TRIM':
      return { ...state, trim: action.trim };
    case 'SET_ZOOM_REGIONS':
      return { ...state, zoomRegions: action.regions };
    case 'SET_SPEED_REGIONS':
      return { ...state, speedRegions: action.regions };
    case 'SET_ANNOTATIONS':
      return { ...state, annotations: action.annotations };
    case 'SET_CAPTIONS':
      return { ...state, captions: action.captions };
    case 'SET_FRAME':
      return { ...state, frame: { ...state.frame, ...action.frame } };
    case 'SET_WEBCAM':
      return { ...state, webcam: { ...state.webcam, ...action.webcam } };
    case 'SET_PROJECT':
      return { ...initialState, ...action.project };
    default:
      return state;
  }
}

const COALESCE_MS = 500;

export function useProjectState() {
  const [history, setHistory] = useState(() => createHistory(initialState));
  // slider drags fire an action per pixel — merge same-type edits into one step
  const lastAction = useRef({ type: '', at: 0 });

  const dispatch = useCallback((action: ProjectAction) => {
    const now = Date.now();
    const coalesce = action.type !== 'SET_PROJECT'
      && action.type === lastAction.current.type
      && now - lastAction.current.at < COALESCE_MS;
    lastAction.current = { type: action.type, at: now };

    setHistory(h => pushHistory(h, reducer(h.present, action), coalesce));
  }, []);

  const undo = useCallback(() => {
    lastAction.current = { type: '', at: 0 };
    setHistory(h => undoHistory(h));
  }, []);

  const redo = useCallback(() => {
    lastAction.current = { type: '', at: 0 };
    setHistory(h => redoHistory(h));
  }, []);

  return {
    state: history.present,
    dispatch,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
