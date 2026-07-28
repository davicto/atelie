import fs from 'fs';
import path from 'path';
import { sessionDir } from '../state/manifest';
import type { LogEntry } from '../types';

export type { LogEntry } from '../types';

function clock(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Log de sessão com cronômetro. Cada `log()` calcula o tempo decorrido desde
 * `startedAt`, grava uma linha legível em `<sessão>/events.log`, guarda em ring
 * buffer e (opcional) reemite via `onEmit` (stderr no headless, LogPanel na TUI).
 */
export class SessionLogger {
  private buf: LogEntry[] = [];

  constructor(
    private sessionId: string,
    private startedAt: number,
    private onEmit?: (e: LogEntry) => void,
  ) {}

  log(msg: string, level: LogEntry['level'] = 'info'): LogEntry {
    const elapsedMs = Date.now() - this.startedAt;
    const entry: LogEntry = { ts: new Date().toISOString(), elapsedMs, level, msg };
    this.buf.push(entry);
    const line = `${clock(entry.ts)} [+${(elapsedMs / 1000).toFixed(1)}s] ${level.padEnd(4)} ${msg}`;
    try {
      fs.appendFileSync(path.join(sessionDir(this.sessionId), 'events.log'), line + '\n');
    } catch {
      /* diretório ainda não existe — silencioso */
    }
    this.onEmit?.(entry);
    return entry;
  }

  entries(): LogEntry[] {
    return this.buf.slice();
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }
}
