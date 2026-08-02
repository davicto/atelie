import { useCallback, useSyncExternalStore } from 'react';
import type { LogEntry, ProgressEvent, RunMessage } from './types';

export type RunKind = 'run' | 'serie-run' | 'sprite-run';

export interface RunState<TResult = unknown> {
  running: boolean;
  kind: RunKind | null;
  logs: LogEntry[];
  progress: Record<string, ProgressEvent>;
  result: TResult | null;
  error: string | null;
}

export interface RunSocket<TResult = unknown> extends RunState<TResult> {
  start: (msg: RunMessage) => void;
  reset: () => void;
  /**
   * Fecha o socket e para de acompanhar. NÃO aborta o run: o servidor não liga o
   * fechamento do socket a um AbortSignal, então a geração continua até o fim e as
   * imagens seguem entrando na biblioteca do projeto.
   */
  cancel: () => void;
}

const VAZIO: RunState = { running: false, kind: null, logs: [], progress: {}, result: null, error: null };

/**
 * O estado dos runs vive FORA do React, num store de módulo indexado por chave.
 *
 * Antes ele morava no `useState` de cada tela: trocar de aba desmontava o
 * componente, o cleanup fechava o WebSocket e logs, progresso e resultado sumiam —
 * sem jeito de reatar ao run, que continuava rodando no servidor. Aqui o socket é
 * do módulo, sobrevive à navegação, e voltar para a aba reencontra o run em curso.
 */
const estados = new Map<string, RunState<any>>();
const sockets = new Map<string, WebSocket>();
const ouvintes = new Map<string, Set<() => void>>();

function ler(key: string): RunState<any> {
  return estados.get(key) ?? VAZIO;
}

/** Grava um snapshot NOVO (identidade estável é o contrato do useSyncExternalStore). */
function gravar(key: string, patch: Partial<RunState<any>> | ((s: RunState<any>) => Partial<RunState<any>>)): void {
  const atual = ler(key);
  estados.set(key, { ...atual, ...(typeof patch === 'function' ? patch(atual) : patch) });
  for (const l of ouvintes.get(key) ?? []) l();
}

function assinar(key: string, l: () => void): () => void {
  let set = ouvintes.get(key);
  if (!set) {
    set = new Set();
    ouvintes.set(key, set);
  }
  set.add(l);
  return () => {
    set!.delete(l);
    // O estado NÃO é descartado quando o último ouvinte sai: é exatamente o caso
    // "troquei de aba com um run rodando".
  };
}

function iniciar(key: string, msg: RunMessage): void {
  if (ler(key).running) return; // 1 run por chave (o servidor aceita 1 por socket)
  sockets.get(key)?.close();
  estados.set(key, { ...VAZIO, running: true, kind: msg.type });
  for (const l of ouvintes.get(key) ?? []) l();

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/api/ws`);
  sockets.set(key, ws);

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
        if (m.entry) gravar(key, (s) => ({ logs: [...s.logs, m.entry as LogEntry] }));
        break;
      case 'progress':
        if (m.ev?.jobId) gravar(key, (s) => ({ progress: { ...s.progress, [m.ev.jobId]: m.ev as ProgressEvent } }));
        break;
      case 'done':
        gravar(key, { result: m.result ?? null, running: false });
        ws.close();
        break;
      case 'error':
        gravar(key, { error: String(m.message ?? 'erro desconhecido'), running: false });
        ws.close();
        break;
      default:
        break;
    }
  };
  ws.onerror = () => {
    gravar(key, (s) => ({ error: s.error ?? 'falha na conexão com o servidor (WebSocket)' }));
  };
  ws.onclose = () => {
    gravar(key, { running: false });
    if (sockets.get(key) === ws) sockets.delete(key);
  };
}

/**
 * Acompanha o run da chave `key` (ex.: `serie:<projetoId>`). Chaves distintas são
 * runs independentes; a mesma chave em duas telas mostra o mesmo run.
 */
export function useRunSocket<TResult = unknown>(key: string): RunSocket<TResult> {
  const estado = useSyncExternalStore(
    useCallback((l: () => void) => assinar(key, l), [key]),
    useCallback(() => ler(key), [key]),
    useCallback(() => VAZIO, []),
  ) as RunState<TResult>;

  const start = useCallback((msg: RunMessage) => iniciar(key, msg), [key]);
  const reset = useCallback(() => {
    if (ler(key).running) return; // limpar no meio do run esconderia o que está vivo
    gravar(key, { logs: [], progress: {}, result: null, error: null });
  }, [key]);
  const cancel = useCallback(() => {
    sockets.get(key)?.close();
    sockets.delete(key);
    gravar(key, { running: false });
  }, [key]);

  return { ...estado, start, reset, cancel };
}
