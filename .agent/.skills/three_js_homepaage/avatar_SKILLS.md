---
title: "three_js_homepage_avatar"
description: >
  This skill enables loading, animating, and controlling a Ready Player Me
  .glb avatar using Three.js / react-three-fiber. The avatar supports:

  - Skeletal animation (idle, walk, run, sit, gestures)
  - Facial expressions via morph targets (blendshapes)
  - Real-time lip sync
  - Emotion-driven facial control
  - Smooth animation blending
---

# 🎭 Avatar Skill – Three.js + Ready Player Me (.glb)

## 1. Avatar Source

- Avatar format: `.glb`
- Generated from: Ready Player Me
- Contains:
  - Skeleton (armature)
  - Morph targets (ARKit compatible blendshapes)
  - Base idle animation

---

## 2. Libraries Used

- three
- @react-three/fiber
- @react-three/drei
- GLTFLoader
- AnimationMixer
- Web Audio API (for lip sync)

---

## 3. Core Responsibilities of This Skill

This skill must:

1. Load `.glb` avatar
2. Initialize animation mixer
3. Detect morph targets
4. Control facial expressions
5. Handle lip sync
6. Blend animations (idle → run → sit)
7. React to emotional state changes

---

# 🧍 4. Loading the Avatar

### React Example

```tsx
import { useGLTF } from "@react-three/drei";
import { useRef, useEffect } from "react";
import * as THREE from "three";

export function Avatar() {
  const group = useRef();
  const { scene, animations } = useGLTF("/assets/avatar.glb");

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.frustumCulled = false;
      }
    });
  }, [scene]);

  return <primitive ref={group} object={scene} />;
}
```

# 🏃 5. Animation System (Run / Sit / Idle)

### Initialize AnimationMixer

```javascript
const mixer = new THREE.AnimationMixer(scene);
const actions = {};

animations.forEach((clip) => {
  actions[clip.name] = mixer.clipAction(clip);
});
```

### Play Animation

```javascript
function playAnimation(name) {
  Object.values(actions).forEach((action) => action.fadeOut(0.3));
  actions[name]?.reset().fadeIn(0.3).play();
}
```

**Example Usage:**

```javascript
playAnimation("Idle");
playAnimation("Run");
playAnimation("Sit");
```

# 😊 6. Facial Expressions (Morph Targets)

Ready Player Me avatars include morph targets like:

- `smile`
- `browInnerUp`
- `mouthOpen`
- `eyeBlinkLeft`
- `eyeBlinkRight`
- `jawOpen`

### Detect Morph Targets

```javascript
let faceMesh;

scene.traverse((child) => {
  if (child.isMesh && child.morphTargetDictionary) {
    faceMesh = child;
  }
});
```

### Trigger Emotion

```javascript
function setEmotion(emotion) {
  const influences = faceMesh.morphTargetInfluences;
  const dict = faceMesh.morphTargetDictionary;

  // Reset
  influences.fill(0);

  if (emotion === "happy") {
    influences[dict["smile"]] = 0.8;
  }

  if (emotion === "sad") {
    influences[dict["browInnerUp"]] = 0.6;
  }

  if (emotion === "surprised") {
    influences[dict["jawOpen"]] = 0.7;
  }
}
```

# 🗣 7. Lip Sync System

### Basic Volume-Based Lip Sync

```javascript
const analyser = audioContext.createAnalyser();
analyser.fftSize = 512;

function updateLipSync() {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);

  const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;
  const mouthOpenIndex = faceMesh.morphTargetDictionary["jawOpen"];

  faceMesh.morphTargetInfluences[mouthOpenIndex] = volume / 255;
}
```

Call `updateLipSync()` every frame.

# 🎬 8. Animation State Machine

The avatar uses a state system:

**States:**

- Idle
- Listening
- Speaking
- Running
- Sitting

**Transitions:**

- Idle → Listening
- Listening → Speaking
- Idle → Run
- Run → Idle

Use `crossFade` for smooth transitions.

# 🧠 9. Emotion Integration from AI

The backend sends:

```json
{
  "emotion": "happy",
  "action": "run"
}
```

**Frontend handler:**

```javascript
setEmotion(data.emotion);
playAnimation(data.action);
```

# ⚡ 10. Performance Optimization

- Disable frustum culling for face mesh
- Use delta-based animation updates
- Keep morph influence resets minimal
- Avoid recreating mixer on every render

# 🏆 11. Expected Behavior

The avatar should:

- ✔ Blink naturally
- ✔ Talk when AI speaks
- ✔ Smile when user is happy
- ✔ Show stress expression
- ✔ Run / Sit smoothly
- ✔ Transition cleanly between states

# 🔒 12. Constraints

- Must remain WebGL compatible
- Must work inside browser
- Must support real-time AI input
- Must allow dynamic animation control

# 🎯 Final Goal

The avatar should behave like a reactive, emotionally aware AI storyteller that:

- Speaks naturally
- Moves fluidly
- Expresses emotion dynamically
- Syncs to live AI audio

---

If you want, I can now:

- Add advanced viseme-based lip sync
- Add IK (inverse kinematics) support
- Or design a full AvatarController class architecture

This will make your Emotional Chronicler feel alive.
