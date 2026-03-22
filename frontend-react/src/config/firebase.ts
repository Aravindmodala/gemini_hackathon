import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// Validate required config — fail fast with a clear message
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    '[Firebase] Missing required config. Check that VITE_FIREBASE_API_KEY and ' +
    'VITE_FIREBASE_PROJECT_ID are set in frontend-react/.env. ' +
    'See .env.example for reference.'
  );
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
