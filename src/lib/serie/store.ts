import fs from 'fs';
import path from 'path';
import { SESSIONS_ROOT } from '../../config';
import type { Canon, Serie } from '../../types';

/** Raiz das séries: ~/.atelie/series (ou ATELIE_HOME/series). Espelha SESSIONS_DIR. */
export const SERIES_DIR = path.join(SESSIONS_ROOT, 'series');

export function serieDir(id: string): string {
  return path.join(SERIES_DIR, id);
}
export function anchorsDir(id: string): string {
  return path.join(serieDir(id), 'anchors');
}
export function panelsDir(id: string): string {
  return path.join(serieDir(id), 'panels');
}

/** Caminho da âncora de um personagem (slug já normalizado pelo chamador). */
export function anchorPath(id: string, slug: string): string {
  return path.join(anchorsDir(id), `${slug}.png`);
}

/** Caminho do painel N (zero-pad 2). */
export function panelPath(id: string, n: number): string {
  return path.join(panelsDir(id), `panel-${String(n).padStart(2, '0')}.png`);
}

/** Cria a árvore da série (dir + anchors/ + panels/). */
export function ensureSerie(s: Serie): void {
  fs.mkdirSync(anchorsDir(s.id), { recursive: true });
  fs.mkdirSync(panelsDir(s.id), { recursive: true });
}

/** Append-only no manifest.jsonl (timestamp automático). */
export function appendSerie(id: string, rec: object): void {
  const dir = serieDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'manifest.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n');
}

/** Snapshot completo em serie.json. */
export function saveSerie(s: Serie): void {
  const dir = serieDir(s.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'serie.json'), JSON.stringify(s, null, 2));
}

export function loadSerie(id: string): Serie | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(serieDir(id), 'serie.json'), 'utf8')) as Serie;
  } catch {
    return null;
  }
}

/** Lê o manifest.jsonl como lista de registros (linhas ilegíveis são puladas). */
export function readSerieManifest(id: string): any[] {
  try {
    const txt = fs.readFileSync(path.join(serieDir(id), 'manifest.jsonl'), 'utf8');
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

function timestampId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `${stamp}-${rand}`;
}

/** Cria uma série nova em memória (id = AAAAMMDD-HHMMSS-rand6). Persistir com saveSerie. */
export function createSerie(titulo: string, request: string, canon: Canon): Serie {
  return {
    id: timestampId(),
    titulo,
    createdAt: new Date().toISOString(),
    request,
    canon,
    paineis: [],
  };
}

/** true se todos os personagens têm âncora gerada em disco (roteia salvas p/ painéis). */
export function anchorsComplete(s: Serie): boolean {
  const chars = s.canon?.personagens ?? [];
  return chars.length > 0 && chars.every((p) => !!p.anchorPng && fs.existsSync(p.anchorPng));
}

export interface SerieSummary {
  id: string;
  titulo: string;
  createdAt: string;
  request: string;
  estiloId: string;
  personagens: number;
  paineis: number;
  aprovados: number;
  projectId?: string;
  /** Primeiro painel com imagem — capa da série nas listagens. */
  capa: string | null;
}

/** Varre os serie.json sob ~/.atelie/series; ordena desc por createdAt. */
export function listSeries(): SerieSummary[] {
  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(SERIES_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: SerieSummary[] = [];
  for (const d of dirs) {
    if (!d.isDirectory() || d.name.startsWith('_')) continue;
    const serie = loadSerie(d.name);
    if (!serie) continue;
    out.push({
      id: serie.id,
      titulo: serie.titulo,
      createdAt: serie.createdAt,
      request: serie.request,
      estiloId: serie.canon?.estiloId ?? '',
      personagens: serie.canon?.personagens?.length ?? 0,
      paineis: serie.paineis?.length ?? 0,
      aprovados: (serie.paineis ?? []).filter((p) => p.aprovado).length,
      ...(serie.projectId ? { projectId: serie.projectId } : {}),
      capa: (serie.paineis ?? []).find((p) => p.pngPath)?.pngPath ?? null,
    });
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out;
}
