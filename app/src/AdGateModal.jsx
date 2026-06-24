import { useEffect, useRef } from 'react';

export default function AdGateModal({ onWatched }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onWatched?.();
  }, [onWatched]);

  return null;
}
