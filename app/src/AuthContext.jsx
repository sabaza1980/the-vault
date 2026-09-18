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

import { publishSession, adoptSession, endSession, verifySession, beginSignIn, endSignInAttempt } from './session';

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
  //
  // The gate opens before Firebase is called, because Firebase fires the
  // auth-state listener the instant the credential lands — earlier than any
  // code here runs. Without it the listener verified against a cookie that did
  // not exist yet and signed the person back out, which is what made a fresh
  // login need a refresh.
  const interactive = async (run) => {
    beginSignIn();
    let cred;
    try {
      cred = await run();
    } catch (e) {
      endSignInAttempt();
      throw e;
    }
    const u = cred?.user || auth.currentUser;
    if (u) await publishSession(u);   // closes the gate
    else endSignInAttempt();
    return cred;
  };

  const signInWithGoogle = () => interactive(async () => {
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
  });
  // Signing out has to end the shared session too, or the other origin would
  // sign this browser straight back in.
  const signOut = async () => {
    await endSession();
    return firebaseSignOut(auth);
  };
  const signUpWithEmail = (email, password, displayName) =>
    interactive(() =>
      createUserWithEmailAndPassword(auth, email, password)
        .then((cred) => (displayName ? updateProfile(cred.user, { displayName }).then(() => cred) : cred))
    );
  const signInWithEmail = (email, password) =>
    interactive(() => signInWithEmailAndPassword(auth, email, password));

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
