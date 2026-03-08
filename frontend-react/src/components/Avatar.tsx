import { useRef, useEffect } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAvatarStore } from '../store/useAvatarStore';

const AVATAR_URL = 'https://storage.googleapis.com/storyteller-avatars/69a498bf2b9bcc76d542b064.glb';

// How long the entrance slide-in takes (seconds)
const ENTRY_DURATION = 1.8;
const ENTRY_START_X = -7;

export function Avatar(props: any) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(AVATAR_URL);
  const { actions } = useAnimations(animations, group);

  // ── Global state ──────────────────────────────────────────────
  const currentEmotion = useAvatarStore((s) => s.currentEmotion);
  const lipSyncVolume = useAvatarStore((s) => s.lipSyncVolume);

  // ── Bone refs ─────────────────────────────────────────────────
  const spineRef = useRef<THREE.Bone | null>(null);
  const headRef  = useRef<THREE.Bone | null>(null);
  const rightArmRef = useRef<THREE.Bone | null>(null);
  const leftArmRef  = useRef<THREE.Bone | null>(null);
  const rightForeArmRef = useRef<THREE.Bone | null>(null);
  const leftForeArmRef  = useRef<THREE.Bone | null>(null);

  // ── Morph target refs ─────────────────────────────────────────
  const faceMeshRef  = useRef<THREE.Mesh | null>(null);
  const teethMeshRef = useRef<THREE.Mesh | null>(null);

  // ── Entrance animation state ───────────────────────────────────
  const entryProgress = useRef(0); // 0 → 1
  const entryDone     = useRef(false);
  const wavePhase     = useRef(false);
  const waveTimer     = useRef(0);

  // ── Blink state ───────────────────────────────────────────────
  const blinkTimer    = useRef(Math.random() * 3 + 2); // next blink in 2–5s
  const blinkProgress = useRef(0); // 0=open, 1=closed

  // ── One-time setup ─────────────────────────────────────────────
  useEffect(() => {
    scene.traverse((child: any) => {
      if (!child.isMesh) return;
      child.castShadow    = true;
      child.receiveShadow = true;
      child.frustumCulled = false;

      if (child.morphTargetDictionary) {
        const keys = Object.keys(child.morphTargetDictionary);
        // Log so we can see what morph target names the model has
        if (keys.length > 5) {
          console.log('[Avatar] Morph targets on', child.name, ':', keys);
        }
        if (child.name.toLowerCase().includes('head') ||
            child.name.toLowerCase().includes('face') ||
            child.name.toLowerCase().includes('wolf3d_head')) {
          faceMeshRef.current = child;
        }
        if (child.name.toLowerCase().includes('teeth')) {
          teethMeshRef.current = child;
        }
      }
    });

    // Fallback: if name-based detection failed, take the mesh with the most morph targets
    if (!faceMeshRef.current) {
      let best: THREE.Mesh | null = null;
      let count = 0;
      scene.traverse((child: any) => {
        if (child.isMesh && child.morphTargetDictionary) {
          const n = Object.keys(child.morphTargetDictionary).length;
          if (n > count) { count = n; best = child; }
        }
      });
      faceMeshRef.current = best;
      if (best) console.log('[Avatar] Fallback face mesh:', (best as any).name);
    }

    // Find bones
    scene.traverse((child: any) => {
      if (!child.isBone) return;
      const n = child.name;
      if (/spine/i.test(n) && !/spine[12]/i.test(n)) spineRef.current = child;
      if (/head$/i.test(n)) headRef.current = child;
      if (/rightarm$/i.test(n) || /right_arm$/i.test(n)) rightArmRef.current = child;
      if (/leftarm$/i.test(n)  || /left_arm$/i.test(n))  leftArmRef.current  = child;
      if (/rightforearm$/i.test(n)) rightForeArmRef.current = child;
      if (/leftforearm$/i.test(n))  leftForeArmRef.current  = child;
    });

    // Rest-pose arms (otherwise T-pose)
    if (rightArmRef.current) {
      rightArmRef.current.rotation.set(1.2, 0, -0.2);
    }
    if (leftArmRef.current) {
      leftArmRef.current.rotation.set(1.2, 0, 0.2);
    }
    if (rightForeArmRef.current) rightForeArmRef.current.rotation.z = 0.1;
    if (leftForeArmRef.current)  leftForeArmRef.current.rotation.z  = -0.1;

    // Start off-screen left
    if (group.current) {
      group.current.position.x = ENTRY_START_X;
    }
  }, [scene]);

  // ── Play default idle animation (if any) ──────────────────────
  useEffect(() => {
    const keys = Object.keys(actions);
    console.log('[Avatar] Available animations:', keys);
    if (keys.length === 0) return;

    // Prefer 'Idle' by name, otherwise fallback to first clip
    const idleKey = keys.find(k => /idle/i.test(k)) ?? keys[0];
    const idle = actions[idleKey];
    if (idle) {
      idle.reset().fadeIn(0.6).play();
      console.log('[Avatar] Playing animation:', idleKey);
    }
    return () => { idle?.fadeOut(0.5); };

  }, [actions]);

  // ── Main per-frame loop ────────────────────────────────────────
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // ── 1. Entrance Slide-in ─────────────────────────────────
    if (!entryDone.current) {
      entryProgress.current = Math.min(1, entryProgress.current + delta / ENTRY_DURATION);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - entryProgress.current, 3);
      if (group.current) {
        group.current.position.x = THREE.MathUtils.lerp(ENTRY_START_X, 0, ease);
      }
      if (entryProgress.current >= 1) {
        entryDone.current = true;
        wavePhase.current = true;
        waveTimer.current = 0;
      }
    }

    // ── 2. Wave gesture after arrival ────────────────────────
    if (wavePhase.current) {
      waveTimer.current += delta;
      const waveDuration = 2.2; // seconds of waving
      if (waveTimer.current < waveDuration && rightArmRef.current) {
        // Raise right arm up and oscillate = wave
        const waveAngle = Math.sin(waveTimer.current * 6) * 0.35;
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x, -0.6 + waveAngle, 0.15
        );
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.z, -1.2, 0.1
        );
      } else if (waveTimer.current >= waveDuration) {
        // Return arm to resting position
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
            rightArmRef.current.rotation.x, 1.2, 0.05
          );
          rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
            rightArmRef.current.rotation.z, -0.2, 0.05
          );
        }
        if (waveTimer.current > waveDuration + 1.5) {
          wavePhase.current = false;
        }
      }
    }

    // ── 3. Procedural Breathing ──────────────────────────────
    if (spineRef.current) {
      spineRef.current.rotation.x = THREE.MathUtils.lerp(
        spineRef.current.rotation.x,
        Math.sin(t * 1.8) * 0.025,
        0.08
      );
    }

    // ── 4. Head Mouse Tracking ───────────────────────────────
    if (headRef.current) {
      const mx = (state.pointer.x * Math.PI) / 10;
      const my = -(state.pointer.y * Math.PI) / 12;
      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, mx, 0.04);
      headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, my, 0.04);
    }

    // ── 5. Morph Targets: Emotions + Blink + Lip Sync ────────
    const face = faceMeshRef.current;
    if (!face?.morphTargetDictionary || !face?.morphTargetInfluences) return;

    const dict = face.morphTargetDictionary;
    const inf  = face.morphTargetInfluences!;

    // Build target emotion influences
    const targets: Record<string, number> = {};

    // Helper that checks multiple possible key names (RPM versions vary)
    const key = (...names: string[]) => names.find(n => dict[n] !== undefined);

    if (currentEmotion === 'happy') {
      const smileKey = key('smile', 'mouthSmile', 'Smile', 'MouthSmile',
                          'mouthSmileLeft', 'mouthSmileRight');
      if (smileKey) targets[smileKey] = 0.85;
      const smileL = key('mouthSmileLeft');
      const smileR = key('mouthSmileRight');
      if (smileL) targets[smileL] = 0.85;
      if (smileR) targets[smileR] = 0.85;
      const browUp = key('browInnerUp', 'BrowInnerUp');
      if (browUp) targets[browUp] = 0.3;
    } else if (currentEmotion === 'sad') {
      const browUp = key('browInnerUp', 'BrowInnerUp');
      if (browUp) targets[browUp] = 0.8;
      const frown = key('mouthFrownLeft', 'mouthFrownRight', 'mouthFrown', 'MouthFrown');
      if (frown) targets[frown] = 0.7;
      const mouthFrownL = key('mouthFrownLeft');
      const mouthFrownR = key('mouthFrownRight');
      if (mouthFrownL) targets[mouthFrownL] = 0.7;
      if (mouthFrownR) targets[mouthFrownR] = 0.7;
      const pout = key('mouthPucker', 'MouthPucker');
      if (pout) targets[pout] = 0.3;
    } else if (currentEmotion === 'surprised') {
      const jawOpen = key('jawOpen', 'JawOpen', 'viseme_aa');
      if (jawOpen) targets[jawOpen] = 0.55;
      const browOutL = key('browOuterUpLeft', 'BrowOuterUpLeft');
      const browOutR = key('browOuterUpRight', 'BrowOuterUpRight');
      const browInUp = key('browInnerUp', 'BrowInnerUp');
      if (browOutL) targets[browOutL] = 0.9;
      if (browOutR) targets[browOutR] = 0.9;
      if (browInUp) targets[browInUp] = 0.7;
      const wideL = key('eyeWideLeft', 'EyeWideLeft');
      const wideR = key('eyeWideRight', 'EyeWideRight');
      if (wideL) targets[wideL] = 0.8;
      if (wideR) targets[wideR] = 0.8;
    }
    // neutral → targets stays empty = all lerp to 0

    // ── Blink ────────────────────────────────────────────────
    blinkTimer.current -= delta;
    if (blinkTimer.current <= 0) {
      blinkProgress.current = 1; // trigger blink
      blinkTimer.current = Math.random() * 4 + 2.5;
    }
    if (blinkProgress.current > 0) {
      blinkProgress.current = Math.max(0, blinkProgress.current - delta * 8);
      const blinkVal = Math.sin(blinkProgress.current * Math.PI);
      const blL = key('eyeBlinkLeft', 'EyeBlinkLeft');
      const blR = key('eyeBlinkRight', 'EyeBlinkRight');
      if (blL) targets[blL] = blinkVal;
      if (blR) targets[blR] = blinkVal;
    }

    // ── Lip Sync ─────────────────────────────────────────────
    if (lipSyncVolume > 0.01) {
      const jawKey = key('jawOpen', 'JawOpen', 'viseme_aa');
      if (jawKey) {
        const targetJaw = Math.min(1, lipSyncVolume * 1.6);
        targets[jawKey] = Math.max(targets[jawKey] ?? 0, targetJaw);
      }
    }

    // ── Apply: lerp all influences toward targets ─────────────
    for (let i = 0; i < inf.length; i++) {
      inf[i] = THREE.MathUtils.lerp(inf[i], 0, 0.12); // decay toward 0
    }
    for (const [morphKey, targetVal] of Object.entries(targets)) {
      const idx = dict[morphKey];
      if (idx !== undefined) {
        inf[idx] = THREE.MathUtils.lerp(inf[idx], targetVal, 0.18);
      }
    }

    // Mirror jaw to teeth
    const teethFace = teethMeshRef.current;
    if (teethFace?.morphTargetDictionary && teethFace?.morphTargetInfluences) {
      const td = teethFace.morphTargetDictionary;
      const ti = teethFace.morphTargetInfluences!;
      const jawKey = key('jawOpen', 'JawOpen');
      if (jawKey !== undefined) {
        const srcIdx = dict[jawKey];
        const dstIdx = td[jawKey];
        if (srcIdx !== undefined && dstIdx !== undefined) {
          ti[dstIdx] = inf[srcIdx];
        }
      }
    }
  });

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(AVATAR_URL);
