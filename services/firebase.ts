import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export interface GoogleAuthResult {
  email: string;
  displayName: string;
  photoURL: string | null;
  uid: string;
}

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  const result = await signInWithPopup(auth, googleProvider);
  return {
    email: result.user.email || '',
    displayName: result.user.displayName || '',
    photoURL: result.user.photoURL,
    uid: result.user.uid,
  };
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}
