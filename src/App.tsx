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
import { TransportBar } from './components/TransportBar';
import { autoZoomRegions, speedAt, splitRanges, uid } from './lib/timeline';
import { applyAiToolCalls } from './lib/aiActions';
import type { AiToolCall } from './lib/aiActions';
import type { FrameStyle, WebcamStyle, MotionEffectType } from './types/project';

const toFileUrl = (p: string) => 'file:///' + p.replace(/\\/g, '/');

export default function App() {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useProjectState();
  const [activeTab, setActiveTab] = useState('project');
  const [showExport, setShowExport] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(10000); // 10s mock duration
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const webcamRecorderRef = useRef<MediaRecorder | null>(null);
  const webcamChunksRef = useRef<Blob[]>([]);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // capture-flow handlers are registered once; read live state through refs
  const webcamEnabledRef = useRef(state.webcam.enabled);
  webcamEnabledRef.current = state.webcam.enabled;
  const playbackRef = useRef({ trim: state.trim, speedRegions: state.speedRegions });
  playbackRef.current = { trim: state.trim, speedRegions: state.speedRegions };
  // freeze playback on the AI tab so "here" has a stable playhead to edit
  const aiPausedRef = useRef(false);
  const [manualPaused, setManualPaused] = useState(false);
  aiPausedRef.current = activeTab === 'ai';
  const stateRef = useRef(state);
  stateRef.current = state;

  const electronAPI = window.electronAPI;

  useAudioEngine(state.events, playhead, state.soundEffects);

  // crash recovery: restore the last autosave once on launch
  const autosaveLoadedRef = useRef(false);
  useEffect(() => {
    if (!electronAPI?.loadAutosave || autosaveLoadedRef.current) return;
    autosaveLoadedRef.current = true;
    (async () => {
      const saved = await electronAPI.loadAutosave!();
      const project = saved?.project;
      if (project?.videoPath) {
        dispatch({ type: 'SET_PROJECT', project: { ...project, videoUrl: toFileUrl(project.videoPath) } });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounced autosave so an unexpected close loses at most a couple of seconds
  useEffect(() => {
    if (!electronAPI?.autosaveProject || !state.videoPath) return;
    const id = setTimeout(() => {
      electronAPI.autosaveProject!(JSON.stringify({ ...state, videoUrl: null }));
    }, 2500);
    return () => clearTimeout(id);
  }, [state]);

  useEffect(() => {
    if (duration <= 0) return;
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      if (!aiPausedRef.current && !manualPaused) {
        setPlayhead(p => {
          const { trim, speedRegions } = playbackRef.current;
          const end = trim.end > 0 ? Math.min(trim.end, duration) : duration;
          const start = Math.max(0, trim.start);
          // speed regions re-time playback: 2x region advances the source twice as fast
          const next = p + delta * speedAt(speedRegions, p);
          if (p < start || next >= end) return start;
          return next;
        });
      }
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
    // a real path survives save/reload; blob URLs do not
    const path = electronAPI?.filePathForFile?.(file) ?? null;
    const url = path ? toFileUrl(path) : URL.createObjectURL(file);
    setPlayhead(0);
    dispatch({ type: 'SET_VIDEO', url, path });
  };

  const stopAllTracks = () => {
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    webcamStreamRef.current?.getTracks().forEach(t => t.stop());
    webcamStreamRef.current = null;
  };

  const stopRecordingFlow = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const startRecordingWithSource = async () => {
    try {
      // video + system audio come from the display-media handler in main,
      // which auto-approves the source picked in the overlay
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      mediaStreamRef.current = stream;

      // mic is a separate sidecar track, re-mixed at export time
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;
        const micChunks: Blob[] = [];
        micChunksRef.current = micChunks;
        const micRecorder = new MediaRecorder(micStream);
        micRecorderRef.current = micRecorder;
        micRecorder.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) micChunks.push(e.data); };
        micRecorder.start(1000);
      } catch {
        console.warn('Microphone unavailable — recording without mic track');
      }

      // webcam sidecar, only when the user enabled the bubble before recording
      if (webcamEnabledRef.current) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
          webcamStreamRef.current = camStream;
          const camChunks: Blob[] = [];
          webcamChunksRef.current = camChunks;
          const camRecorder = new MediaRecorder(camStream);
          webcamRecorderRef.current = camRecorder;
          camRecorder.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) camChunks.push(e.data); };
          camRecorder.start(1000);
        } catch {
          console.warn('Webcam unavailable — recording without webcam track');
        }
      }

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
        if (micRecorderRef.current && micRecorderRef.current.state !== 'inactive') {
          micRecorderRef.current.stop();
        }
        if (webcamRecorderRef.current && webcamRecorderRef.current.state !== 'inactive') {
          webcamRecorderRef.current.stop();
        }
        // give the sidecar recorders a beat to flush their last chunks
        await new Promise(r => setTimeout(r, 150));

        const buffer = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer();
        const micBuffer = micChunksRef.current.length
          ? await new Blob(micChunksRef.current, { type: 'audio/webm' }).arrayBuffer()
          : undefined;
        const webcamBuffer = webcamChunksRef.current.length
          ? await new Blob(webcamChunksRef.current, { type: 'video/webm' }).arrayBuffer()
          : undefined;

        try {
          const result = await electronAPI!.stopRecording(buffer, micBuffer, webcamBuffer);
          dispatch({ type: 'SET_VIDEO', url: toFileUrl(result.videoPath), path: result.videoPath });
          dispatch({ type: 'SET_SIDECARS', micPath: result.micPath ?? null, webcamPath: result.webcamPath ?? null });

          if (result.eventsPath) {
            try {
              const eventsJson = await electronAPI!.loadEvents(result.eventsPath);
              const parsed = JSON.parse(eventsJson);
              // envelope {version, display, events}; older files were a bare array
              const events = Array.isArray(parsed) ? parsed : (parsed.events ?? []);
              const displaySize = Array.isArray(parsed) ? null : (parsed.display ?? null);
              dispatch({ type: 'SET_EVENTS', events, displaySize });
            } catch {
              // events file may not exist if no interaction occurred
            }
          }
        } catch (err: any) {
          alert(`Recording failed: ${err.message}`);
        }

        stopAllTracks();
        setRecordingSeconds(0);
        setIsRecording(false);
        mediaRecorderRef.current = null;
        micRecorderRef.current = null;
        webcamRecorderRef.current = null;
        recordedChunksRef.current = [];
        micChunksRef.current = [];
        webcamChunksRef.current = [];
      };

      stream.getVideoTracks()[0].onended = stopRecordingFlow;

      recorder.start(1000);
      await electronAPI!.startRecording('display-media');
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') return;
      console.error('Failed to start recording:', err);
      alert('Could not start recording. Please grant screen permissions.');
    }
  };

  // capture flow: pick source (overlay) → countdown (overlay) → capture
  useEffect(() => {
    if (!electronAPI) return;
    const unsubSel = electronAPI.onSourceSelected(async () => {
      const result = await electronAPI!.beginCountdown();
      if (result === 'started') await startRecordingWithSource();
    });
    const unsubHud = electronAPI.onHudControl(action => {
      if (action === 'stop') stopRecordingFlow();
      else if (action === 'pause') {
        mediaRecorderRef.current?.pause();
        micRecorderRef.current?.pause();
        webcamRecorderRef.current?.pause();
      } else if (action === 'resume') {
        mediaRecorderRef.current?.resume();
        micRecorderRef.current?.resume();
        webcamRecorderRef.current?.resume();
      }
    });
    return () => { unsubSel(); unsubHud(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRecord = async () => {
    if (!electronAPI) {
      alert("Recording requires the Electron environment. Please run the desktop build.");
      return;
    }

    if (isRecording) {
      stopRecordingFlow();
      return;
    }

    await electronAPI.showSourceSelector();
  };

  const handleAutoZoom = () => {
    if (!state.displaySize) {
      alert('No cursor telemetry in this recording — auto-zoom needs click positions.');
      return;
    }
    const regions = autoZoomRegions(state.events, state.displaySize, duration);
    if (regions.length === 0) {
      alert('No clicks found to zoom into.');
      return;
    }
    dispatch({ type: 'SET_ZOOM_REGIONS', regions });
  };

  const handleTranscribe = async () => {
    if (!electronAPI) return;
    const src = state.micPath ?? state.videoPath;
    if (!src) {
      alert('No audio source — record or import a video first.');
      return;
    }
    try {
      const cues = await electronAPI.transcribeAudio(src);
      if (cues.length === 0) {
        alert('No speech detected.');
        return;
      }
      dispatch({ type: 'SET_CAPTIONS', captions: cues });
    } catch (err: any) {
      alert(`Transcription failed: ${err.message}`);
    }
  };

  const handleSaveProject = async () => {
    if (!electronAPI) return;
    try {
      // blob URLs don't survive a reload — projects persist the file path instead
      await electronAPI.saveProject(JSON.stringify({ ...state, videoUrl: null }, null, 2));
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    }
  };

  const handleOpenProject = async () => {
    if (!electronAPI) return;
    try {
      const loaded = await electronAPI.openProject();
      if (!loaded) return;
      const p = loaded.project ?? {};
      dispatch({
        type: 'SET_PROJECT',
        project: { ...p, videoUrl: p.videoPath ? toFileUrl(p.videoPath) : null },
      });
      setPlayhead(0);
    } catch (err: any) {
      alert(`Open failed: ${err.message}`);
    }
  };

  const handleOpenRecent = async (filePath: string) => {
    if (!electronAPI?.openProjectPath) return;
    try {
      const loaded = await electronAPI.openProjectPath(filePath);
      if (!loaded) return;
      const p = loaded.project ?? {};
      dispatch({
        type: 'SET_PROJECT',
        project: { ...p, videoUrl: p.videoPath ? toFileUrl(p.videoPath) : null },
      });
      setPlayhead(0);
    } catch (err: any) {
      alert(`Open failed: ${err.message}`);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (key === 's') { e.preventDefault(); handleSaveProject(); }
      else if (key === 'o') { e.preventDefault(); handleOpenProject(); }
      else if (!typing && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (!typing && key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, undo, redo]);

  const handleEffectSelect = (type: MotionEffectType) => {
    dispatch({
      type: 'SET_MOTION_EFFECTS',
      effects: [...state.motionEffects, {
        id: uid('fx'),
        type,
        start: playhead,
        end: Math.min(duration, playhead + 2000),
        intensity: 0.7,
      }],
    });
  };

  const handleAddKeyframe = () => {
    // re-key within 100ms updates that pose instead of stacking duplicates
    const existing = state.cameraKeyframes.find(k => Math.abs(k.time - playhead) < 100);
    if (existing) {
      dispatch({
        type: 'SET_CAMERA_KEYFRAMES',
        keyframes: state.cameraKeyframes.map(k => k.id === existing.id ? { ...k, camera: { ...state.camera } } : k),
      });
      return;
    }
    const keyframe = { id: uid('cam'), time: Math.round(playhead), camera: { ...state.camera }, easing: 'ease' as const };
    dispatch({
      type: 'SET_CAMERA_KEYFRAMES',
      keyframes: [...state.cameraKeyframes, keyframe].sort((a, b) => a.time - b.time),
    });
  };

  // one razor click = one undo step, so split every track in a single dispatch
  const handleRazor = (time: number) => {
    const current = stateRef.current;
    const next = {
      ...current,
      zoomRegions: splitRanges(current.zoomRegions, time),
      speedRegions: splitRanges(current.speedRegions, time),
      motionEffects: splitRanges(current.motionEffects, time),
      annotations: splitRanges(current.annotations, time),
      captions: splitRanges(current.captions, time),
    };
    const changed = next.zoomRegions.length !== current.zoomRegions.length
      || next.speedRegions.length !== current.speedRegions.length
      || next.motionEffects.length !== current.motionEffects.length
      || next.annotations.length !== current.annotations.length
      || next.captions.length !== current.captions.length;
    if (changed) dispatch({ type: 'SET_PROJECT', project: next });
  };

  const handleToolCalls = (calls: AiToolCall[]) => {
    // batch-apply against the latest state so multiple calls don't clobber
    // each other (and edits made while the model was thinking are kept)
    const next = applyAiToolCalls(stateRef.current, calls, duration);
    if (next !== stateRef.current) dispatch({ type: 'SET_PROJECT', project: next });
  };

  // Move tool: drag the preview to pan the camera. Uses the pose from drag
  // start so each move is an absolute update (history coalesces it into one step).
  const panRef = useRef<{ x: number; y: number; position: [number, number, number] } | null>(null);
  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTab !== 'move' || !state.videoUrl) return;
    panRef.current = { x: e.clientX, y: e.clientY, position: [...state.camera.position] };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = panRef.current;
    if (!p) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - p.x) / rect.width) * 16;
    const dy = ((e.clientY - p.y) / rect.height) * 9;
    dispatch({
      type: 'UPDATE_CAMERA',
      payload: {
        position: [
          Math.max(-8, Math.min(8, p.position[0] - dx)),
          Math.max(-4.5, Math.min(4.5, p.position[1] + dy)),
          p.position[2],
        ],
      },
    });
  };
  const endViewportPan = () => { panRef.current = null; };

  return (
    <div className="flex h-screen w-screen bg-[#0E0E11] text-white overflow-hidden font-sans">
      <SidebarNav activeTab={activeTab} setActiveTab={setActiveTab} setShowExport={setShowExport} />
      
      <div className="flex-1 flex flex-col relative min-w-0">
        <TopBar
          onSave={handleSaveProject}
          onOpen={handleOpenProject}
          onOpenRecent={handleOpenRecent}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        <div className="flex-1 relative overflow-hidden flex flex-col">
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'effects' && <EffectsView onEffectSelect={handleEffectSelect} />}
          {activeTab === 'library' && (
            <AudioLibraryView
              onAddSoundEffect={file => dispatch({
                type: 'ADD_SOUND_EFFECT',
                effect: { id: uid('sfx'), trackType: file.name, path: file.path, volume: 1, timestamp: playhead },
              })}
            />
          )}
          
          {(activeTab === 'project' || activeTab === 'move' || activeTab === 'cut' || activeTab === 'ai') && (
            <>
              {state.videoUrl ? (
                <div className="flex-1 flex min-h-0">
                  <div
                    className={`flex-1 relative bg-[#0E0E11] ${activeTab === 'move' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    onPointerDown={handleViewportPointerDown}
                    onPointerMove={handleViewportPointerMove}
                    onPointerUp={endViewportPan}
                    onPointerCancel={endViewportPan}
                  >
                    <Viewport3D 
                      videoUrl={state.videoUrl}
                      cameraTransform={state.camera}
                      isCinematic={state.isCinematic}
                      dofEnabled={state.dofEnabled}
                      playhead={playhead}
                      paused={manualPaused || activeTab === 'ai'}
                      events={state.events}
                      displaySize={state.displaySize}
                      frame={state.frame}
                      annotations={state.annotations}
                      captions={state.captions}
                      playbackRate={speedAt(state.speedRegions, playhead)}
                      webcamUrl={state.webcamPath ? toFileUrl(state.webcamPath) : null}
                      webcam={state.webcam}
                      zoomRegions={state.zoomRegions}
                      cameraKeyframes={state.cameraKeyframes}
                      motionEffects={state.motionEffects}
                    />
                    
                    <div
                      className="absolute top-4 right-4 max-h-[calc(100%-2rem)] overflow-y-auto bg-neutral-900/60 p-3 rounded-lg border border-neutral-800/80 backdrop-blur text-xs flex flex-col gap-3"
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-400">Camera</span>
                        <button
                          onClick={handleAddKeyframe}
                          title="Snapshot the current camera pose at the playhead"
                          className="bg-fuchsia-600/20 text-fuchsia-300 border border-fuchsia-500/40 rounded px-2 py-0.5 hover:bg-fuchsia-600/30"
                        >
                          ◆ {state.cameraKeyframes.some(k => Math.abs(k.time - playhead) < 100) ? 'Update' : 'Keyframe'}
                        </button>
                      </div>
                      <label className="flex items-center gap-2 text-neutral-400">
                        <span className="w-3 text-red-400">X</span>
                        <input type="range" min="-8" max="8" step="0.1" value={state.camera.position[0]}
                          onChange={e => dispatch({ type: 'UPDATE_CAMERA', payload: { position: [Number(e.target.value), state.camera.position[1], state.camera.position[2]] } })}
                          className="flex-1 accent-red-500" />
                        <span className="w-9 text-right text-neutral-300">{state.camera.position[0].toFixed(1)}</span>
                      </label>
                      <label className="flex items-center gap-2 text-neutral-400">
                        <span className="w-3 text-green-400">Y</span>
                        <input type="range" min="-4.5" max="4.5" step="0.1" value={state.camera.position[1]}
                          onChange={e => dispatch({ type: 'UPDATE_CAMERA', payload: { position: [state.camera.position[0], Number(e.target.value), state.camera.position[2]] } })}
                          className="flex-1 accent-green-500" />
                        <span className="w-9 text-right text-neutral-300">{state.camera.position[1].toFixed(1)}</span>
                      </label>
                      <label className="flex items-center gap-2 text-neutral-400">
                        <span className="w-9 text-yellow-400">Zoom</span>
                        <input type="range" min="0.5" max="3" step="0.05" value={state.camera.zoom}
                          onChange={e => dispatch({ type: 'UPDATE_CAMERA', payload: { zoom: Number(e.target.value) } })}
                          className="flex-1 accent-yellow-500" />
                        <span className="w-9 text-right text-neutral-300">{state.camera.zoom.toFixed(2)}</span>
                      </label>
                      <div className="pt-2 border-t border-neutral-800 flex justify-between items-center text-neutral-400">
                        <span>Rotation</span>
                        <span className="text-[10px] text-neutral-500">X / Y / Z</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {[0, 1, 2].map(i => (
                          <input
                            key={i}
                            type="range" min="-0.6" max="0.6" step="0.02" value={state.camera.rotation[i]}
                            onChange={e => {
                              const rotation = [...state.camera.rotation] as [number, number, number];
                              rotation[i] = Number(e.target.value);
                              dispatch({ type: 'UPDATE_CAMERA', payload: { rotation } });
                            }}
                            className="w-full accent-purple-500"
                          />
                        ))}
                      </div>
                      <div className="pt-2 border-t border-neutral-800 space-y-2">
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-neutral-400">Frame</span>
                          <select
                            value={state.frame.mode}
                            onChange={e => dispatch({ type: 'SET_FRAME', frame: { mode: e.target.value as FrameStyle['mode'] } })}
                            className="bg-neutral-950 border border-neutral-800 rounded px-1 py-0.5"
                          >
                            <option value="none">None</option>
                            <option value="solid">Solid</option>
                            <option value="gradient">Gradient</option>
                          </select>
                        </div>
                        {state.frame.mode !== 'none' && (
                          <>
                            <label className="flex justify-between items-center gap-2">
                              <span className="text-neutral-400">Padding</span>
                              <input
                                type="range" min="0.02" max="0.25" step="0.01"
                                value={state.frame.padding}
                                onChange={e => dispatch({ type: 'SET_FRAME', frame: { padding: Number(e.target.value) } })}
                                className="w-20 accent-blue-500"
                              />
                            </label>
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-neutral-400">Colors</span>
                              <div className="flex gap-1">
                                <input type="color" value={state.frame.colorA}
                                  onChange={e => dispatch({ type: 'SET_FRAME', frame: { colorA: e.target.value } })}
                                  className="w-6 h-5 bg-transparent border-0" />
                                <input type="color" value={state.frame.colorB}
                                  onChange={e => dispatch({ type: 'SET_FRAME', frame: { colorB: e.target.value } })}
                                  className="w-6 h-5 bg-transparent border-0" />
                              </div>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between items-center gap-2">
                          <label className="flex items-center gap-2 text-neutral-400">
                            <input
                              type="checkbox"
                              checked={state.webcam.enabled}
                              onChange={e => dispatch({ type: 'SET_WEBCAM', webcam: { enabled: e.target.checked } })}
                            />
                            Webcam
                          </label>
                          {state.webcam.enabled && (
                            <select
                              value={state.webcam.corner}
                              onChange={e => dispatch({ type: 'SET_WEBCAM', webcam: { corner: e.target.value as WebcamStyle['corner'] } })}
                              className="bg-neutral-950 border border-neutral-800 rounded px-1 py-0.5"
                            >
                              <option value="br">Bottom right</option>
                              <option value="bl">Bottom left</option>
                              <option value="tr">Top right</option>
                              <option value="tl">Top left</option>
                            </select>
                          )}
                        </div>
                        {state.webcam.enabled && !state.webcamPath && (
                          <div className="text-[10px] text-amber-500/80">Enable webcam before recording to capture it.</div>
                        )}
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
                  
                  {activeTab === 'ai' && (
                    <SidebarAgent
                      state={state}
                      duration={duration}
                      playhead={playhead}
                      onToolCalls={handleToolCalls}
                      onOpenSettings={() => setActiveTab('settings')}
                    />
                  )}
                </div>
              ) : (
                <EmptyStateView
                  onRecord={handleRecord}
                  isRecording={isRecording}
                  onVideoImport={handleVideoImport}
                  recordingTimer={formatTime(recordingSeconds)}
                  webcamEnabled={state.webcam.enabled}
                  onToggleWebcam={enabled => dispatch({ type: 'SET_WEBCAM', webcam: { enabled } })}
                />
              )}
              
              {state.videoUrl && (
                <VideoTimeline 
                  duration={duration} 
                  events={state.events} 
                  soundEffects={state.soundEffects}
                  camera={state.camera}
                  tool={activeTab === 'cut' ? 'cut' : activeTab === 'move' ? 'move' : 'select'}
                  onRazor={handleRazor}
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
                  trim={state.trim}
                  onTrimChange={trim => dispatch({ type: 'SET_TRIM', trim })}
                  zoomRegions={state.zoomRegions}
                  onZoomRegionsChange={regions => dispatch({ type: 'SET_ZOOM_REGIONS', regions })}
                  speedRegions={state.speedRegions}
                  onSpeedRegionsChange={regions => dispatch({ type: 'SET_SPEED_REGIONS', regions })}
                  annotations={state.annotations}
                  onAnnotationsChange={annotations => dispatch({ type: 'SET_ANNOTATIONS', annotations })}
                  captions={state.captions}
                  onCaptionsChange={captions => dispatch({ type: 'SET_CAPTIONS', captions })}
                  onAutoZoom={handleAutoZoom}
                  onTranscribe={handleTranscribe}
                  displaySize={state.displaySize}
                  cameraKeyframes={state.cameraKeyframes}
                  onCameraKeyframesChange={keyframes => dispatch({ type: 'SET_CAMERA_KEYFRAMES', keyframes })}
                  motionEffects={state.motionEffects}
                  onMotionEffectsChange={effects => dispatch({ type: 'SET_MOTION_EFFECTS', effects })}
                />
              )}
            </>
          )}
        </div>
      </div>

      <TransportBar
        playhead={playhead}
        duration={duration}
        onSeek={setPlayhead}
        onPlayPause={() => setManualPaused(p => !p)}
        paused={manualPaused || activeTab === 'ai'}
      />

      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          videoPath={state.videoPath}
          micPath={state.micPath}
          events={state.events}
          duration={duration}
          scene={{
            cameraTransform: state.camera,
            isCinematic: state.isCinematic,
            dofEnabled: state.dofEnabled,
            events: state.events,
            displaySize: state.displaySize,
            trim: state.trim,
            zoomRegions: state.zoomRegions,
            speedRegions: state.speedRegions,
            annotations: state.annotations,
            captions: state.captions,
            frame: state.frame,
            webcam: state.webcam,
            webcamPath: state.webcamPath,
            cameraKeyframes: state.cameraKeyframes,
            motionEffects: state.motionEffects,
            soundEffects: state.soundEffects,
          }}
        />
      )}
    </div>
  );
}
