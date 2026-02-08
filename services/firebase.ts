import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBVdVHpKodbd89EhmCutJewrGNZxyF5zAs",
  authDomain: "social-3315a.firebaseapp.com",
  databaseURL: "https://social-3315a-default-rtdb.firebaseio.com",
  projectId: "social-3315a",
  storageBucket: "social-3315a.firebasestorage.app",
  messagingSenderId: "450321746541",
  appId: "1:450321746541:web:c466a74a203afb7a570d64",
  measurementId: "G-HZ76VE3734",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export interface GoogleAuthResult {
  accessToken: string;
  idToken: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  uid: string;
}

export async function startGoogleSignIn(): Promise<void> {
  await signInWithRedirect(auth, googleProvider);
}

export async function handleGoogleRedirectResult(): Promise<GoogleAuthResult | null> {
  const result = await getRedirectResult(auth);
  if (!result) return null;

  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential) return null;

  return {
    accessToken: credential.accessToken || '',
    idToken: credential.idToken || '',
    email: result.user.email || '',
    displayName: result.user.displayName || '',
    photoURL: result.user.photoURL,
    uid: result.user.uid,
  };
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}
