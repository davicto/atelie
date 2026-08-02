import fs from 'fs';
import os from 'os';
import path from 'path';
import { run } from './runner';
import { codexBinOuPath } from './codexEmbedded';
import type { GenJob, GenMeta, ProgressEvent } from '../types';

// Backend de geração que fala com a CLI `codex` DIRETO, sem o wrapper
// `gpt_image_2_skill.cjs` (ver config.ts — o repo que o hospedava foi apagado).
//
// Usa a ferramenta EMBUTIDA `image_gen` do Codex, que roda sob a auth do ChatGPT
// e NÃO consome OPENAI_API_KEY (o fallback `scripts/image_gen.py` da skill
// `imagegen`, esse sim, cobraria API — nunca o acionamos).
//
// Contrato observado em runtime (28/07/2026, codex-cli 0.145.0):
//   `codex exec --json` imprime JSONL em stdout, um evento por linha:
//     {"type":"thread.started","thread_id":"<uuid>"}
//     {"type":"turn.started"}
//     {"type":"item.started"|"item.completed","item":{...}}
//     {"type":"turn.completed","usage":{...}}
//   O tool embutido NÃO aceita caminho de destino: salva sempre em
//   <CODEX_HOME>/generated_images/<thread_id>/<call_id>.png. Por isso o
//   `thread_id` é a ÂNCORA para achar o arquivo — o caminho também aparece na
//   prosa da mensagem final do agente, mas isso é texto de LLM e não é confiável.
//   `codex exec` TRAVA se o stdin ficar aberto; `run()` já usa stdio 'ignore'.

/** Raiz de dados da CLI Codex (respeita `CODEX_HOME`, como a própria CLI). */
function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

