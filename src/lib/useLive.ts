import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from '../db/db';

/** Runs `load` on focus and again whenever the database changes. */
export function useLive<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | undefined; reload: () => void; error: Error | null } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => {
    loadRef.current().then(setData, (e: Error) => setError(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(reload);
  useEffect(() => subscribe(reload), [reload]);
  return { data, reload, error };
}
