import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Environment,
  ContactShadows,
  Sparkles,
  Float,
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { Vector2 } from 'three';
import { BookMesh, B } from './BookMesh';
import { OpenPages } from './OpenPages';
import type { BookPage } from '../../utils/storyToPages';

interface BookSceneProps {
  title?: string;
  isOpen: boolean;
  isOpening: boolean;
  isClosing: boolean;
  pages: BookPage[];
  currentPageIdx: number;
  isFlippingNext: boolean;
  isFlippingPrev: boolean;
}

// ── Camera controller ─────────────────────────────────────────
function CameraController({ isOpen, isOpening }: { isOpen: boolean; isOpening: boolean }) {
  const { camera } = useThree();
  const targetRef = useRef({ x: 0, y: 0.3, z: 5.5 });
  const lookRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen || isOpening) {
      targetRef.current = { x: 0, y: 0.05, z: 4.9 };
      lookRef.current = { x: 0, y: 0 };
    } else {
      targetRef.current = { x: 0, y: 0.3, z: 5.5 };
      lookRef.current = { x: 0, y: 0.15 };
    }
  }, [isOpen, isOpening]);

  useFrame(() => {
    const L = 0.035;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetRef.current.x, L);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetRef.current.y, L);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetRef.current.z, L);
    camera.lookAt(lookRef.current.x, lookRef.current.y, 0);
  });

  return null;
}

// ── Floating book (idle bob when closed, shifting group when open) ──
interface FloatingBookProps {
  title?: string;
  isOpen: boolean;
  isOpening: boolean;
  isClosing: boolean;
  pages: BookPage[];
  currentPageIdx: number;
  isFlippingNext: boolean;
  isFlippingPrev: boolean;
}

function FloatingBook({
  title,
  isOpen,
  isOpening,
  isClosing,
  pages,
  currentPageIdx,
  isFlippingNext,
  isFlippingPrev,
}: FloatingBookProps) {
  const groupRef = useRef<THREE.Group>(null);
  const isClosed = !isOpen && !isOpening && !isClosing;

  // Animate group X shift (centers the open spread in viewport)
  useFrame(() => {
    if (!groupRef.current) return;
    const targetX = (isOpen || isOpening) ? B.GROUP_X_OPEN : B.GROUP_X_CLOSED;
    groupRef.current.position.x = THREE.MathUtils.lerp(
      groupRef.current.position.x, targetX, 0.038,
    );
  });

  if (isClosed) {
    return (
      <Float
        speed={1.4}
        rotationIntensity={0.06}
        floatIntensity={0.18}
        floatingRange={[-0.06, 0.06]}
      >
        <group rotation={[0, 0.08, 0]}>
          <BookMesh
            title={title}
            isOpen={false}
            isOpening={false}
          />
        </group>
      </Float>
    );
  }

  return (
    <group ref={groupRef}>
      <BookMesh
        title={title}
        isOpen={isOpen}
        isOpening={isOpening}
      />
      <OpenPages
        pages={pages}
        currentPageIdx={currentPageIdx}
        isOpen={isOpen}
        isOpening={isOpening}
        isClosing={isClosing}
        isFlippingNext={isFlippingNext}
        isFlippingPrev={isFlippingPrev}
      />
    </group>
  );
}

// ── PostFX ────────────────────────────────────────────────────
function BookPostFX() {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.92}
        luminanceSmoothing={0.85}
        intensity={0.8}
        blendFunction={BlendFunction.ADD}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={new Vector2(0.0004, 0.0004)}
        radialModulation={false}
        modulationOffset={1}
      />
      <Vignette
        offset={0.38}
        darkness={0.82}
        eskil={false}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}

// ── Main scene ────────────────────────────────────────────────
export function BookScene({
  title,
  isOpen,
  isOpening,
  isClosing,
  pages,
  currentPageIdx,
  isFlippingNext,
  isFlippingPrev,
}: BookSceneProps) {
  return (
    <>
      <CameraController isOpen={isOpen} isOpening={isOpening} />

      {/* ── Lighting ─────────────────────────────────────── */}
      <ambientLight intensity={0.3} color="#a78bfa" />

      <directionalLight
        position={[3, 6, 5]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        intensity={1.0}
        color="#f0e8d8"
      />

      <pointLight position={[-2, 5, -4]} intensity={1.5} color="#7c3aed" />
      <pointLight position={[-5, 2, 3]} intensity={0.8} color="#06b6d4" />

      <spotLight
        position={[0, 5, 6]}
        angle={0.35}
        penumbra={0.6}
        intensity={1.2}
        color="#e8c97e"
        castShadow={false}
        target-position={[0, 0, 0]}
      />

      <pointLight position={[0, -2.5, 2]} intensity={0.4} color="#4f46e5" />

      {/* ── Book ─────────────────────────────────────────── */}
      <FloatingBook
        title={title}
        isOpen={isOpen}
        isOpening={isOpening}
        isClosing={isClosing}
        pages={pages}
        currentPageIdx={currentPageIdx}
        isFlippingNext={isFlippingNext}
        isFlippingPrev={isFlippingPrev}
      />

      {/* ── Environment & atmosphere ──────────────────────── */}
      <Environment preset="night" />

      <Sparkles
        count={60}
        scale={[8, 5, 4]}
        position={[0, 1, -1]}
        size={1.0}
        speed={0.25}
        color="#a78bfa"
        opacity={0.45}
      />
      <Sparkles
        count={30}
        scale={[10, 7, 4]}
        position={[0, 2, -3]}
        size={0.7}
        speed={0.18}
        color="#c8a96e"
        opacity={0.3}
      />

      <ContactShadows
        position={[0, -2.15, 0]}
        opacity={0.5}
        scale={12}
        blur={3}
        far={5}
        color="#1e1040"
      />

      <BookPostFX />
    </>
  );
}