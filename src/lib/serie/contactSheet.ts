import fs from 'fs';
import path from 'path';
import { detectImageFormat } from '../imageFormat';
import { loadSerie, serieDir } from './store';
import type { Canon, Painel, Personagem } from '../../types';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Lê a imagem e devolve um data URI (mime real por magic bytes). null se ilegível. */
function dataUri(p?: string): string | null {
  if (!p) return null;
  try {
    const { mime } = detectImageFormat(p);
    const b64 = fs.readFileSync(p).toString('base64');
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

function renderAnchor(p: Personagem): string {
  const uri = dataUri(p.anchorPng);
  const img = uri
    ? `<img loading="lazy" src="${uri}" alt="${esc(p.nome)}">`
    : '<div class="missing">âncora ausente</div>';
  return `<article class="card">
  <div class="frame">${img}</div>
  <div class="meta"><span class="style">${esc(p.nome)}</span></div>
  <div class="verdict"><p class="align">${esc(p.descricao)}</p></div>
</article>`;
}

function nota(n?: number | null, ok?: boolean): string {
  const cls = ok ? 'ok' : n == null ? 'na' : 'no';
  const mark = n == null ? '' : ok ? ' ✓' : ' ✗';
  return `<span class="nota ${cls}">${n ?? '—'}${mark}</span>`;
}

function renderPanel(p: Painel): string {
  const uri = dataUri(p.pngPath);
  const img = uri
    ? `<img loading="lazy" src="${uri}" alt="painel ${esc(p.n)}">`
    : '<div class="missing">arquivo ausente</div>';
  const drifts = p.drifts?.length
    ? `<ul class="probs">${p.drifts.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`
    : '';
  const sug = p.sugestao_melhoria ? `<p class="sug"><span class="k">Sugestão</span> ${esc(p.sugestao_melhoria)}</p>` : '';
  return `<article class="card">
  <div class="frame">${img}</div>
  <div class="meta">
    <span class="style">Painel ${esc(p.n)}</span>
    ${p.tentativas ? `<span class="tag">${esc(p.tentativas)} tentativa(s)</span>` : ''}
    <span class="lbl">consist.</span>${nota(p.consistencia, p.aprovado)}
    <span class="lbl">cena</span>${nota(p.cenaNota)}
  </div>
  <div class="verdict">
    <p class="cena">${esc(p.cena)}</p>
    ${p.personagens?.length ? `<p class="chars">${esc(p.personagens.join(', '))}</p>` : ''}
    ${drifts}
    ${sug}
  </div>
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
h2.sec { font-size: 14px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); margin: 8px 0 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; margin-bottom: 32px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.frame { background: var(--frame); display: flex; align-items: center; justify-content: center; min-height: 200px; }
.frame img { max-width: 100%; height: auto; display: block; }
.missing { color: var(--muted); font-size: 13px; padding: 40px; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 12px; }
.meta .style { font-weight: 700; margin-right: auto; }
.tag { font-size: 12px; color: var(--muted); background: var(--chip); border-radius: 999px; padding: 2px 8px; }
.lbl { font-size: 11px; color: var(--muted); }
.nota { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 9px; }
.nota.ok { background: var(--ok-bg); color: var(--ok-fg); }
.nota.no { background: var(--no-bg); color: var(--no-fg); }
.nota.na { background: var(--chip); color: var(--muted); }
.verdict { padding: 0 12px 12px; font-size: 13px; }
.verdict .cena { margin: 6px 0; }
.verdict .chars { margin: 4px 0; color: var(--muted); font-size: 12px; }
.verdict .align { margin: 6px 0; color: var(--muted); font-size: 12px; }
.verdict .probs { margin: 6px 0; padding-left: 18px; color: var(--muted); }
.verdict .sug { margin: 6px 0; }
.verdict .sug .k { font-weight: 700; }
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

function canonSection(canon: Canon): string {
  const anchors = (canon.personagens ?? []).map(renderAnchor).join('\n');
  const meta: string[] = [];
  if (canon.estiloDescricao?.trim()) meta.push(`<p class="align"><b>Estilo:</b> ${esc(canon.estiloDescricao)}</p>`);
  if (canon.paleta?.trim()) meta.push(`<p class="align"><b>Paleta:</b> ${esc(canon.paleta)}</p>`);
  if (canon.mundo?.trim()) meta.push(`<p class="align"><b>Mundo:</b> ${esc(canon.mundo)}</p>`);
  return `<h2 class="sec">Cânone</h2>
${meta.length ? `<div class="verdict">${meta.join('\n')}</div>` : ''}
<div class="grid">${anchors || '<p class="muted">Sem personagens.</p>'}</div>`;
}

/**
 * Contact-sheet HTML AUTOCONTIDO da série em `<dir>/contact-sheet.html`: seção CÂNONE
 * (âncoras + descrições) no topo, depois os PAINÉIS em ordem com nota de consistência/
 * cena e a cena por baixo. Imagens embutidas como data URI (mime real); todo texto é
 * ESCAPADO (anti-injeção). Retorna o caminho do HTML.
 */
export function buildSerieContactSheet(serieId: string): string {
  const serie = loadSerie(serieId);
  if (!serie) throw new Error(`série "${serieId}" não encontrada`);

  const paineis = [...(serie.paineis ?? [])].sort((a, b) => a.n - b.n);
  const panelCards = paineis.length
    ? `<div class="grid">${paineis.map(renderPanel).join('\n')}</div>`
    : '<p class="muted">Nenhum painel nesta série.</p>';

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ateliê — Série — ${esc(serie.titulo)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>${esc(serie.titulo)}</h1>
  <div class="sub">série ${esc(serie.id)} · ${esc(serie.createdAt)} · ${paineis.length} painel(is)</div>
</header>
<main>
${canonSection(serie.canon)}
<h2 class="sec">Painéis</h2>
${panelCards}
</main>
</body>
</html>`;

  const out = path.join(serieDir(serieId), 'contact-sheet.html');
  fs.writeFileSync(out, html);
  return out;
}
