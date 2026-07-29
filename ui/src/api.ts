import type {
  ClisResponse,
  CodexAuth,
  Environment,
  LoginEmCurso,
  FullSession,
  SessionSummary,
  Settings,
  StyleInfo,
  CliId,
} from './types';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null;
  const res = await fetch(path, {
    ...init,
    headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => req<{ ok: boolean }>('/api/health'),
  doctor: () => req<Environment>('/api/doctor'),
  codexAuth: () => req<CodexAuth>('/api/auth/codex'),
  codexLogin: () => req<LoginEmCurso>('/api/auth/codex/login', { method: 'POST' }),
  codexLoginCancelar: () => req<{ ok: boolean }>('/api/auth/codex/cancelar', { method: 'POST' }),
  styles: () => req<StyleInfo[]>('/api/styles'),
  sessions: () => req<SessionSummary[]>('/api/sessions'),
  session: (id: string) => req<FullSession>(`/api/sessions/${encodeURIComponent(id)}`),
  settings: () => req<Settings>('/api/settings'),
  putSettings: (s: Partial<Settings>) => req<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(s) }),
  clis: () => req<ClisResponse>('/api/clis'),
  putClis: (b: Partial<Record<CliId, boolean>>) => req<ClisResponse>('/api/clis', { method: 'PUT', body: JSON.stringify(b) }),
  sessionSheet: (id: string) => req<{ path: string }>(`/api/sessions/sheet/${encodeURIComponent(id)}`, { method: 'POST' }),
  serieSheet: (id: string) => req<{ path: string }>(`/api/serie/sheet/${encodeURIComponent(id)}`, { method: 'POST' }),
};
