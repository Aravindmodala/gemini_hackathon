import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import * as THREE from 'three';

const mockCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
mockCamera.position.set(0, 1.0, 3.8);

interface MockRenderState {
  clock: { getElapsedTime: () => number };
  pointer: { x: number; y: number };
}

let capturedFrameCallback: ((state: MockRenderState, delta: number) => void) | null = null;
let mockSizeWidth = 1024;

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
  useThree: () => ({ camera: mockCamera, size: { width: mockSizeWidth, height: 768 } }),
  useFrame: (cb: (state: MockRenderState, delta: number) => void) => {
    capturedFrameCallback = cb;
  },
}));

vi.mock('@react-three/drei', () => ({
  Environment: () => null,
  ContactShadows: () => null,
  Sparkles: () => null,
}));

vi.mock('../PostFX', () => ({ PostFX: () => null }));

vi.mock('../Avatar', () => ({
  Avatar: (props: Record<string, unknown>) => <div data-testid="avatar" {...props} />,
}));

import { ResponsiveCamera, Scene } from '../Scene';

describe('Scene', () => {
  beforeEach(() => {
    capturedFrameCallback = null;
    mockCamera.position.set(0, 1.0, 3.8);
    mockCamera.fov = 55;
    mockSizeWidth = 1024;
  });

  it('renders without crashing', () => {
    const { getByTestId } = render(<Scene />);
    expect(getByTestId('canvas')).toBeTruthy();
  });

  it('renders the Avatar component', () => {
    const { getByTestId } = render(<Scene />);
    expect(getByTestId('avatar')).toBeTruthy();
  });

  it('mounts ResponsiveCamera and registers a frame callback', () => {
    render(<Scene />);
    expect(capturedFrameCallback).toBeTypeOf('function');
  });
});

describe('ResponsiveCamera', () => {
  beforeEach(() => {
    capturedFrameCallback = null;
    mockCamera.position.set(0, 0, 0);
    mockCamera.fov = 55;
    mockSizeWidth = 1024;
  });

  it('mounts without crashing', () => {
    const { container } = render(<ResponsiveCamera />);
    expect(container).toBeTruthy();
  });

  it('registers a useFrame callback', () => {
    render(<ResponsiveCamera />);
    expect(capturedFrameCallback).toBeTypeOf('function');
  });

  it('does NOT call updateProjectionMatrix in useFrame (only position lerp)', () => {
    mockSizeWidth = 1024;
    const updateSpy = vi.spyOn(mockCamera, 'updateProjectionMatrix');
    render(<ResponsiveCamera />);
    updateSpy.mockClear();

    for (let i = 0; i < 10; i++) {
      capturedFrameCallback!(
        { clock: { getElapsedTime: () => 0 }, pointer: { x: 0, y: 0 } },
        0.016,
      );
    }

    expect(updateSpy).not.toHaveBeenCalled();
    updateSpy.mockRestore();
  });

  it('lerps camera toward desktop position when canvas >= 768px', () => {
    mockSizeWidth = 1024;
    render(<ResponsiveCamera />);
    expect(capturedFrameCallback).not.toBeNull();

    for (let i = 0; i < 500; i++) {
      capturedFrameCallback!(
        { clock: { getElapsedTime: () => 0 }, pointer: { x: 0, y: 0 } },
        0.016,
      );
    }

    expect(mockCamera.position.x).toBeCloseTo(0, 1);
    expect(mockCamera.position.y).toBeCloseTo(1.0, 1);
    expect(mockCamera.position.z).toBeCloseTo(3.8, 1);
  });

  it('sets desktop FOV via useEffect (not per-frame)', () => {
    mockSizeWidth = 1024;
    render(<ResponsiveCamera />);
    expect(mockCamera.fov).toBe(55);
  });

  it('sets mobile FOV via useEffect when canvas < 768px', () => {
    mockSizeWidth = 375;
    render(<ResponsiveCamera />);
    expect(mockCamera.fov).toBe(65);
  });

  it('lerps camera toward mobile position when canvas < 768px', () => {
    mockSizeWidth = 375;
    render(<ResponsiveCamera />);
    expect(capturedFrameCallback).not.toBeNull();

    for (let i = 0; i < 500; i++) {
      capturedFrameCallback!(
        { clock: { getElapsedTime: () => 0 }, pointer: { x: 0, y: 0 } },
        0.016,
      );
    }

    expect(mockCamera.position.x).toBeCloseTo(0, 1);
    expect(mockCamera.position.y).toBeCloseTo(1.2, 1);
    expect(mockCamera.position.z).toBeCloseTo(5.5, 1);
  });

  it('camera always looks at the avatar center (0, 1.0, 0)', () => {
    mockSizeWidth = 1024;
    const lookAtSpy = vi.spyOn(mockCamera, 'lookAt');

    render(<ResponsiveCamera />);
    capturedFrameCallback!(
      { clock: { getElapsedTime: () => 0 }, pointer: { x: 0, y: 0 } },
      0.016,
    );

    expect(lookAtSpy).toHaveBeenCalledWith(
      expect.objectContaining({ x: 0, y: 1.0, z: 0 }),
    );
    lookAtSpy.mockRestore();
  });

  it('uses useThree size.width (not window.innerWidth) for breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    mockSizeWidth = 1024;

    render(<ResponsiveCamera />);

    expect(mockCamera.fov).toBe(55);
  });
});
