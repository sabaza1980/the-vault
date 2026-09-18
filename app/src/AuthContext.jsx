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

import { publishSession, adoptSession, endSession, verifySession } from './session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    // One sign-in covers myvaults.io and app.myvaults.io. Signing in here
    // publishes the session so the other origin picks it up; arriving here
    // already signed in over there adopts it.
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      // Signed in here: check the shared session still exists. If it does not,
      // somebody signed out on the other origin and this copy has to let go.
      if (u) verifySession(u, () => firebaseSignOut(auth));
      // Signed out here: maybe not over there. 204 for a plain visitor.
      else adoptSession();
    });
    return unsubscribe;
  }, []);

  // Every interactive sign-in publishes the shared session. The auth-state
  // listener only ever verifies, so the two cannot fight over the cookie.
  const afterSignIn = async (cred) => {
    const u = cred?.user || auth.currentUser;
    if (u) await publishSession(u);
    return cred;
  };

  const signInWithGoogle = async () => {
    if (isNative) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const result = await FirebaseAuthentication.signInWithGoogle();
      const credential = GoogleAuthProvider.credential(
        result.credential?.idToken,
        result.credential?.accessToken
      );
      return signInWithCredential(auth, credential).then(afterSignIn);
    }
    return signInWithPopup(auth, googleProvider).then(afterSignIn);
  };
  // Signing out has to end the shared session too, or the other origin would
  // sign this browser straight back in.
  const signOut = async () => {
    await endSession();
    return firebaseSignOut(auth);
  };
  const signUpWithEmail = (email, password, displayName) =>
    createUserWithEmailAndPassword(auth, email, password)
      .then((cred) => (displayName ? updateProfile(cred.user, { displayName }).then(() => cred) : cred))
      .then(afterSignIn);
  const signInWithEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password).then(afterSignIn);

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
