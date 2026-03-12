import { useEffect, useRef } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Syncs the in-memory `cards` array with the authenticated user's Firestore
 * sub-collection `users/{uid}/cards`.
 *
 * - On sign-in: loads the user's cards from Firestore into local state.
 * - When local cards are added: upserts to Firestore.
 * - When a local card is removed: deletes from Firestore.
 *
 * Usage inside App's default export:
 *   useFirestoreSync(user, cards, setCards);
 */
export function useFirestoreSync(user, cards, setCards) {
  // skipNextWrite is incremented by the Firestore listener each time it
  // triggers setCards, so the write effect knows to skip that update.
  const skipNextWrite = useRef(0);
  const prevUid = useRef(null);
  const prevCards = useRef([]);

  // --- Listen: Firestore → local state ---
  useEffect(() => {
    if (!user) {
      if (prevUid.current) {
        // User signed out — clear local cards that came from Firestore.
        skipNextWrite.current += 1;
        setCards([]);
        prevCards.current = [];
      }
      prevUid.current = null;
      return;
    }

    prevUid.current = user.uid;
    const q = query(
      collection(db, 'users', user.uid, 'cards'),
      orderBy('addedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
      skipNextWrite.current += 1;
      prevCards.current = loaded; // keep prevCards in sync with Firestore reads
      setCards(loaded);
    });

    return unsubscribe;
  }, [user, setCards]);

  // --- Write & Delete: local state → Firestore ---
  useEffect(() => {
    if (!user) return;

    // This render was triggered by our own Firestore listener — skip.
    if (skipNextWrite.current > 0) {
      skipNextWrite.current -= 1;
      return;
    }

    const colRef = collection(db, 'users', user.uid, 'cards');

    // Upsert cards that are new or changed.
    cards.forEach((card) => {
      const { id, ...data } = card;
      setDoc(doc(colRef, String(id)), data, { merge: true }).catch(console.error);
    });

    // Delete cards that were removed locally.
    const removed = prevCards.current.filter(
      (old) => !cards.some((c) => String(c.id) === String(old.id))
    );
    removed.forEach(({ id }) => {
      deleteDoc(doc(db, 'users', user.uid, 'cards', String(id))).catch(console.error);
    });

    prevCards.current = cards;
  }, [user, cards]);
}
