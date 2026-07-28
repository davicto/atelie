import fs from 'fs';
import os from 'os';
import path from 'path';
import { WRAPPER_CJS } from '../config';
import { run } from './runner';
import { nodeBin, nodeSpawnEnv } from './nodeBin';
import { extractJson } from './jsonx';
import { detectImageFormat } from './imageFormat';
import { loadSettings } from './settings';
import { judge as judgeClaude, askClaudeVision, buildRubric, coerce, fallback, type ClaudeBlock } from './judge';
import type { JudgeSpec, PanelVerdict, Verdict } from '../types';

export type { JudgeSpec, PanelVerdict } from '../types';

type StyleInfo = { nome: string; desc: string };

// ── Transporte MULTI-IMAGEM por provedor (rubrica já pronta) ────────────────
// Cada função envia N imagens + a rubrica e devolve o TEXTO cru do modelo. O
// caminho single-image (judgeOne/judgePanel) reusa estes helpers passando [1].

/** claude: N blocos `image` (mime real por magic bytes) + 1 bloco text. */
async function askClaudeImages(imagePaths: string[], rubric: string, model: string, signal?: AbortSignal): Promise<string> {
  const content: ClaudeBlock[] = [{ type: 'text', text: rubric }];
  for (const p of imagePaths) {
    const { mime } = detectImageFormat(p);
    const b64 = fs.readFileSync(p).toString('base64');
    content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } });
  }
  return askClaudeVision(content, model, signal);
}

/**
 * codex via BACKEND (o `codex exec` está quebrado neste ambiente): body `responses`
 * com N `input_image` (data URI) + a rubrica; RECONSTRÓI o texto dos eventos SSE do
 * stderr (delta → output_text.delta; fallback done.text). Devolve '' se ilegível.
 */
