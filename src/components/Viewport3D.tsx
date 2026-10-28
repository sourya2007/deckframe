import { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import { EffectComposer, DepthOfField, Glitch, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { CameraTransform } from '../types/project';

interface Viewport3DProps {
  videoUrl: string | null;
  cameraTransform: CameraTransform;
  isCinematic: boolean;
  dofEnabled: boolean;
  playhead: number;
  activeEffect?: string | null;
  // export window: reuse a video element owned by the caller (its audio feeds
  // MediaRecorder), play at its own rate (freeRun), and expose the canvas
  externalVideo?: HTMLVideoElement | null;
  freeRun?: boolean;
  onCanvas?: (canvas: HTMLCanvasElement) => void;
}

function VideoPlane({ url, playhead, externalVideo, freeRun }: { url: string | null; playhead: number; externalVideo?: HTMLVideoElement | null; freeRun?: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);

  useEffect(() => {
    if (!url && !externalVideo) return;
    const video = externalVideo ?? document.createElement('video');
    if (!externalVideo) {
      video.src = url!;
      video.crossOrigin = 'Anonymous';
      video.muted = true;
      video.play();
    }
    videoRef.current = video;

    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    textureRef.current = texture;

    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.map = texture;
      mat.needsUpdate = true;
    }

    return () => {
      if (!externalVideo) video.pause();
      texture.dispose();
    };
  }, [url, externalVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || freeRun) return; // export window: video plays on its own clock
    const target = playhead / 1000;
    if (Math.abs(video.currentTime - target) > 0.3) {
      video.currentTime = target;
    }
  }, [playhead, url, freeRun]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[16, 9]} />
      <meshBasicMaterial color={0xffffff} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CameraRig({ transform }: { transform: CameraTransform }) {
  const lastRef = useRef<CameraTransform | null>(null);

  useFrame(({ camera }) => {
    const t = transform;
    const last = lastRef.current;
    if (
      last &&
      last.position[0] === t.position[0] &&
      last.position[1] === t.position[1] &&
      last.position[2] === t.position[2] &&
      last.rotation[0] === t.rotation[0] &&
      last.rotation[1] === t.rotation[1] &&
      last.rotation[2] === t.rotation[2] &&
      last.zoom === t.zoom
    ) return;

    camera.position.set(t.position[0], t.position[1], t.position[2]);
    camera.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2]);
    camera.zoom = t.zoom;
    camera.updateProjectionMatrix();
    lastRef.current = { ...t };
  });
  return null;
}

export function Viewport3D({ videoUrl, cameraTransform, isCinematic, dofEnabled, playhead, activeEffect, externalVideo, freeRun, onCanvas }: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onCanvas) return;
    const canvas = containerRef.current?.querySelector('canvas');
    if (canvas) onCanvas(canvas);
  }, [onCanvas]);

  return (
    <div ref={containerRef} className="w-full h-full bg-neutral-950">
      <Canvas>
        {isCinematic ? (
          <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={50} />
        ) : (
          <OrthographicCamera makeDefault position={[0, 0, 10]} zoom={50} />
        )}
        
        <CameraRig transform={cameraTransform} />
        
        <ambientLight intensity={1} />
        
        <VideoPlane url={videoUrl} playhead={playhead} externalVideo={externalVideo} freeRun={freeRun} />

        {(isCinematic || activeEffect === 'Glitch' || activeEffect === 'ChromaticAberration') && (
          <EffectComposer>
            <>
              {isCinematic && dofEnabled && <DepthOfField focusDistance={0} focalLength={0.02} bokehScale={2} height={480} />}
              {isCinematic && <Vignette eskil={false} offset={0.5} darkness={0.5} />}
              {activeEffect === 'Glitch' && <Glitch />}

            </>
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
