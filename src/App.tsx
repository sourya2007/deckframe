import { useState, useEffect, useRef } from 'react';
import { useProjectState } from './hooks/useProjectState';
import { Viewport3D } from './components/Viewport3D';
import { SidebarAgent } from './components/SidebarAgent';
import { VideoTimeline } from './components/VideoTimeline';
import { useAudioEngine } from './hooks/useAudioEngine';
import { SidebarNav } from './components/SidebarNav';
import { TopBar } from './components/TopBar';
import { SettingsView } from './components/SettingsView';
import { EffectsView } from './components/EffectsView';
import { AudioLibraryView } from './components/AudioLibraryView';
import { ExportModal } from './components/ExportModal';
import { EmptyStateView } from './components/EmptyStateView';
import { SourceSelector } from './components/SourceSelector';
import type { SourceInfo } from './components/SourceSelector';

export default function App() {
  const [state, dispatch] = useProjectState();
  const [activeTab, setActiveTab] = useState('project');
  const [showExport, setShowExport] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(10000); // 10s mock duration
  const [activeEffect, setActiveEffect] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [sources, setSources] = useState<SourceInfo[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  
  const electronAPI = window.electronAPI;

  useAudioEngine(state.events, playhead);

  useEffect(() => {
    if (duration <= 0) return;
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const delta = time - lastTime;
      setPlayhead(p => {
        const next = p + delta;
        if (next >= duration) {
          return 0;
        }
        return next;
      });
      lastTime = time;
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [duration]);

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    if (!state.videoUrl) return;
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      setDuration(el.duration * 1000);
      el.remove();
    };
    el.onerror = () => { el.remove(); };
    el.src = state.videoUrl;
    return () => el.remove();
  }, [state.videoUrl]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleVideoImport = (file: File) => {
    const url = URL.createObjectURL(file);
    setPlayhead(0);
    dispatch({ type: 'SET_VIDEO', payload: url });
  };

  const startRecordingWithSource = async (sourceId: string) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      mediaStreamRef.current = stream;

      const chunks: Blob[] = [];
      recordedChunksRef.current = chunks;

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const buffer = await blob.arrayBuffer();

        try {
          const result = await electronAPI!.stopRecording(buffer);
          dispatch({ type: 'SET_VIDEO', url: `file://${result.videoPath}` });

          if (result.eventsPath) {
            try {
              const eventsJson = await electronAPI!.loadEvents(result.eventsPath);
              const events = JSON.parse(eventsJson);
              dispatch({ type: 'SET_EVENTS', events });
            } catch {
              // events file may not exist if no interaction occurred
            }
          }
        } catch (err: any) {
          alert(`Recording failed: ${err.message}`);
        }

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }

        setRecordingSeconds(0);
        setIsRecording(false);
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
      };

      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      };

      recorder.start(1000);
      await electronAPI!.startRecording(sourceId);
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') return;
      console.error('Failed to start recording:', err);
      alert('Could not start recording. Please grant screen permissions.');
    }
  };

  const handleSourceSelected = (sourceId: string) => {
    setShowSourcePicker(false);
    startRecordingWithSource(sourceId);
  };

  const handleRecord = async () => {
    if (!electronAPI) {
      alert("Recording requires the Electron environment. Please run the desktop build.");
      return;
    }

    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    const availableSources = await electronAPI.getSources();
    setSources(availableSources);
    setShowSourcePicker(true);
  };

  const handleEffectSelect = (name: string) => {
    setActiveEffect(prev => prev === name ? null : name);
    const rotationEffects = ['Tilt-Shift', 'Perspective Warp', '3D Rotate', 'Corner Pin'];
    const transitionEffects = ['Cross Dissolve', 'Fade to Black', 'Fade to White', 'Glitch', 'Slide Left', 'Slide Right', 'Wipe', 'Push'];
    const textEffects = ['Lower Thirds', 'Text Animation', 'Animated Icons'];

    if (rotationEffects.includes(name)) {
      dispatch({ type: 'UPDATE_CAMERA', payload: { rotation: [0.2, 0.3, 0.1] } });
    } else if (name === 'Zoom In') {
      dispatch({ type: 'UPDATE_CAMERA', payload: { zoom: state.camera.zoom + 0.5 } });
    } else if (name === 'Zoom Out') {
      dispatch({ type: 'UPDATE_CAMERA', payload: { zoom: Math.max(0.5, state.camera.zoom - 0.5) } });
    } else if (name === 'Camera Shake') {
      dispatch({ type: 'UPDATE_CAMERA', payload: { position: [0.1, 0.1, state.camera.position[2]] } });
    } else if (name === 'Parallax') {
      dispatch({ type: 'UPDATE_CAMERA', payload: { position: [state.camera.position[0], state.camera.position[1], state.camera.position[2] - 1] } });
    } else if (transitionEffects.includes(name)) {
      dispatch({ type: 'SET_MODE', isCinematic: !state.isCinematic });
    } else if (textEffects.includes(name)) {
      dispatch({ type: 'SET_MODE', isCinematic: true });
      dispatch({ type: 'UPDATE_CAMERA', payload: { zoom: 1.2 } });
    }
  };

  const handleToolCall = (name: string, args: any) => {
    if (name === 'applyCinematicTilt') {
      dispatch({ type: 'SET_MODE', isCinematic: true });
      dispatch({ 
        type: 'UPDATE_CAMERA', 
        payload: { rotation: [args.pitch, args.yaw, args.roll] } 
      });
    } else if (name === 'zoomToEvent') {
      dispatch({
        type: 'UPDATE_CAMERA',
        payload: { zoom: args.zoomFactor }
      });
    } else if (name === 'addSoundEffect') {
      dispatch({
        type: 'ADD_SOUND_EFFECT',
        effect: {
          id: `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          trackType: args.trackType || 'whoosh',
          volume: args.volume ?? 0.5,
          timestamp: args.timestamp ?? playhead,
        }
      });
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#0E0E11] text-white overflow-hidden font-sans">
      <SidebarNav activeTab={activeTab} setActiveTab={setActiveTab} setShowExport={setShowExport} />
      
      <div className="flex-1 flex flex-col relative min-w-0">
        <TopBar />

        <div className="flex-1 relative overflow-hidden flex flex-col">
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'effects' && <EffectsView onEffectSelect={handleEffectSelect} />}
          {activeTab === 'library' && <AudioLibraryView />}
          
          {(activeTab === 'project' || activeTab === 'move' || activeTab === 'cut' || activeTab === 'ai') && (
            <>
              {state.videoUrl ? (
                <div className="flex-1 flex min-h-0">
                  <div className="flex-1 relative bg-[#0E0E11]">
                    <Viewport3D 
                      videoUrl={state.videoUrl}
                      cameraTransform={state.camera}
                      isCinematic={state.isCinematic}
                      dofEnabled={state.dofEnabled}
                      playhead={playhead}
                      activeEffect={activeEffect}
                    />
                    
                    <div className="absolute top-4 right-4 bg-neutral-900/60 p-3 rounded-lg border border-neutral-800/80 backdrop-blur text-xs flex flex-col gap-3">
                      <div className="flex gap-4 items-center">
                        <span className="text-blue-400 font-medium">Z</span>
                        <div className="bg-neutral-950 border border-neutral-800 rounded px-3 py-1 w-20 text-center">{state.camera.position[2].toFixed(1)}</div>
                      </div>
                      <div className="flex gap-4 items-center">
                        <span className="text-green-400 font-medium">Y</span>
                        <div className="bg-neutral-950 border border-neutral-800 rounded px-3 py-1 w-20 text-center">{state.camera.position[1].toFixed(1)}</div>
                      </div>
                      <div className="flex gap-4 items-center">
                        <span className="text-red-400 font-medium">X</span>
                        <div className="bg-neutral-950 border border-neutral-800 rounded px-3 py-1 w-20 text-center">{state.camera.position[0].toFixed(1)}</div>
                      </div>
                      <div className="flex gap-4 items-center">
                        <span className="text-yellow-400 font-medium">Zoom</span>
                        <div className="bg-neutral-950 border border-neutral-800 rounded px-3 py-1 w-20 text-center">{state.camera.zoom.toFixed(1)}</div>
                      </div>
                      <div className="pt-2 border-t border-neutral-800 flex justify-between items-center text-neutral-400">
                         <span>Rotation</span>
                         <div className="flex gap-2">
                           <span className="bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5">X {state.camera.rotation[0].toFixed(1)}°</span>
                           <span className="bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5">Y {state.camera.rotation[1].toFixed(1)}°</span>
                           <span className="bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5">Z {state.camera.rotation[2].toFixed(1)}°</span>
                         </div>
                      </div>
                      <label className="flex items-center gap-2 mt-1">
                        <input 
                          type="checkbox" 
                          checked={state.isCinematic} 
                          onChange={e => dispatch({ type: 'SET_MODE', isCinematic: e.target.checked })} 
                        />
                        Cinematic Mode
                      </label>
                    </div>
                  </div>
                  
                  {activeTab === 'ai' && <SidebarAgent onToolCall={handleToolCall} />}
                </div>
              ) : (
                <EmptyStateView
                  onRecord={handleRecord}
                  isRecording={isRecording}
                  onVideoImport={handleVideoImport}
                  recordingTimer={formatTime(recordingSeconds)}
                />
              )}
              
              {state.videoUrl && (
                <VideoTimeline 
                  duration={duration} 
                  events={state.events} 
                  soundEffects={state.soundEffects}
                  camera={state.camera}
                  playhead={playhead}
                  onSeek={setPlayhead}
                  onSoundEffectMove={(id, newTimestamp) => {
                    const effect = state.soundEffects.find(sfx => sfx.id === id);
                    if (effect) {
                      dispatch({ type: 'REMOVE_SOUND_EFFECT', id });
                      dispatch({ type: 'ADD_SOUND_EFFECT', effect: { ...effect, timestamp: newTimestamp } });
                    }
                  }}
                  onRemoveSoundEffect={(id) => dispatch({ type: 'REMOVE_SOUND_EFFECT', id })}
                />
              )}
            </>
          )}
        </div>
      </div>

      {showExport && <ExportModal onClose={() => setShowExport(false)} videoPath={state.videoUrl?.startsWith('file://') ? state.videoUrl.slice(7) : null} events={state.events} duration={duration} />}

      {showSourcePicker && (
        <SourceSelector
          sources={sources}
          onSelect={handleSourceSelected}
          onCancel={() => setShowSourcePicker(false)}
        />
      )}
    </div>
  );
}
