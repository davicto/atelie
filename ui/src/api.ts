import type {
  Briefing,
  CastMember,
  ClisResponse,
  Environment,
  FullSession,
  ImagemUpload,
  LibraryItem,
  NovoEstilo,
  ProjectFull,
  ProjectSummary,
  SerieSummary,
  SessionSummary,
  Settings,
  StyleDetail,
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
  styles: () => req<StyleInfo[]>('/api/styles'),
  sessions: () => req<SessionSummary[]>('/api/sessions'),
  session: (id: string) => req<FullSession>(`/api/sessions/${encodeURIComponent(id)}`),
  settings: () => req<Settings>('/api/settings'),
  putSettings: (s: Partial<Settings>) => req<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(s) }),
  clis: () => req<ClisResponse>('/api/clis'),
  putClis: (b: Partial<Record<CliId, boolean>>) => req<ClisResponse>('/api/clis', { method: 'PUT', body: JSON.stringify(b) }),
  sessionSheet: (id: string) => req<{ path: string }>(`/api/sessions/sheet/${encodeURIComponent(id)}`, { method: 'POST' }),
  serieSheet: (id: string) => req<{ path: string }>(`/api/serie/sheet/${encodeURIComponent(id)}`, { method: 'POST' }),

  // ── Portfólio de estilos ──────────────────────────────────────────────────
  style: (id: string) => req<StyleDetail>(`/api/styles/${encodeURIComponent(id)}`),
  createStyle: (body: NovoEstilo) => req<StyleDetail>('/api/styles', { method: 'POST', body: JSON.stringify(body) }),
  deleteStyle: (id: string) => req<{ ok: boolean }>(`/api/styles/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── Projetos ──────────────────────────────────────────────────────────────
  projects: () => req<ProjectSummary[]>('/api/projects'),
  project: (id: string) => req<ProjectFull>(`/api/projects/${encodeURIComponent(id)}`),
  createProject: (b: { nome: string; descricao?: string; estiloId?: string | null }) =>
    req<ProjectFull>('/api/projects', { method: 'POST', body: JSON.stringify(b) }),
  updateProject: (id: string, b: { nome?: string; descricao?: string; estiloId?: string | null; capaItemId?: string | null }) =>
    req<ProjectFull>(`/api/projects/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(b) }),
  deleteProject: (id: string) => req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── Elenco ────────────────────────────────────────────────────────────────
  addMember: (projectId: string, b: { nome: string; descricao?: string; imagens?: ImagemUpload[] }) =>
    req<CastMember>(`/api/projects/${encodeURIComponent(projectId)}/cast`, { method: 'POST', body: JSON.stringify(b) }),
  updateMember: (
    projectId: string,
    memberId: string,
    b: { nome?: string; descricao?: string; aprovado?: boolean; imagens?: ImagemUpload[] },
  ) =>
    req<CastMember>(`/api/projects/${encodeURIComponent(projectId)}/cast/${encodeURIComponent(memberId)}`, {
      method: 'PUT',
      body: JSON.stringify(b),
    }),
  deleteMember: (projectId: string, memberId: string) =>
    req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/cast/${encodeURIComponent(memberId)}`, {
      method: 'DELETE',
    }),

  // ── Briefings ─────────────────────────────────────────────────────────────
  addBriefings: (projectId: string, b: { texto: string; personagens?: string[] }) =>
    req<Briefing[]>(`/api/projects/${encodeURIComponent(projectId)}/briefings`, { method: 'POST', body: JSON.stringify(b) }),
  deleteBriefing: (projectId: string, briefingId: string) =>
    req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/briefings/${encodeURIComponent(briefingId)}`, {
      method: 'DELETE',
    }),

  /** Capa de estilo — só estilos do usuário; o servidor recusa os do catálogo. */
  setStyleCover: (id: string, b: { refIndex?: number; imagens?: ImagemUpload[] }) =>
    req<StyleDetail>(`/api/styles/${encodeURIComponent(id)}/cover`, { method: 'PUT', body: JSON.stringify(b) }),

  // ── Biblioteca do projeto ─────────────────────────────────────────────────
  addToLibrary: (projectId: string, b: { imagens: ImagemUpload[]; cena?: string }) =>
    req<LibraryItem[]>(`/api/projects/${encodeURIComponent(projectId)}/library`, { method: 'POST', body: JSON.stringify(b) }),
  removeFromLibrary: (projectId: string, itemId: string) =>
    req<{ ok: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/library/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    }),

  // ── Séries ────────────────────────────────────────────────────────────────
  series: (projectId?: string) =>
    req<SerieSummary[]>(`/api/series${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
};