async function askCodexImages(spec: JudgeSpec, imagePaths: string[], rubric: string, signal?: AbortSignal): Promise<string> {
  const content: any[] = [];
  for (const p of imagePaths) {
    const { mime } = detectImageFormat(p);
    const b64 = fs.readFileSync(p).toString('base64');
    content.push({ type: 'input_image', image_url: `data:${mime};base64,${b64}` });
  }
  content.push({ type: 'input_text', text: rubric });
  const body = {
    model: spec.model || 'gpt-5.4',
    store: false,
    stream: true,
    input: [{ role: 'user', content }],
  };
  const tmp = path.join(os.tmpdir(), `atelie-judge-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tmp, JSON.stringify(body));
  try {
    const { stdout, stderr } = await run(
      nodeBin(),
      [WRAPPER_CJS, '--json', '--json-events', '--provider', 'codex', 'request', 'create', '--request-operation', 'responses', '--body-file', tmp],
      { timeoutMs: 300000, signal, env: nodeSpawnEnv() },
    ).done;

    let delta = '';
    let doneText = '';
    for (const src of [stderr, stdout]) {
      for (const line of src.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        let ev: any;
        try {
          ev = JSON.parse(t);
        } catch {
          continue;
        }
        const d = ev?.data ?? {};
        const type = d.type ?? ev?.type;
        if (type === 'response.output_text.delta') delta += String(d.delta ?? ev?.delta ?? '');
        else if (type === 'response.output_text.done') doneText = String(d.text ?? ev?.text ?? doneText);
      }
      if (delta || doneText) break; // achou no stderr → não varre stdout
    }
    // NÃO cair no envelope JSON do wrapper (extractJson o parsearia, mascarando a falha de SSE).
    return delta || doneText;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Transporte multi-imagem PÚBLICO: despacha por provedor e devolve o texto cru do
 * modelo. A `rubric` já deve conter o schema pedido. Reutilizado pelo juiz de
 * consistência da série.
 */
export async function askImagesRaw(spec: JudgeSpec, imagePaths: string[], rubric: string, signal?: AbortSignal): Promise<string> {
  if (spec.provider === 'codex') return askCodexImages(spec, imagePaths, rubric, signal);
  return askClaudeImages(imagePaths, rubric, spec.model, signal);
}

/**
 * Juiz codex via BACKEND (o `codex exec` está quebrado neste ambiente). Monta um
 * body `responses` com input_image (data URI) + rubrica, roda o wrapper e RECONSTRÓI
 * o texto dos eventos SSE do stderr (delta → output_text.delta; fallback done.text).
 */
async function judgeCodex(spec: JudgeSpec, pngPath: string, request: string, style: StyleInfo, threshold: number, signal?: AbortSignal): Promise<Verdict> {
  const rubric = buildRubric(request, style, threshold, true);
  const full = await askCodexImages(spec, [pngPath], rubric, signal);
  if (!full) return fallback('(SSE do codex ilegível)');
  return coerce(extractJson(full), full, threshold);
}

/** Julga UMA imagem com UM juiz do painel, despachando por provedor. */
export async function judgeOne(
  spec: JudgeSpec,
  pngPath: string,
  request: string,
  style: StyleInfo,
  approveThreshold?: number,
  signal?: AbortSignal,
): Promise<Verdict> {
  const threshold = approveThreshold ?? loadSettings().approveThreshold;
  if (spec.provider === 'codex') return judgeCodex(spec, pngPath, request, style, threshold, signal);
  return judgeClaude(pngPath, request, style, spec.model, threshold, signal);
}

/** Julga sem propagar exceção: erro de um provedor vira veredito de falha. */
async function safeJudgeOne(spec: JudgeSpec, pngPath: string, request: string, style: StyleInfo, threshold: number, signal?: AbortSignal): Promise<Verdict> {
  try {
    return await judgeOne(spec, pngPath, request, style, threshold, signal);
  } catch (err: any) {
    const v = fallback(String(err?.message ?? err));
    v.alinhamento = `(juiz ${spec.label} falhou)`;
    return v;
  }
}

function dedupCap(items: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

/** Verdict sem conteúdo útil (fallback do juiz): usado só p/ escolher crítico quando ninguém deu nota. */
function isFallbackVerdict(v: Verdict): boolean {
  return v.nota == null && (v.alinhamento === '(veredito ilegível)' || v.alinhamento.startsWith('(juiz '));
}
function hasSuggestion(v: Verdict): boolean {
  return Boolean(v.prompt_sugerido?.trim() || v.sugestao_melhoria?.trim());
}

/** Consolida os votos: média das notas, aprovado por limiar, problemas união, crítica do mais duro. */
export function consolidate(painel: Array<{ spec: JudgeSpec; verdict: Verdict }>, threshold: number): PanelVerdict {
  const notas = painel.map((p) => p.verdict.nota).filter((n): n is number => n != null && Number.isFinite(n));
  // Aprovação usa a média CRUA (não arredondada) — arredondar antes desloca o limiar em 0,5.
  const mean = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
  const aprovado = mean != null && mean >= threshold;
  const media = mean != null ? Math.round(mean) : null; // Math.round só p/ o campo de exibição.

  // Juiz de MENOR nota (mais crítico) dita sugestão/prompt/alinhamento.
  let critico = painel[0];
  let min = Infinity;
  for (const p of painel) {
    const n = p.verdict.nota;
    if (n != null && n < min) {
      min = n;
      critico = p;
    }
  }
  // Nenhuma nota finita: não caia em painel[0] arbitrário — prefira quem trouxe crítica
  // acionável; senão o primeiro juiz não-fallback; senão painel[0].
  if (min === Infinity) {
    critico = painel.find((p) => hasSuggestion(p.verdict)) ?? painel.find((p) => !isFallbackVerdict(p.verdict)) ?? painel[0];
  }

  const problemas = dedupCap(
    painel.flatMap((p) => p.verdict.problemas ?? []),
    6,
  );

  return {
    aprovado,
    nota: media,
    alinhamento: critico?.verdict.alinhamento ?? '',
    problemas,
    sugestao_melhoria: critico?.verdict.sugestao_melhoria ?? '',
    prompt_sugerido: critico?.verdict.prompt_sugerido ?? '',
    painel,
  };
}

/** Julga a imagem com TODOS os juízes do painel EM PARALELO e consolida. */
export async function judgePanel(
  pngPath: string,
  request: string,
  style: StyleInfo,
  panel: JudgeSpec[],
  approveThreshold?: number,
  signal?: AbortSignal,
): Promise<PanelVerdict> {
  const threshold = approveThreshold ?? loadSettings().approveThreshold;
  const specs = panel.length ? panel : loadSettings().judgePanel;
  const painel = await Promise.all(
    specs.map(async (spec) => ({ spec, verdict: await safeJudgeOne(spec, pngPath, request, style, threshold, signal) })),
  );
  return consolidate(painel, threshold);
}
