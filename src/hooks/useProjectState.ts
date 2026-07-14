import { useReducer } from 'react';
import { ProjectState, ProjectAction } from '../types/project';

const initialState: ProjectState = {
  videoUrl: null,
  events: [],
  soundEffects: [],
  camera: {
    position: [0, 0, 5],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    zoom: 1,
  },
  isCinematic: false,
  dofEnabled: false,
};

function reducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'SET_VIDEO':
      return { ...state, videoUrl: action.url };
    case 'SET_EVENTS':
      return { ...state, events: action.events };
    case 'UPDATE_CAMERA':
      return { ...state, camera: { ...state.camera, ...action.payload } };
    case 'SET_MODE':
      return { ...state, isCinematic: action.isCinematic };
    case 'TOGGLE_DOF':
      return { ...state, dofEnabled: !state.dofEnabled };
    case 'ADD_SOUND_EFFECT':
      return { ...state, soundEffects: [...state.soundEffects, action.effect] };
    case 'REMOVE_SOUND_EFFECT':
      return { ...state, soundEffects: state.soundEffects.filter(s => s.id !== action.id) };
    default:
      return state;
  }
}

export function useProjectState() {
  return useReducer(reducer, initialState);
}
