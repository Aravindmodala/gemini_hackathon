import { useState, useRef, useCallback, useEffect } from 'react';
import { useAvatarStore } from '../store/useAvatarStore';

const PLAYBACK_SAMPLE_RATE = 24000;
const CAPTURE_SAMPLE_RATE = 16000;

export function useStoryteller() {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error'>('disconnected');
  const [logs, setLogs] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  // Audio Analyzer for visualizing / lip-syncing playback
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const cleanup = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    if (playbackContextRef.current) {
      playbackContextRef.current.close().catch(console.error);
      playbackContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    wsRef.current = null;
    nextPlayTimeRef.current = 0;
    setStatus('disconnected');
    useAvatarStore.getState().setAction('Idle');
    useAvatarStore.getState().setLipSyncVolume(0);
  }, []);

  const stopStory = useCallback(() => {
    addLog('Stopping story...');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    cleanup();
  }, [addLog, cleanup]);

  const startStory = useCallback(async () => {
    try {
      setStatus('connecting');
      addLog('Requesting microphone access...');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: CAPTURE_SAMPLE_RATE },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;
      addLog('Microphone access granted');

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const inputSampleRate = audioCtx.sampleRate;

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      scriptProcessor.onaudioprocess = (event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);
        let downsampled = inputData;

        // Downsample if native rate is different
        if (inputSampleRate !== CAPTURE_SAMPLE_RATE) {
          const ratio = inputSampleRate / CAPTURE_SAMPLE_RATE;
          const newLength = Math.round(inputData.length / ratio);
          downsampled = new Float32Array(newLength);
          for (let i = 0; i < newLength; i++) {
            const srcIndex = i * ratio;
            const low = Math.floor(srcIndex);
            const high = Math.min(low + 1, inputData.length - 1);
            const frac = srcIndex - low;
            downsampled[i] = inputData[low] * (1 - frac) + inputData[high] * frac;
          }
        }

        // Float32 to Int16 PCM
        const pcm16 = new Int16Array(downsampled.length);
        for (let i = 0; i < downsampled.length; i++) {
          const s = Math.max(-1, Math.min(1, downsampled[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // ArrayBuffer to Base64
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);

        wsRef.current.send(JSON.stringify({ type: 'audio', data: base64Audio }));
      };

      sourceNode.connect(scriptProcessor);
      scriptProcessor.connect(audioCtx.destination);

      // WebSocket connection
      // Backend FastAPI server runs on port 3001
      const wsUrl = `ws://localhost:3001/ws`;
      addLog(`Connecting WebSocket to ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const playbackCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: PLAYBACK_SAMPLE_RATE,
      });
      playbackContextRef.current = playbackCtx;
      nextPlayTimeRef.current = 0;

      // Setup Analytics for Lip-Sync
      const analyser = playbackCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.connect(playbackCtx.destination);
      analyserRef.current = analyser;

      const analyzeAudio = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        
        // Normalize volume (0 to 1 roughly)
        const volume = Math.min(1, average / 128);
        useAvatarStore.getState().setLipSyncVolume(volume);

        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
      };
      analyzeAudio();

      ws.onopen = () => {
        addLog('WebSocket connected to server');
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'status':
            if (msg.status === 'connected') {
              setStatus('connected');
              addLog('Server connected to Gemini');
            } else if (msg.status === 'ready') {
              setStatus('listening');
              useAvatarStore.getState().setAction('Idle');
              addLog('Gemini session ready — speak now!');
            } else if (msg.status === 'turn_complete') {
              setStatus('listening');
              useAvatarStore.getState().setAction('Idle');
              addLog('Chronicler finished speaking');
            }
            break;

          case 'audio':
            setStatus('speaking');
            useAvatarStore.getState().setAction('Talking');
            
            // Base64 to ArrayBuffer
            const binaryStr = atob(msg.data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const int16 = new Int16Array(bytes.buffer);

            // Int16 to Float32
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
              float32[i] = int16[i] / 32768;
            }

            const audioBuffer = playbackCtx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
            audioBuffer.getChannelData(0).set(float32);

            const source = playbackCtx.createBufferSource();
            source.buffer = audioBuffer;
            // Connect to analyser instead of destination directly
            source.connect(analyser);

            const now = playbackCtx.currentTime;
            const startTime = Math.max(now, nextPlayTimeRef.current);
            source.start(startTime);

            nextPlayTimeRef.current = startTime + audioBuffer.duration;
            break;

          case 'tool_event':
            addLog(`Tool called: ${msg.name}`);
            break;

          case 'error':
            addLog(`Error: ${msg.message}`);
            setStatus('error');
            break;
        }
      };

      ws.onerror = () => {
        addLog('WebSocket error');
        setStatus('error');
      };

      ws.onclose = () => {
        addLog('WebSocket closed');
        cleanup();
      };
    } catch (err: any) {
      addLog(`Error: ${err.message}`);
      setStatus('error');
      cleanup();
    }
  }, [addLog, cleanup]);

  // Clean up on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const sendImage = useCallback((file: File) => {
    if (!file) return;
    addLog(`Uploading ${file.name}...`);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      
      if (!match) {
        addLog('Failed to parse image data format');
        return;
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ 
          type: 'image', 
          mimeType: match[1],
          data: match[2] 
        }));
        addLog(`📸 Sent image`);
      }
    };
    reader.readAsDataURL(file);
  }, [addLog]);

  return {
    status,
    logs,
    startStory,
    stopStory,
    sendImage
  };
}
