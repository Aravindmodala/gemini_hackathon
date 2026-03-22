import { render } from '@testing-library/react';
import * as THREE from 'three';

const { mockScene, mockHeadMesh, mockBodyMesh, mockTeethMesh, mockHairMesh, mockOutfitMesh } =
  vi.hoisted(() => {
    const makeMat = () => ({
      map: null,
      normalMap: null,
      roughnessMap: null,
      metalnessMap: null,
      aoMap: null,
      transparent: false,
      alphaTest: 0,
      side: 0,
      dispose: vi.fn(),
    });

    const headMesh = {
      name: 'Wolf3D_Head',
      isMesh: true,
      castShadow: false,
      receiveShadow: false,
      frustumCulled: true,
      material: makeMat() as any,
      morphTargetDictionary: { jawOpen: 0, mouthSmileLeft: 1 },
      morphTargetInfluences: [0, 0],
    };

    const bodyMesh = {
      name: 'Wolf3D_Body',
      isMesh: true,
      castShadow: false,
      receiveShadow: false,
      frustumCulled: true,
      material: makeMat() as any,
    };

    const teethMesh = {
      name: 'Wolf3D_Teeth',
      isMesh: true,
      castShadow: false,
      receiveShadow: false,
      frustumCulled: true,
      material: makeMat() as any,
      morphTargetDictionary: { jawOpen: 0 },
      morphTargetInfluences: [0],
    };

    const hairMesh = {
      name: 'Wolf3D_Hair',
      isMesh: true,
      castShadow: false,
      receiveShadow: false,
      frustumCulled: true,
      material: makeMat() as any,
    };

    const outfitMesh = {
      name: 'Wolf3D_Outfit_Top',
      isMesh: true,
      castShadow: false,
      receiveShadow: false,
      frustumCulled: true,
      material: makeMat() as any,
    };

    const children = [headMesh, bodyMesh, teethMesh, hairMesh, outfitMesh];
    const scene = {
      traverse: (cb: (child: any) => void) => children.forEach(cb),
    };

    return {
      mockScene: scene,
      mockHeadMesh: headMesh,
      mockBodyMesh: bodyMesh,
      mockTeethMesh: teethMesh,
      mockHairMesh: hairMesh,
      mockOutfitMesh: outfitMesh,
    };
  });

const makeFreshMat = () => ({
  map: null,
  normalMap: null,
  roughnessMap: null,
  metalnessMap: null,
  aoMap: null,
  transparent: false,
  alphaTest: 0,
  side: 0,
  dispose: vi.fn(),
});

let capturedFrameCallback: ((state: any, delta: number) => void) | null = null;

vi.mock('@react-three/drei', () => {
  const useGLTF = () => ({ scene: mockScene, animations: [] });
  useGLTF.preload = vi.fn();
  return { useGLTF, useAnimations: () => ({ actions: {} }) };
});

vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: (state: any, delta: number) => void) => {
    capturedFrameCallback = cb;
  },
}));

import { Avatar } from '../Avatar';

describe('Avatar', () => {
  beforeEach(() => {
    capturedFrameCallback = null;
    mockHeadMesh.material = makeFreshMat() as any;
    mockBodyMesh.material = makeFreshMat() as any;
    mockTeethMesh.material = makeFreshMat() as any;
    mockHairMesh.material = makeFreshMat() as any;
    mockOutfitMesh.material = makeFreshMat() as any;
  });

  // ── Basic rendering ────────────────────────────────────────
  it('renders without crashing', () => {
    const { container } = render(<Avatar />);
    expect(container).toBeTruthy();
  });

  // ── Skin mesh targeting (allowlist) ─────────────────────────
  it('overrides Wolf3D_Head material with MeshPhysicalMaterial', () => {
    render(<Avatar />);
    expect(mockHeadMesh.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('overrides Wolf3D_Body material with MeshPhysicalMaterial', () => {
    render(<Avatar />);
    expect(mockBodyMesh.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('does NOT replace Wolf3D_Teeth with MeshPhysicalMaterial', () => {
    render(<Avatar />);
    expect(mockTeethMesh.material).not.toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('does NOT replace Wolf3D_Hair with MeshPhysicalMaterial', () => {
    render(<Avatar />);
    expect(mockHairMesh.material).not.toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  it('does NOT replace Wolf3D_Outfit_Top with MeshPhysicalMaterial', () => {
    render(<Avatar />);
    expect(mockOutfitMesh.material).not.toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });

  // ── SSS material properties ─────────────────────────────────
  it('applies roughness 0.45 to skin material', () => {
    render(<Avatar />);
    const mat = mockHeadMesh.material as THREE.MeshPhysicalMaterial;
    expect(mat.roughness).toBe(0.45);
  });

  it('applies transmission 0.1 for subsurface scattering', () => {
    render(<Avatar />);
    const mat = mockHeadMesh.material as THREE.MeshPhysicalMaterial;
    expect(mat.transmission).toBe(0.1);
  });

  it('applies thickness 0.5 for subsurface scattering depth', () => {
    render(<Avatar />);
    const mat = mockHeadMesh.material as THREE.MeshPhysicalMaterial;
    expect(mat.thickness).toBe(0.5);
  });

  it('applies envMapIntensity 1.5 for better reflections', () => {
    render(<Avatar />);
    const mat = mockHeadMesh.material as THREE.MeshPhysicalMaterial;
    expect(mat.envMapIntensity).toBe(1.5);
  });

  // ── Material lifecycle (dispose) ────────────────────────────
  it('disposes old material when replacing with MeshPhysicalMaterial', () => {
    const oldHeadMat = mockHeadMesh.material;
    const oldBodyMat = mockBodyMesh.material;
    render(<Avatar />);
    expect(oldHeadMat.dispose).toHaveBeenCalledOnce();
    expect(oldBodyMat.dispose).toHaveBeenCalledOnce();
  });

  it('disposes shared old material only once', () => {
    const shared = makeFreshMat() as any;
    mockHeadMesh.material = shared;
    mockBodyMesh.material = shared;

    render(<Avatar />);

    expect(shared.dispose).toHaveBeenCalledTimes(1);
  });

  it('does NOT dispose materials on non-skin meshes', () => {
    const oldHairMat = mockHairMesh.material;
    const oldOutfitMat = mockOutfitMesh.material;
    render(<Avatar />);
    expect(oldHairMat.dispose).not.toHaveBeenCalled();
    expect(oldOutfitMat.dispose).not.toHaveBeenCalled();
  });

  // ── useFrame registration ───────────────────────────────────
  it('registers a useFrame callback for animation', () => {
    render(<Avatar />);
    expect(capturedFrameCallback).toBeTypeOf('function');
  });

  it('does not crash when useFrame callback runs', () => {
    render(<Avatar />);
    expect(capturedFrameCallback).not.toBeNull();

    const mockState = {
      clock: { getElapsedTime: () => 1.0 },
      pointer: { x: 0, y: 0 },
    };
    expect(() => capturedFrameCallback!(mockState, 0.016)).not.toThrow();
  });
});
