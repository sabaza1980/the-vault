import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { auth, googleProvider } from './firebase';

const isNative = Capacitor.isNativePlatform();

import { publishSession, adoptSession, endSession } from './session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    // One sign-in covers myvaults.io and app.myvaults.io. Signing in here
    // publishes the session so the other origin picks it up; arriving here
    // already signed in over there adopts it.
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      if (u) publishSession(u);
      else adoptSession();   // 204 for a visitor who simply is not signed in
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    if (isNative) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const result = await FirebaseAuthentication.signInWithGoogle();
      const credential = GoogleAuthProvider.credential(
        result.credential?.idToken,
        result.credential?.accessToken
      );
      return signInWithCredential(auth, credential);
    }
    return signInWithPopup(auth, googleProvider);
  };
  // Signing out has to end the shared session too, or the other origin would
  // sign this browser straight back in.
  const signOut = async () => {
    await endSession();
    return firebaseSignOut(auth);
  };
  const signUpWithEmail = (email, password, displayName) =>
    createUserWithEmailAndPassword(auth, email, password).then((cred) =>
      displayName ? updateProfile(cred.user, { displayName }) : cred
    );
  const signInWithEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  return (
    <AuthContext.Provider value={{ user, signInWithGoogle, signOut, signUpWithEmail, signInWithEmail, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
