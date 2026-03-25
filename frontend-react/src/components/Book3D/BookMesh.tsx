import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createCoverTexture } from './CoverTexture';

// ── Book dimensions ──────────────────────────────────────────
export const B = {
  COV_W: 2.7,
  COV_H: 4.0,
  COV_D: 0.065,
  SPINE_W: 0.22,
  SPINE_H: 4.05,
  PAGES_W: 2.56,
  PAGES_H: 3.92,
  PAGES_D: 0.38,
  // Pivot = left edge of cover (spine hinge)
  PIVOT_X: -1.35,
  PAGE_Z: 0.196,
  // Group X shift when open (centers the spread)
  GROUP_X_OPEN: 1.35,
  GROUP_X_CLOSED: 0,
};

interface BookMeshProps {
  title?: string;
  isOpen: boolean;
  isOpening: boolean;
}

export function BookMesh({ title, isOpen, isOpening }: BookMeshProps) {
  const coverGroupRef = useRef<THREE.Group>(null);
  const coverRotRef = useRef(0);

  // ── Materials ─────────────────────────────────────────────
  const leatherMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#140830'),
    roughness: 0.88,
    metalness: 0.04,
  }), []);

  const leatherRibMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0e051a'),
    roughness: 0.9,
    metalness: 0.02,
  }), []);

  const goldMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c8a96e'),
    roughness: 0.18,
    metalness: 0.92,
    emissive: new THREE.Color('#b08040'),
    emissiveIntensity: 0.4,
  }), []);

  const pageMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d8ccb4'),
    roughness: 0.97,
    metalness: 0,
  }), []);

  const parchmentInsideMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d0c0a8'),
    roughness: 0.96,
    metalness: 0,
  }), []);

  // Cover: 6 materials — [+x, -x, +y, -y, +z (front), -z (back)]
  const coverTexture = useMemo(() => createCoverTexture(title || 'Your Story'), [title]);
  const coverFrontMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: coverTexture,
    roughness: 0.84,
    metalness: 0.06,
  }), [coverTexture]);

  const coverMaterials = useMemo(() => [
    leatherMat,
    leatherMat,
    leatherMat,
    leatherMat,
    coverFrontMat,     // +z = front face (title side)
    parchmentInsideMat, // -z = inside of cover (parchment)
  ], [leatherMat, coverFrontMat, parchmentInsideMat]);

  // ── Cover rotation animation ───────────────────────────────
  useFrame(() => {
    if (!coverGroupRef.current) return;
    const targetRot = (isOpen || isOpening) ? -Math.PI : 0;
    coverRotRef.current = THREE.MathUtils.lerp(coverRotRef.current, targetRot, 0.038);
    coverGroupRef.current.rotation.y = coverRotRef.current;
  });

  return (
    <group>

      {/* ── Spine ─────────────────────────────────────────── */}
      <mesh
        position={[B.PIVOT_X - B.SPINE_W / 2, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[B.SPINE_W, B.SPINE_H, B.PAGES_D + B.COV_D * 2]} />
        <primitive object={leatherRibMat} />
      </mesh>

      {/* Spine gold banding strips */}
      {[-1.3, -0.5, 0.5, 1.3].map((y, i) => (
        <mesh key={i} position={[B.PIVOT_X - B.SPINE_W / 2, y, B.PAGES_D / 2 + B.COV_D + 0.002]}>
          <boxGeometry args={[B.SPINE_W, 0.025, 0.005]} />
          <primitive object={goldMat} />
        </mesh>
      ))}

      {/* Spine gold thread (vertical glow line) */}
      <mesh position={[B.PIVOT_X - B.SPINE_W / 2, 0, B.PAGES_D / 2 + B.COV_D + 0.003]}>
        <planeGeometry args={[0.01, B.SPINE_H * 0.72]} />
        <primitive object={goldMat} />
      </mesh>

      {/* ── Page stack ────────────────────────────────────── */}
      <mesh
        position={[0, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[B.PAGES_W, B.PAGES_H, B.PAGES_D]} />
        <primitive object={pageMat} />
      </mesh>

      {/* ── Back cover ────────────────────────────────────── */}
      <mesh
        position={[0, 0, -(B.PAGES_D / 2 + B.COV_D / 2)]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[B.COV_W, B.COV_H, B.COV_D]} />
        <primitive object={leatherMat} />
      </mesh>

      {/* ── Front cover (pivots open via useFrame lerp) ───────── */}
      <group position={[B.PIVOT_X, 0, 0]}>
        <group ref={coverGroupRef}>
          <mesh
            position={[B.COV_W / 2, 0, B.PAGES_D / 2 + B.COV_D / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[B.COV_W, B.COV_H, B.COV_D]} />
            {coverMaterials.map((mat, i) => (
              <primitive key={i} object={mat} attach={`material-${i}`} />
            ))}
          </mesh>
        </group>
      </group>

    </group>
  );
}
