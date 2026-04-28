import { useState, useEffect, useCallback, useMemo } from 'react';

// localStorage keys:
// vault.tracker.{setId}.targeted  = JSON array of player slugs
// vault.tracker.{setId}.hits      = JSON array of hit objects
// vault.tracker.anonSessionId     = uuid string

const ANON_KEY = 'vault.tracker.anonSessionId';

function targetedKey(setId) { return `vault.tracker.${setId}.targeted`; }
function hitsKey(setId)     { return `vault.tracker.${setId}.hits`; }

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function useTrackerState(setId) {
  const anonSessionId = useMemo(() => {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(ANON_KEY, id); }
    return id;
  }, []);

  const [targeted, setTargeted] = useState(
    () => new Set(readJSON(targetedKey(setId), []))
  );
  const [hits, setHits] = useState(
    () => readJSON(hitsKey(setId), [])
  );

  // Reload from localStorage whenever the active set switches
  useEffect(() => {
    setTargeted(new Set(readJSON(targetedKey(setId), [])));
    setHits(readJSON(hitsKey(setId), []));
  }, [setId]);

  const isTargeted = useCallback((slug) => targeted.has(slug), [targeted]);

  const toggleTarget = useCallback((slug) => {
    setTargeted(prev => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      localStorage.setItem(targetedKey(setId), JSON.stringify([...next]));
      return next;
    });
  }, [setId]);

  const targetPlayers = useCallback((slugs) => {
    setTargeted(prev => {
      const next = new Set(prev);
      slugs.forEach(s => next.add(s));
      localStorage.setItem(targetedKey(setId), JSON.stringify([...next]));
      return next;
    });
  }, [setId]);

  const untargetPlayers = useCallback((slugs) => {
    setTargeted(prev => {
      const next = new Set(prev);
      slugs.forEach(s => next.delete(s));
      localStorage.setItem(targetedKey(setId), JSON.stringify([...next]));
      return next;
    });
  }, [setId]);

  const getTargetedSlugs = useCallback(() => [...targeted], [targeted]);

  const addHit = useCallback((hit) => {
    const entry = { id: crypto.randomUUID(), timestamp: Date.now(), ...hit };
    setHits(prev => {
      const next = [...prev, entry];
      localStorage.setItem(hitsKey(setId), JSON.stringify(next));
      return next;
    });
    return entry;
  }, [setId]);

  const removeHit = useCallback((hitId) => {
    setHits(prev => {
      const next = prev.filter(h => h.id !== hitId);
      localStorage.setItem(hitsKey(setId), JSON.stringify(next));
      return next;
    });
  }, [setId]);

  const getHitsForPlayer = useCallback(
    (slug) => hits.filter(h => h.playerSlug === slug),
    [hits]
  );

  const getHitsForCard = useCallback(
    (slug, subsetId, cardNumber) =>
      hits.filter(h => h.playerSlug === slug && h.subsetId === subsetId && h.cardNumber === cardNumber),
    [hits]
  );

  const clearAll = useCallback(() => {
    localStorage.removeItem(targetedKey(setId));
    localStorage.removeItem(hitsKey(setId));
    setTargeted(new Set());
    setHits([]);
  }, [setId]);

  return {
    anonSessionId,
    isTargeted,
    toggleTarget,
    targetPlayers,
    untargetPlayers,
    getTargetedSlugs,
    targetedCount: targeted.size,
    hits,
    addHit,
    removeHit,
    getHitsForPlayer,
    getHitsForCard,
    clearAll,
  };
}
