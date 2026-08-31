import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderState, ReaderStatePosition } from '../../contract.js';
import { fetchReaderState, putReaderState } from '../api.js';

export type ReaderSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useReaderStatePersistence(initial: ReaderState) {
  const [position, setPosition] = useState<ReaderStatePosition>(initial);
  const [revision, setRevision] = useState(initial.revision);
  const [status, setStatus] = useState<ReaderSaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const positionRef = useRef(position);
  const revisionRef = useRef(initial.revision);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRef = useRef(Promise.resolve());
  const dirtyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const persist = useCallback(
    (snapshot: ReaderStatePosition) => {
      chainRef.current = chainRef.current.then(async () => {
        if (mountedRef.current) {
          setStatus('saving');
          setError(null);
        }
        try {
          let saved: ReaderState;
          try {
            saved = await putReaderState(initial.assetId, {
              ...snapshot,
              expectedRevision: revisionRef.current,
            });
          } catch (cause) {
            if (!(cause instanceof Error) || !cause.message.includes('其他窗口')) throw cause;
            const current = await fetchReaderState(initial.assetId);
            revisionRef.current = current.revision;
            saved = await putReaderState(initial.assetId, {
              ...positionRef.current,
              expectedRevision: revisionRef.current,
            });
          }
          revisionRef.current = saved.revision;
          if (mountedRef.current) {
            setRevision(saved.revision);
            setStatus('saved');
          }
        } catch (cause) {
          if (mountedRef.current) {
            setStatus('error');
            setError(cause instanceof Error ? cause.message : '阅读位置保存失败');
          }
        }
      });
    },
    [initial.assetId],
  );

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    persist(positionRef.current);
  }, [persist]);

  const updatePosition = useCallback(
    (next: ReaderStatePosition | ((current: ReaderStatePosition) => ReaderStatePosition)) => {
      dirtyRef.current = true;
      setPosition((current) => {
        const value = typeof next === 'function' ? next(current) : next;
        positionRef.current = value;
        return value;
      });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 650);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current) persist(positionRef.current);
    },
    [persist],
  );

  return { error, flush, position, revision, status, updatePosition };
}
