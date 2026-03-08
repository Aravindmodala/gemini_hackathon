// import { useRef } from 'react';
// import { Scene } from './components/Scene';
import { AvatarHUD } from './components/AvatarHUD';
import { useStoryteller } from './hooks/useStoryteller';
import { useAvatarStore } from './store/useAvatarStore';
import './App.css';

function App() {
  const { status, startStory, stopStory } = useStoryteller();
  const setEmotion = useAvatarStore((s) => s.setEmotion);
  const currentEmotion = useAvatarStore((s) => s.currentEmotion);

  return (
    <div className="app-root">
      {/* Full-screen 3D canvas (Temporarily disabled for testing) */}
      {/* <Scene /> */}

      {/* Top-left title badge */}
      <header className="app-header">
        <div className="title-badge">
          <span className="title-badge__gem">✦</span>
          <div>
            <h1 className="app-title">The Emotional Chronicler</h1>
            <p className="app-subtitle">Immersive AI Storytelling</p>
          </div>
        </div>
      </header>

      {/* Connection status dot — top right */}
      <div className={`conn-dot conn-dot--${status}`}>
        <span className="conn-dot__orb" />
        <span className="conn-dot__label">{status.toUpperCase()}</span>
      </div>

      {/* Floating Talk button over avatar */}
      <AvatarHUD
        status={status}
        onStart={startStory}
        onStop={stopStory}
      />

      {/* Dev emotion controls — bottom left corner, subtle */}
      <div className="dev-emotions">
        {(['neutral', 'happy', 'sad', 'surprised'] as const).map((e) => (
          <button
            key={e}
            className={`emo-btn ${currentEmotion === e ? 'emo-btn--active' : ''}`}
            onClick={() => setEmotion(e)}
          >
            {e === 'neutral'   && '😐'}
            {e === 'happy'     && '😊'}
            {e === 'sad'       && '😢'}
            {e === 'surprised' && '😲'}
          </button>
        ))}
      </div>
    </div>
  );
}

export default App;
