import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogEntry, ProgressEvent, RunMessage } from './types';

export interface RunSocket<TResult = unknown> {
  running: boolean;
  kind: 'run' | 'serie-run' | null;
  logs: LogEntry[];
  progress: Record<string, ProgressEvent>;
  result: TResult | null;
  error: string | null;
  start: (msg: RunMessage) => void;
  reset: () => void;
  cancel: () => void;
}

/**
 * Abre um WebSocket em /api/ws por run (o servidor aceita 1 run por socket),
 * envia {run|serie-run} e agrega os streams log/progress/done/error.
 */
export function useRunSocket<TResult = unknown>(): RunSocket<TResult> {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressEvent>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<'run' | 'serie-run' | null>(null);
  const sockRef = useRef<WebSocket | null>(null);

  useEffect(() => () => sockRef.current?.close(), []);

  const reset = useCallback(() => {
    setLogs([]);
    setProgress({});
    setResult(null);
    setError(null);
  }, []);

  const start = useCallback(
    (msg: RunMessage) => {
      if (sockRef.current && running) return;
      setLogs([]);
      setProgress({});
      setResult(null);
      setError(null);
      setRunning(true);
      setKind(msg.type);

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/api/ws`);
      sockRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify(msg));
      ws.onmessage = (ev: MessageEvent) => {
        let m: any;
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        switch (m?.type) {
          case 'log':
            if (m.entry) setLogs((l) => [...l, m.entry as LogEntry]);
            break;
          case 'progress':
            if (m.ev?.jobId) setProgress((p) => ({ ...p, [m.ev.jobId]: m.ev as ProgressEvent }));
            break;
          case 'done':
            setResult((m.result ?? null) as TResult);
            setRunning(false);
            ws.close();
            break;
          case 'error':
            setError(String(m.message ?? 'erro desconhecido'));
            setRunning(false);
            ws.close();
            break;
          default:
            break;
        }
      };
      ws.onerror = () => {
        setError((e) => e ?? 'falha na conexão com o servidor (WebSocket)');
      };
      ws.onclose = () => {
        setRunning(false);
        if (sockRef.current === ws) sockRef.current = null;
      };
    },
    [running],
  );

  const cancel = useCallback(() => {
    sockRef.current?.close();
    sockRef.current = null;
    setRunning(false);
  }, []);

  return { running, kind, logs, progress, result, error, start, reset, cancel };
}
