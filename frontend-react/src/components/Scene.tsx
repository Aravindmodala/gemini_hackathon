import { Suspense, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Environment, ContactShadows, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { Avatar } from './Avatar';
import { PostFX } from './PostFX';

const MOBILE_BREAKPOINT = 768;
const DESKTOP_POS: [number, number, number] = [0, 1.0, 3.8];
const MOBILE_POS: [number, number, number] = [0, 1.2, 5.5];
const DESKTOP_FOV = 55;
const MOBILE_FOV = 65;
const LERP_FACTOR = 0.04;
const LOOK_AT = new THREE.Vector3(0, 1.0, 0);

export function ResponsiveCamera() {
  const { camera, size } = useThree();
  const targetPos = useRef<[number, number, number]>(DESKTOP_POS);
  const prevIsMobile = useRef<boolean | null>(null);

  useEffect(() => {
    const isMobile = size.width < MOBILE_BREAKPOINT;
    if (isMobile === prevIsMobile.current) return;
    prevIsMobile.current = isMobile;

    targetPos.current = isMobile ? MOBILE_POS : DESKTOP_POS;

    const perspCam = camera as THREE.PerspectiveCamera;
    if (perspCam.fov !== undefined) {
      perspCam.fov = isMobile ? MOBILE_FOV : DESKTOP_FOV;
      perspCam.updateProjectionMatrix();
    }
  }, [size.width, camera]);

  useFrame(() => {
    const target = targetPos.current;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, target[0], LERP_FACTOR);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, target[1], LERP_FACTOR);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, target[2], LERP_FACTOR);
    camera.lookAt(LOOK_AT);
  });

  return null;
}

export function Scene() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }}>
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false }}
        style={{ background: 'transparent' }}
      >
        <ResponsiveCamera />

        {/* Cinematic ambient */}
        <ambientLight intensity={0.3} color="#a78bfa" />

        {/* Key light — cool white from upper-left */}
        <directionalLight
          position={[-3, 6, 4]}
          castShadow
          shadow-mapSize={[2048, 2048]}
          intensity={2.0}
          color="#e0e8ff"
        />

        {/* Rim light — purple from behind */}
        <pointLight position={[2, 4, -3]} intensity={3} color="#7c3aed" />

        {/* Fill light — teal from right */}
        <pointLight position={[4, 2, 2]} intensity={1.5} color="#06b6d4" />

        {/* Ground bounce */}
        <pointLight position={[0, -1, 1]} intensity={0.5} color="#4f46e5" />

        <Suspense fallback={null}>
          <Avatar position={[0, -0.9, 0]} />

          {/* Studio reflections */}
          <Environment preset="city" />

          {/* Floating particles — magical atmosphere */}
          <Sparkles
            count={80}
            scale={[6, 4, 4]}
            position={[0, 1, -1]}
            size={1.2}
            speed={0.3}
            color="#a78bfa"
            opacity={0.5}
          />
          <Sparkles
            count={40}
            scale={[8, 6, 4]}
            position={[0, 2, -2]}
            size={0.8}
            speed={0.2}
            color="#06b6d4"
            opacity={0.35}
          />

          {/* Ground shadow */}
          <ContactShadows
            position={[0, -0.92, 0]}
            opacity={0.6}
            scale={10}
            blur={2.5}
            far={4}
            color="#1e1040"
          />
        </Suspense>

        {/* Post-processing */}
        <PostFX />
      </Canvas>
    </div>
  );
}