/** Geração de imagem é lenta; timeout generoso e ajustável. */
function timeoutMs(): number {
  const n = Number(process.env.ATELIE_CODEX_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 10 * 60_000;
}

interface BackendError extends Error {
  code?: string;
  raw?: string;
}

function erro(message: string, code: string, raw?: string): BackendError {
  return Object.assign(new Error(message), { code, raw });
}

/**
 * Instrução para o agente. Precisa ser imperativa: sem isso o modelo às vezes
 * "ajuda" escrevendo código ou pedindo confirmação em vez de gerar o bitmap.
 */
function buildInstruction(job: GenJob, size: string, quality: string): string {
  // O prompt vem PRIMEIRO e delimitado. Numa versão anterior ele ficava depois
  // de um bloco de meta-regras e o modelo derivou do assunto (pedi "gato de
  // óculos lendo jornal" e veio um átrio de biblioteca): enterrar o pedido sob
  // instruções faz o agente tratá-lo como sugestão, não como especificação.
  const l: string[] = [
    'Gere UMA imagem com a ferramenta EMBUTIDA `image_gen`, usando como prompt VERBATIM,',
    'na íntegra e sem reinterpretar, o texto entre as marcas <prompt> abaixo.',
    '',
    '<prompt>',
    job.prompt,
    '</prompt>',
    '',
  ];
  if (job.mode === 'edit') {
    l.push(
      'É uma EDIÇÃO da(s) imagem(ns) anexada(s): preserve identidade dos personagens, traço,',
      'paleta e composição; aplique só o que o <prompt> pede.',
    );
  }
  if (job.mode === 'transparent') {
    // gpt-image-2 não tem fundo transparente nativo (ver SKILL.md da `imagegen`);
    // o caminho suportado é chroma-key + recorte local.
    l.push(
      'Fundo: chroma-key VERDE PURO (#00FF00), liso, uniforme, sem sombras, para recorte posterior.',
      'O sujeito NÃO pode conter nenhum tom de verde.',
    );
  }
  l.push(
    `Dimensão alvo ${size} (aproximada serve), qualidade ${quality}.`,
    'Não escreva nem execute código, não use `scripts/image_gen.py`, não peça confirmação.',
  );
  return l.join('\n');
}

/** Referências do modo edit: `-i` é repetível e anexa a imagem ao turno inicial. */
function refsDoJob(job: GenJob): string[] {
  if (job.refs?.length) return job.refs.filter(Boolean);
  return job.refPng ? [job.refPng] : [];
}

/**
 * Localiza a imagem gerada na pasta do thread. Pega a mais recente: se o modelo
 * desobedecer e gerar mais de uma, a última é a que vale.
 */
function acharGerada(threadId: string): string | undefined {
  const dir = path.join(codexHome(), 'generated_images', threadId);
  let nomes: string[];
  try {
    nomes = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  const imgs = nomes
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => {
      const p = path.join(dir, f);
      try {
        return { p, m: fs.statSync(p).mtimeMs };
      } catch {
        return { p, m: 0 };
      }
    })
    .sort((a, b) => b.m - a.m);
  return imgs[0]?.p;
}

/**
 * Recorta o chroma-key verde via helper Python que acompanha a skill `imagegen`.
 * Se o helper ou o Python não existirem, LANÇA — devolver um PNG opaco quando o
 * pedido era transparente seria mentir sobre o resultado.
 */
async function recortarChroma(png: string, signal?: AbortSignal): Promise<void> {
  const helper = path.join(codexHome(), 'skills', '.system', 'imagegen', 'scripts', 'remove_chroma_key.py');
  if (!fs.existsSync(helper)) {
    throw erro(`helper de transparência não encontrado: ${helper}`, 'transparent_helper_missing');
  }
  const bin = process.env.ATELIE_PYTHON_BIN || 'python';
  const args = [
    helper,
    '--input', png,
    '--out', png,
    // Recortamos no lugar, e o helper recusa sobrescrever sem isto.
    '--force',
    // O modelo NUNCA devolve #00FF00 exato (medido: #07ea10), então pedir a cor
    // pura não casava pixel nenhum e o recorte saía opaco — mentindo sobre o
    // resultado. `border` amostra a cor real da moldura da imagem.
    '--auto-key', 'border',
    // A sombra projetada sobre o chroma vira verde escuro e sobrevive a uma
    // tolerância estreita, deixando halo. 90 limpa a franja; muito acima disso
    // começaria a comer partes legitimamente verdes do próprio desenho.
    '--tolerance', '90',
    '--despill',
    '--spill-cleanup',
    '--edge-contract', '1',
  ];
  const r = await run(bin, args, { timeoutMs: 120_000, signal }).done;
  if (r.code !== 0) {
    throw erro(
      `recorte de transparência falhou (${bin} saiu com ${r.code}): ${(r.stderr || r.stdout).trim().slice(0, 400)}`,
      'transparent_verification_failed',
    );
  }
}

/**
 * Gera (ou edita, ou gera transparente) via `codex exec` e materializa o
 * resultado em `job.outPath` — o tool embutido não escolhe destino, então
 * copiamos por cima.
 */
export async function generateViaCli(
  job: GenJob,
  sizeAlias: string,
  quality: string,
  onProgress?: (e: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<{ pngPath: string; meta: GenMeta }> {
  // Progresso monotônico: o agente costuma emitir uma `agent_message` ("vou usar
  // a skill…") ANTES de executar, o que fazia a barra saltar 85% → 25% → 85%.
  let ultimoPercent = 0;
  const emit = (phase: string, percent: number, message: string) => {
    ultimoPercent = Math.max(ultimoPercent, percent);
    onProgress?.({ jobId: job.id, phase, percent: ultimoPercent, message });
  };

  // A instrução vai por STDIN (`-`), NUNCA como argumento: no Windows as CLIs são
  // shims `.cmd` e o cmd.exe TRUNCA um argumento na primeira quebra de linha —
  // o prompt chegava mutilado e o modelo inventava a cena. Por stdin não há
  // escape de shell nenhum, o que também protege prompts com aspas, `%` e `&`.
  const args = ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only'];
  for (const r of refsDoJob(job)) args.push('-i', r);
  args.push('-');

  let threadId = '';
  let mensagemFinal = '';

  const handle = run(codexBinOuPath(), args, {
    // cwd neutro: o agente não tem o que fazer no repo do usuário, e
    // `--skip-git-repo-check` o libera de exigir um repositório git.
    cwd: os.tmpdir(),
    timeoutMs: timeoutMs(),
    signal,
    stdinData: buildInstruction(job, sizeAlias, quality),
    onStdoutLine: (line) => {
      const t = line.trim();
      if (!t) return;
      let ev: any;
      try {
        ev = JSON.parse(t);
      } catch {
        return; // linha parcial — ignora
      }
      switch (ev.type) {
        case 'thread.started':
          threadId = ev.thread_id ?? '';
          emit('request_started', 5, 'sessão Codex iniciada');
          break;
        case 'turn.started':
          emit('request_started', 12, 'gerando imagem…');
          break;
        case 'item.started':
          emit('working', 25, 'trabalhando…');
          break;
        case 'item.completed':
          if (ev.item?.type === 'agent_message') {
            mensagemFinal = ev.item.text ?? mensagemFinal;
            emit('output_item_done', 85, 'imagem produzida');
          }
          break;
        case 'turn.completed':
          emit('response_completed', 95, 'finalizando…');
          break;
      }
    },
  });

  const { code, stderr } = await handle.done;

  if (code !== 0) {
    const s = stderr.trim();
    // 401 costuma significar token invalidado no servidor — `codex login status`
    // NÃO detecta isso (ele só lê o auth.json local), então explicitamos.
    const auth = /401|token_invalidated|refresh_token_invalidated/i.test(s);
    throw erro(
      auth
        ? 'auth do Codex inválida (401) — rode `codex login`'
        : `codex exec falhou (exit ${code}): ${s.slice(-400) || 'sem stderr'}`,
      auth ? 'auth_missing' : 'runtime_unavailable',
      s,
    );
  }

  if (!threadId) {
    throw erro('não foi possível determinar o thread_id da sessão Codex', 'parse_failed', stderr);
  }

  const origem = acharGerada(threadId);
  if (!origem) {
    throw erro(
      `o Codex não produziu imagem nesta sessão. Resposta do agente: ${mensagemFinal.trim().slice(0, 300) || '(vazia)'}`,
      'output_missing',
      stderr,
    );
  }

  fs.mkdirSync(path.dirname(job.outPath), { recursive: true });
  fs.copyFileSync(origem, job.outPath);

  if (job.mode === 'transparent') {
    emit('working', 97, 'recortando fundo…');
    await recortarChroma(job.outPath, signal);
  }

  emit('output_saved', 100, 'salvo');

  return {
    pngPath: job.outPath,
    meta: { resolved: 'codex-cli', sizeRequested: sizeAlias, model: 'image_gen (embutido)' },
  };
}

/** Runtime disponível = a CLI `codex` responde a `--version`. */
export async function doctorViaCli(): Promise<{ resolved: string; ok: boolean }> {
  try {
    const r = await run(codexBinOuPath(), ['--version'], { timeoutMs: 15_000 }).done;
    return { resolved: r.code === 0 ? 'codex-cli' : '', ok: r.code === 0 };
  } catch {
    return { resolved: '', ok: false };
  }
}

/** Versão da CLI `codex` (ex.: "codex-cli 0.145.0"), para o doctor. */
export async function versionViaCli(): Promise<string | undefined> {
  try {
    const r = await run(codexBinOuPath(), ['--version'], { timeoutMs: 15_000 }).done;
    const t = (r.stdout || r.stderr).trim().split('\n')[0]?.trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Auth do Codex. ATENÇÃO: `codex login status` só inspeciona o `auth.json`
 * local — ele responde "Logged in" mesmo com o token invalidado no servidor
 * (visto em 28/07/2026). Confirmar de verdade exigiria uma chamada real, que
 * custaria tempo/tokens a cada abertura do app; então isto é um indicador
 * otimista, e o erro real aparece como `auth_missing` na primeira geração.
 */
export async function authInspectViaCli(): Promise<{ codexReady: boolean }> {
  try {
    const r = await run(codexBinOuPath(), ['login', 'status'], { timeoutMs: 20_000 }).done;
    return { codexReady: r.code === 0 && /logged in/i.test(r.stdout + r.stderr) };
  } catch {
    return { codexReady: false };
  }
}
