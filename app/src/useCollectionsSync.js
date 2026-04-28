import { useEffect, useRef, useCallback } from 'react';
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
 * Syncs the user's saved collections with Firestore at
 * users/{uid}/collections/{collectionId}.
 *
 * Each collection document has the shape:
 * {
 *   id: string,
 *   name: string,
 *   description: string | null,
 *   type: 'smart' | 'manual',
 *   // Smart collections — auto-populate from criteria:
 *   criteria: {
 *     playerName?: string,
 *     brand?: string,
 *     series?: string,
 *     insertName?: string,
 *     league?: string,
 *     sport?: string,
 *     team?: string,
 *     cardCategory?: string,
 *     isRookie?: boolean,
 *     hasAutograph?: boolean,
 *     hasPatch?: boolean,
 *     isNumbered?: boolean,
 *     isGraded?: boolean,
 *     yearFrom?: string,
 *     yearTo?: string,
 *   } | null,
 *   // Manual collections — explicit card ID membership:
 *   cardIds: string[],
 *   coverImageUrl: string | null,   // derived from first card
 *   createdAt: string,
 *   updatedAt: string,
 * }
 */
export function useCollectionsSync(user, collections, setCollections) {
  const skipNextWrite = useRef(0);
  const prevUid = useRef(null);
  const prevCollections = useRef([]);

  // --- Listen: Firestore → local state ---
  useEffect(() => {
    if (!user) {
      if (prevUid.current) {
        skipNextWrite.current += 1;
        setCollections([]);
        prevCollections.current = [];
      }
      prevUid.current = null;
      return;
    }

    prevUid.current = user.uid;
    const q = query(
      collection(db, 'users', user.uid, 'collections'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
      skipNextWrite.current += 1;
      prevCollections.current = loaded;
      setCollections(loaded);
    });

    return unsubscribe;
  }, [user, setCollections]);

  // --- Write & Delete: local state → Firestore ---
  useEffect(() => {
    if (!user) return;
    if (skipNextWrite.current > 0) {
      skipNextWrite.current -= 1;
      return;
    }

    const colRef = collection(db, 'users', user.uid, 'collections');

    collections.forEach((col) => {
      const { id, ...data } = col;
      setDoc(doc(colRef, String(id)), data, { merge: true }).catch((e) => {
        console.error('useCollectionsSync: setDoc failed', id, e?.code, e?.message);
      });
    });

    const removed = prevCollections.current.filter(
      (old) => !collections.some((c) => String(c.id) === String(old.id))
    );
    removed.forEach(({ id }) => {
      deleteDoc(doc(db, 'users', user.uid, 'collections', String(id))).catch(console.error);
    });

    prevCollections.current = collections;
  }, [user, collections]);
}

/**
 * Given a collection definition and the full cards array, returns the
 * cards that belong to this collection.
 */

// Fuzzy match: returns true if cardValue includes criterion (string or array).
// Tolerates minor typos via a simple token-based approach.
function matchField(cardValue, criterion) {
  if (criterion === undefined || criterion === null || criterion === '') return true;
  const cv = (cardValue || '').toLowerCase();
  if (Array.isArray(criterion)) {
    if (criterion.length === 0) return true;
    return criterion.some(c => {
      const ct = c.toLowerCase();
      // exact includes check first (fast path)
      if (cv.includes(ct)) return true;
      // fuzzy: any token in criterion appears in cardValue
      return ct.split(/\s+/).every(tok => cv.includes(tok));
    });
  }
  const ct = criterion.toLowerCase();
  if (cv.includes(ct)) return true;
  // fuzzy: all tokens present
  return ct.split(/\s+/).every(tok => cv.includes(tok));
}

export function resolveCollectionCards(col, allCards) {
  if (!col || !allCards) return [];

  if (col.type === 'manual') {
    const ids = new Set((col.cardIds || []).map(String));
    return allCards.filter((c) => ids.has(String(c.id)));
  }

  // Smart — match criteria (each field supports string OR string[])
  const cr = col.criteria || {};
  return allCards.filter((c) => {
    if (!matchField(c.playerName, cr.playerName)) return false;
    if (!matchField(c.brand, cr.brand)) return false;
    if (!matchField(c.series, cr.series)) return false;
    // insertName: exact match (or array of exact matches)
    if (cr.insertName !== undefined && cr.insertName !== null && cr.insertName !== '') {
      const cv = (c.insertName || '').toLowerCase();
      const match = Array.isArray(cr.insertName)
        ? cr.insertName.length === 0 || cr.insertName.some(n => cv === n.toLowerCase() || cv.includes(n.toLowerCase()))
        : cv === cr.insertName.toLowerCase() || cv.includes(cr.insertName.toLowerCase());
      if (!match) return false;
    }
    if (!matchField(c.league, cr.league)) return false;
    if (!matchField(c.sport, cr.sport)) return false;
    if (!matchField(c.team, cr.team)) return false;
    if (cr.cardCategory && c.cardCategory !== cr.cardCategory) return false;
    if (cr.isRookie === true && !c.isRookie) return false;
    if (cr.hasAutograph === true && !c.hasAutograph) return false;
    if (cr.hasPatch === true && !c.hasPatch) return false;
    if (cr.isNumbered === true && !c.isNumbered && !c.serialNumber) return false;
    if (cr.isGraded === true && !c.isGraded) return false;
    if (cr.yearFrom && (c.year || '') < cr.yearFrom) return false;
    if (cr.yearTo && (c.year || '') > cr.yearTo) return false;
    return true;
  });
}
