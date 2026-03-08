import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls, Sparkles } from '@react-three/drei';
import { Avatar } from './Avatar';
import { PostFX } from './PostFX';

export function Scene() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }}>
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false }}
        camera={{ position: [0, 1.0, 3.8], fov: 55 }}
        style={{ background: 'transparent' }}
      >
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

        {/* Orbit controls — limited so you always see the avatar nicely */}
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 2.1}
          target={[0, 1.0, 0]}
        />

        {/* Post-processing */}
        <PostFX />
      </Canvas>
    </div>
  );
}
