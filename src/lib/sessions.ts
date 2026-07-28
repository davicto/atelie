import fs from 'fs';
import os from 'os';
import path from 'path';
import { SESSIONS_DIR } from '../config';
import { readSnapshot, readManifest, readEventsLog, writeSnapshot } from '../state/manifest';
import { detectImageFormat } from './imageFormat';
import { findStyle, slugify } from './userStyles';
import type { PanelVerdict, Session, SessionSummary, Verdict } from '../types';

function countPngs(dir: string): number {
  let n = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) n += countPngs(full);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.png')) n++;
  }
  return n;
}

function bestNotaFromManifest(id: string): number | null {
  let best: number | null = null;
  for (const rec of readManifest(id)) {
    if (rec?.kind === 'verdict' && typeof rec.nota === 'number') {
      if (best == null || rec.nota > best) best = rec.nota;
    }
  }
  return best;
}

/** Varre os session.json sob ~/.atelie/sessions; ordena desc por createdAt. */
export function listSessions(): SessionSummary[] {
  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: SessionSummary[] = [];
  for (const d of dirs) {
    if (!d.isDirectory() || d.name.startsWith('_')) continue;
    const session = readSnapshot(d.name);
    if (!session) continue;
    out.push({
      id: session.id,
      createdAt: session.createdAt,
      request: session.request,
      styleIds: session.styleIds ?? [],
      iterations: session.iterationsMeta?.length ?? session.iteration ?? 1,
      imageCount: countPngs(path.join(SESSIONS_DIR, d.name)),
      bestNota: bestNotaFromManifest(session.id),
      durationMs: session.totalDurationMs,
    });
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out;
}

export interface FullSession {
  session: Session;
  log: string[];
  images: { iteration: number; pngPath: string; styleId: string; nota: number | null; jobId: string }[];
}

/**
 * Carrega a sessão completa. As imagens são reconstruídas do manifest.jsonl
 * (que cobre TODAS as iterações; o session.json só guarda a última).
 */
export function loadFullSession(id: string): FullSession | null {
  const session = readSnapshot(id);
  if (!session) return null;

  const byJob = new Map<string, { iteration: number; pngPath: string; styleId: string; nota: number | null; jobId: string }>();
  for (const rec of readManifest(id)) {
    if (rec?.kind === 'generate' && rec.ok && typeof rec.pngPath === 'string') {
      byJob.set(rec.jobId, { iteration: rec.iteration ?? 0, pngPath: rec.pngPath, styleId: rec.styleId ?? '', nota: null, jobId: rec.jobId });
    } else if (rec?.kind === 'verdict') {
      const img = byJob.get(rec.jobId);
      if (img) img.nota = typeof rec.nota === 'number' ? rec.nota : null;
    }
  }
  const images = [...byJob.values()].sort((a, b) => a.iteration - b.iteration);
  return { session, log: readEventsLog(id), images };
}

// ── Itens da sessão (contact-sheet + export) ────────────────────────────────
/** Uma imagem gerada, enriquecida com estilo, provedor, veredito e prompt. */
export interface SessionItem {
  jobId: string;
  iteration: number;
  index: number;
  styleId: string;
  styleName: string;
  provider: string;
  pngPath: string;
  nota: number | null;
  aprovado?: boolean;
  prompt?: string;
  verdict?: Verdict | PanelVerdict;
}

/**
 * Reconstrói TODAS as imagens da sessão a partir do manifest (cobre todas as
 * iterações) e enriquece a última iteração com o prompt e o veredito COMPLETO do
 * snapshot (o manifest só guarda nota/aprovado/painel). Chave = jobId; o índice
 * global vem do sufixo do jobId (`<styleId>-<index>`).
 */
export function collectSessionItems(id: string): { session: Session; items: SessionItem[] } | null {
  const session = readSnapshot(id);
  if (!session) return null;

  const map = new Map<string, SessionItem>();
  for (const rec of readManifest(id)) {
    if (rec?.kind === 'generate' && rec.ok && typeof rec.pngPath === 'string') {
      const jobId: string = rec.jobId;
      const idx = Number(jobId.slice(jobId.lastIndexOf('-') + 1));
      map.set(jobId, {
        jobId,
        iteration: rec.iteration ?? 0,
        index: Number.isFinite(idx) ? idx : 0,
        styleId: rec.styleId ?? '',
        styleName: findStyle(rec.styleId)?.nome ?? rec.styleId ?? '',
        provider: rec.provider ?? rec.meta?.resolved ?? '',
        pngPath: rec.pngPath,
        nota: null,
      });
    } else if (rec?.kind === 'verdict') {
      const it = map.get(rec.jobId);
      if (it) {
        if (typeof rec.nota === 'number') it.nota = rec.nota;
        if (typeof rec.aprovado === 'boolean') it.aprovado = rec.aprovado;
      }
    }
  }

  for (const r of session.results ?? []) {
    const it = map.get(r.job.id);
    if (it) {
      it.prompt = r.job.prompt || it.prompt;
      if (r.verdict) {
        it.verdict = r.verdict;
        if (it.nota == null) it.nota = r.verdict.nota;
        if (it.aprovado == null) it.aprovado = r.verdict.aprovado;
      }
      if (r.meta?.resolved && !it.provider) it.provider = r.meta.resolved;
      if (typeof r.job.index === 'number') it.index = r.job.index;
    } else if (r.ok && r.pngPath) {
      map.set(r.job.id, {
        jobId: r.job.id,
        iteration: session.iteration,
        index: r.job.index,
        styleId: r.job.styleId,
        styleName: findStyle(r.job.styleId)?.nome ?? r.job.styleId,
        provider: r.meta?.resolved ?? r.job.provider ?? '',
        pngPath: r.pngPath,
        nota: r.verdict?.nota ?? null,
        aprovado: r.verdict?.aprovado,
        prompt: r.job.prompt,
        verdict: r.verdict,
      });
    }
  }

  const items = [...map.values()].sort((a, b) => a.iteration - b.iteration || a.index - b.index);
  return { session, items };
}

// ── Publicação (pasta pública + página) ────────────────────────────────────
export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Timestamp compacto AAAAMMDD-HHMMSS para nomear a pasta pública. */
export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function verdictText(v?: Verdict | PanelVerdict): string {
  if (!v) return 'veredito: (indisponível)';
  const lines = [
    `veredito: nota ${v.nota ?? '—'} ${v.aprovado ? '✓ aprovado' : '✗ reprovado'}`,
    `alinhamento: ${v.alinhamento || '—'}`,
  ];
  if (v.problemas?.length) lines.push(`problemas:\n${v.problemas.map((p) => `  - ${p}`).join('\n')}`);
  if (v.sugestao_melhoria) lines.push(`sugestão: ${v.sugestao_melhoria}`);
  if ('painel' in v && v.painel?.length) {
    lines.push(`painel: ${v.painel.map((p) => `${p.spec.label} ${p.verdict.nota ?? '—'}`).join(', ')}`);
  }
  return lines.join('\n');
}

export function sidecarText(session: Session, item?: SessionItem): string {
  return [
    `pedido: ${session.request}`,
    `estilo: ${item?.styleName ?? item?.styleId ?? '—'}${item?.styleId ? ` (${item.styleId})` : ''}`,
    `provedor: ${item?.provider || '—'}`,
    `iteração: ${item?.iteration ?? '—'}   versão: ${item != null ? item.index + 1 : '—'}`,
    '',
    `prompt:\n${item?.prompt ?? '(prompt indisponível)'}`,
    '',
    verdictText(item?.verdict),
  ].join('\n');
}

/** Rótulo curto do pedido: primeiras palavras significativas (para nomear a página). */
export function shortLabel(request: string, maxWords = 5, maxLen = 48): string {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'um', 'uma', 'em', 'no', 'na', 'com', 'para']);
  const words = request
    .replace(/[\n\r]+/g, ' ')
    .split(/[\s,;.]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (out.length >= maxWords) break;
    if (out.length && stop.has(w.toLowerCase()) && out.length >= maxWords - 1) continue;
    out.push(w);
  }
  const label = out.join(' ').trim() || request.trim() || 'pedido';
  return label.length > maxLen ? label.slice(0, maxLen).trim() : label;
}

/** Slug curto derivado de `shortLabel` (nome da pasta/página). */
export function shortSlug(request: string): string {
  return slugify(shortLabel(request)) || 'pedido';
}
