import fs from 'fs';
import path from 'path';
import {
  collectSessionItems,
  expandHome,
  shortLabel,
  shortSlug,
  sidecarText,
  stamp,
  type SessionItem,
} from './sessions';
import { sessionDir, writeSnapshot } from '../state/manifest';
import { detectImageFormat } from './imageFormat';
import type { PanelVerdict, Verdict } from '../types';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Lê a imagem e devolve um data URI (mime real por magic bytes). null se ilegível. */
function dataUri(pngPath: string): string | null {
  try {
    const { mime } = detectImageFormat(pngPath);
    const b64 = fs.readFileSync(pngPath).toString('base64');
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

function isPanel(v: Verdict | PanelVerdict): v is PanelVerdict {
  return Array.isArray((v as PanelVerdict).painel);
}

function renderVerdict(v?: Verdict | PanelVerdict): string {
  if (!v) return '<p class="muted">Sem veredito.</p>';
  const parts: string[] = [];
  if (v.alinhamento) parts.push(`<p class="align">${esc(v.alinhamento)}</p>`);
  if (v.problemas?.length) {
    parts.push(`<ul class="probs">${v.problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`);
  }
  if (v.sugestao_melhoria) {
    parts.push(`<p class="sug"><span class="k">Sugestão</span> ${esc(v.sugestao_melhoria)}</p>`);
  }
  if (isPanel(v) && v.painel.length) {
    const votes = v.painel
      .map((p) => {
        const ok = p.verdict.aprovado ? 'ok' : 'no';
        return `<span class="vote ${ok}">${esc(p.spec.label)} ${p.verdict.nota ?? '—'}</span>`;
      })
      .join('');
    parts.push(`<div class="panel">${votes}</div>`);
  }
  return parts.join('\n') || '<p class="muted">Sem detalhes.</p>';
}

function renderCard(item: SessionItem): string {
  const uri = dataUri(item.pngPath);
  const img = uri
    ? `<img loading="lazy" src="${uri}" alt="${esc(item.styleName)}">`
    : '<div class="missing">arquivo ausente</div>';
  const notaCls = item.aprovado ? 'ok' : item.nota == null ? 'na' : 'no';
  const mark = item.nota == null ? '' : item.aprovado ? ' ✓' : ' ✗';
  return `<article class="card">
  <div class="frame">${img}</div>
  <div class="meta">
    <span class="style">${esc(item.styleName)}</span>
    <span class="tag">v${item.index + 1} · iter ${item.iteration}</span>
    ${item.provider ? `<span class="tag">${esc(item.provider)}</span>` : ''}
    <span class="nota ${notaCls}">nota ${item.nota ?? '—'}${mark}</span>
  </div>
  <div class="verdict">${renderVerdict(item.verdict)}</div>
  <details class="prompt"><summary>Prompt completo</summary><pre>${esc(item.prompt ?? '(prompt indisponível)')}</pre></details>
</article>`;
}

const STYLE = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
header { padding: 20px 24px; border-bottom: 1px solid var(--line); }
header h1 { margin: 0 0 4px; font-size: 18px; font-weight: 700; }
header .sub { color: var(--muted); font-size: 13px; }
main { padding: 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.frame { background: var(--frame); display: flex; align-items: center; justify-content: center; min-height: 200px; }
.frame img { max-width: 100%; height: auto; display: block; }
.missing { color: var(--muted); font-size: 13px; padding: 40px; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 12px; }
.meta .style { font-weight: 700; margin-right: auto; }
.tag { font-size: 12px; color: var(--muted); background: var(--chip); border-radius: 999px; padding: 2px 8px; }
.nota { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 9px; }
.nota.ok { background: var(--ok-bg); color: var(--ok-fg); }
.nota.no { background: var(--no-bg); color: var(--no-fg); }
.nota.na { background: var(--chip); color: var(--muted); }
.verdict { padding: 0 12px 10px; font-size: 13px; }
.verdict .align { margin: 6px 0; }
.verdict .probs { margin: 6px 0; padding-left: 18px; color: var(--muted); }
.verdict .sug { margin: 6px 0; }
.verdict .sug .k { font-weight: 700; }
.panel { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.vote { font-size: 11px; border-radius: 999px; padding: 2px 8px; background: var(--chip); }
.vote.ok { color: var(--ok-fg); }
.vote.no { color: var(--no-fg); }
.prompt { border-top: 1px solid var(--line); margin-top: auto; }
.prompt summary { cursor: pointer; padding: 8px 12px; font-size: 12px; color: var(--muted); user-select: none; }
.prompt pre { margin: 0; padding: 0 12px 12px; white-space: pre-wrap; word-break: break-word; font-size: 12px; color: var(--fg); }
.muted { color: var(--muted); }
:root {
  --bg: #ffffff; --fg: #1a1a1a; --muted: #6b7280; --line: #e5e7eb; --card: #ffffff;
  --frame: #f3f4f6; --chip: #f1f5f9; --ok-bg: #dcfce7; --ok-fg: #166534; --no-bg: #fee2e2; --no-fg: #991b1b;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115; --fg: #e5e7eb; --muted: #9ca3af; --line: #262b33; --card: #161a20;
    --frame: #0b0d11; --chip: #1f2530; --ok-bg: #14321f; --ok-fg: #86efac; --no-bg: #3a1717; --no-fg: #fca5a5;
  }
}
body { background: var(--bg); color: var(--fg); }
`;

/**
 * Gera (regenera a cada chamada) um contact-sheet HTML AUTOCONTIDO da sessão em
 * `<dir>/contact-sheet.html`: cada imagem embutida como data URI, com estilo,
 * versão, provedor, nota, veredito e o prompt completo. Retorna o caminho do HTML.
 */
export function buildContactSheet(sessionId: string, outPath?: string): string {
  const data = collectSessionItems(sessionId);
  if (!data) throw new Error(`sessão "${sessionId}" não encontrada`);
  const { session, items } = data;

  const cards = items.length
    ? `<div class="grid">${items.map(renderCard).join('\n')}</div>`
    : '<p class="muted">Nenhuma imagem nesta sessão.</p>';

  const when = esc(session.createdAt);
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(shortLabel(session.request))}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>${esc(session.request)}</h1>
  <div class="sub">sessão ${esc(session.id)} · ${when} · ${items.length} imagem(ns)</div>
</header>
<main>
${cards}
</main>
</body>
</html>`;

  const out = outPath ?? path.join(sessionDir(sessionId), 'contact-sheet.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return out;
}

export interface PublishResult {
  dir: string;
  page: string;
  images: string[];
}

/**
 * Publica TUDO que a sessão gerou: copia cada imagem (com um `.txt` ao lado com
 * prompt/estilo/veredito) para `<destBase>/<slug-curto>-<stamp>/` e escreve ali a
 * página `index.html` com todas elas. Não existe mais "exportar só o favorito":
 * toda imagem gerada entra. A pasta é ESTÁVEL por sessão (`session.pageDir`),
 * então republicar a cada iteração atualiza a mesma pasta e a mesma página.
 */
export function publishSession(sessionId: string, destBase = '~/Pictures/atelie'): PublishResult {
  const data = collectSessionItems(sessionId);
  if (!data) throw new Error(`sessão "${sessionId}" não encontrada`);
  const { session, items } = data;

  const dir = session.pageDir || path.join(expandHome(destBase), `${shortSlug(session.request)}-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });

  const images: string[] = [];
  const used = new Set<string>();
  for (const item of items) {
    if (!fs.existsSync(item.pngPath)) continue;
    const { ext } = detectImageFormat(item.pngPath);
    let base = path.basename(item.pngPath, path.extname(item.pngPath));
    while (used.has(base)) base = `${base}_`;
    used.add(base);
    const destImg = path.join(dir, base + ext);
    fs.copyFileSync(item.pngPath, destImg);
    fs.writeFileSync(path.join(dir, base + '.txt'), sidecarText(session, item));
    images.push(destImg);
  }

  const page = buildContactSheet(sessionId, path.join(dir, 'index.html'));
  buildContactSheet(sessionId); // mantém a cópia dentro da sessão
  session.pageDir = dir;
  session.pagePath = page;
  writeSnapshot(session);
  return { dir, page, images };
}
