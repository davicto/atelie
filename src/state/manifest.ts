import fs from 'fs';
import path from 'path';
import { SESSIONS_ROOT } from '../config';
import type { Session } from '../types';

export function sessionDir(id: string): string {
  return path.join(SESSIONS_ROOT, 'sessions', id);
}

/** Diretório da iteração (NN zero-pad 2); criado sob demanda. */
export function iterDir(id: string, iteration: number): string {
  const nn = String(iteration).padStart(2, '0');
  const dir = path.join(sessionDir(id), `iter-${nn}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureSession(s: Session): void {
  fs.mkdirSync(sessionDir(s.id), { recursive: true });
  iterDir(s.id, s.iteration || 1);
}

/** Append-only no manifest.jsonl (timestamp automático). */
export function append(id: string, rec: object): void {
  const dir = sessionDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'manifest.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n');
}

export function writeSnapshot(s: Session): void {
  const dir = sessionDir(s.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(s, null, 2));
}

export function readSnapshot(id: string): Session | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(sessionDir(id), 'session.json'), 'utf8')) as Session;
  } catch {
    return null;
  }
}

/** Lê o manifest.jsonl como lista de registros (linhas ilegíveis são puladas). */
export function readManifest(id: string): any[] {
  try {
    const txt = fs.readFileSync(path.join(sessionDir(id), 'manifest.jsonl'), 'utf8');
    const out: any[] = [];
    for (const line of txt.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t));
      } catch {
        /* linha parcial — pula */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Lê o log humano da sessão (events.log) como linhas. */
export function readEventsLog(id: string): string[] {
  try {
    const txt = fs.readFileSync(path.join(sessionDir(id), 'events.log'), 'utf8');
    return txt.split('\n').filter((l) => l.length > 0);
  } catch {
    return [];
  }
}
