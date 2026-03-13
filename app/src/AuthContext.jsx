import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    // Handle redirect result from Google sign-in
    getRedirectResult(auth).catch(() => {});
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return unsubscribe;
  }, []);

  const signInWithGoogle = () => signInWithRedirect(auth, googleProvider);
  const signOut = () => firebaseSignOut(auth);
  const signUpWithEmail = (email, password, displayName) =>
    createUserWithEmailAndPassword(auth, email, password).then((cred) =>
      displayName ? updateProfile(cred.user, { displayName }) : cred
    );
  const signInWithEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  return (
    <AuthContext.Provider value={{ user, signInWithGoogle, signOut, signUpWithEmail, signInWithEmail }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
