import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';

import { checkEnvironment, desligarClisAusentes } from './env';
import { abortarLogin, codexBin, iniciarLogin, loginEmCurso, loginStatus } from '../lib/codexEmbedded';
import { SESSIONS_ROOT } from '../config';
import { sessionDir } from '../state/manifest';
import { estimateSessionCost } from '../lib/cost';
import {
  deleteUserStyle,
  findStyle,
  getAllStyles,
  loadUserStyles,
  saveUserStyle,
  seedBundledStyles,
  styleAssetsDir,
  uniqueStyleId,
} from '../lib/userStyles';
import { generateStyleDef } from '../lib/styleGenerator';
import { coerceUploads, saveImagesTo } from '../lib/uploads';
import {
  addToLibrary,
  approvedCast,
  castRefsDir,
  createProject,
  deleteProject,
  findMember,
  libraryDir,
  listProjects,
  loadProject,
  removeFromLibrary,
  removeMember,
  saveProject,
  summarize,
  uniqueMemberId,
  type Briefing,
  type CastMember,
  type LibraryItem,
  type Project,
} from '../lib/projects';
import { generateSprite } from '../lib/sprite';
import { listSessions, loadFullSession } from '../lib/sessions';
import { buildContactSheet } from '../lib/contactSheet';
import { buildSerieContactSheet } from '../lib/serie/contactSheet';
import { listSeries, loadSerie, serieDir } from '../lib/serie/store';
import { capabilityMap, loadSettings, saveSettings, validateRunClis } from '../lib/settings';
import { runAuto, type IterationResult, type RunOptions } from '../lib/pipeline';
import { runSerie, type RunSerieOpts, type SerieSpec } from '../lib/serie/serieRun';
import type { JobResult, PanelVerdict, Session, Settings, Verdict } from '../types';
import type { StyleDef } from '../styles/catalog.types';

// Raiz do repo a partir deste arquivo (src/server → ../.. = repo). UI opcional em ui/dist.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
// Em dev (`tsx src/server/serve.ts`) `ROOT/ui/dist` resolve certo. Quando o server é
// empacotado (bundle esbuild → dist-electron/main.cjs), `HERE` muda de lugar, então o
// main do Electron passa o caminho correto via `ATELIE_UI_DIST`. Override opcional,
// retrocompatível: sem a env, comportamento idêntico ao anterior.
const UI_DIST = process.env.ATELIE_UI_DIST || path.join(ROOT, 'ui', 'dist');

// ── Serialização de veredito/resultado (espelha o headless do cli.tsx) ───────
function verdictJson(v?: Verdict | PanelVerdict) {
  if (!v) return null;
  const painel = (v as PanelVerdict).painel;
  return {
    nota: v.nota,
    aprovado: v.aprovado,
    alinhamento: v.alinhamento,
    problemas: v.problemas,
    sugestao_melhoria: v.sugestao_melhoria,
    prompt_sugerido: v.prompt_sugerido,
    painel: painel?.map((p) => ({
      provider: p.spec.provider,
      model: p.spec.model,
      nota: p.verdict?.nota ?? null,
      aprovado: p.verdict?.aprovado ?? null,
    })),
  };
}

function runResultJson(session: Session, iterations: IterationResult[], best?: JobResult) {
  return {
    sessionId: session.id,
    dir: sessionDir(session.id),
    request: session.request,
    versionsPerStyle: session.versionsPerStyle,
    iterations: iterations.map((it) => ({
      iteration: it.iteration,
      durationMs: it.durationMs,
      results: it.results.map((r) => ({
        styleId: r.job.styleId,
        index: r.job.index,
        pngPath: r.pngPath ?? null,
        ok: r.ok,
        verdict: verdictJson(r.verdict),
      })),
      best: it.best
        ? { styleId: it.best.job.styleId, index: it.best.job.index, pngPath: it.best.pngPath ?? null, nota: it.best.verdict?.nota ?? null }
        : null,
    })),
    best: best ? { styleId: best.job.styleId, pngPath: best.pngPath ?? null, nota: best.verdict?.nota ?? null } : null,
    durationMs: session.totalDurationMs ?? null,
    estimatedCostUsd: estimateSessionCost(session).usd,
  };
}

/** Normaliza `--size`: só `wide` precisa de tradução; o resto o backend resolve. */
function resolveSize(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const raw = v.trim();
  if (!raw) return undefined;
  return raw.toLowerCase() === 'wide' ? '2048x896' : raw;
}

/** Projeção de um StyleDef para o portfólio da UI (sem o template gigante). */
function styleInfo(s: StyleDef) {
  return {
    id: s.id,
    nome: s.nome,
    grupo: s.grupo,
    desc: s.desc,
    origem: s.origem ?? 'builtin',
    refs: s.refs ?? [],
    criadoEm: s.criadoEm ?? null,
  };
}

/** Estilo escrito à mão pelo usuário (sem passar pela Claude). */
function manualStyle(id: string, body: { nome?: string; template?: string; grupo?: string }, descricao: string): StyleDef {
  const nome = body.nome?.trim() || descricao.slice(0, 40).trim() || id;
  const t = body.template?.trim();
  return {
    id,
    nome,
    desc: descricao.slice(0, 200).trim(),
    grupo: body.grupo?.trim() || 'Meus estilos',
    template: t && t.includes('{subject}') ? t : `${t || descricao}. {subject}. {scene} {extra}`,
    defaults: { size: '2K', quality: 'high', aspect: 'square', background: 'auto', format: 'png' },
    origem: 'user',
  };
}

/** Personagem do elenco projetado para a UI (mesmo shape do project.json). */
function memberJson(m: CastMember) {
  return {
    id: m.id,
    nome: m.nome,
    descricao: m.descricao,
    refs: m.refs,
    spritePng: m.spritePng ?? null,
    aprovado: m.aprovado,
    ajuste: m.ajuste ?? null,
    atualizadoEm: m.atualizadoEm ?? null,
  };
}

function projectJson(p: Project) {
  return {
    ...summarize(p),
    elenco: p.elenco.map(memberJson),
    briefings: p.briefings,
    serieIds: p.serieIds,
    // Imagens que ainda existem em disco: uma entrada órfã (pasta apagada na mão)
    // viraria miniatura quebrada na UI.
    biblioteca: p.biblioteca.filter((b) => fs.existsSync(b.png)),
    capaItemId: p.capaItemId ?? null,
  };
}

type Send = (obj: unknown) => void;

// Superfície mínima do socket `ws` que usamos (evita depender de @types/ws).
interface WsSocket {
  send(data: string): void;
  on(event: 'message', cb: (data: unknown) => void): void;
  on(event: string, cb: (...args: any[]) => void): void;
}

// ── Handlers do WebSocket (1 run por vez por socket) ─────────────────────────
async function handleRun(payload: any, runId: string, send: Send): Promise<void> {
  const prompt = typeof payload?.prompt === 'string' ? payload.prompt : '';
  const styles: string[] = Array.isArray(payload?.styles) ? payload.styles.map((s: unknown) => String(s)) : [];
  if (!prompt || !styles.length) {
    send({ type: 'error', runId, message: 'run requer prompt e styles[]' });
    return;
  }
  const unknown = styles.filter((id) => !findStyle(id));
  if (unknown.length) {
    send({ type: 'error', runId, message: `estilo(s) inexistente(s): ${unknown.join(', ')}` });
    return;
  }

  const settings = loadSettings();
  const genProvider = payload?.genProvider === 'codex' ? payload.genProvider : undefined;
  const judgeMode = payload?.judgeMode === 'painel' || payload?.judgeMode === 'unico' ? payload.judgeMode : undefined;

  // Respeita enabledClis ANTES de gerar: CLI desabilitada → erro claro sem gastar imagem.
  const err = validateRunClis(settings, { genProvider, judgeMode, singleJudge: settings.singleJudge, judgePanel: settings.judgePanel });
  if (err) {
    send({ type: 'error', runId, message: err });
    return;
  }

  const versionsNum = Number(payload?.versions);
  const iterateNum = Number(payload?.iterate);
  const opts: RunOptions & { maxIterations: number } = {
    request: prompt,
    styleIds: styles,
    versionsPerStyle: Number.isFinite(versionsNum) && versionsNum > 0 ? versionsNum : settings.defaultVersionsPerStyle,
    quality: typeof payload?.quality === 'string' ? payload.quality : settings.defaultQuality,
    maxIterations: Number.isFinite(iterateNum) && iterateNum > 0 ? iterateNum : 0,
    onLog: (e) => send({ type: 'log', runId, entry: e }),
    onProgress: (ev) => send({ type: 'progress', runId, ev }),
  };
  if (genProvider) opts.genProvider = genProvider;
  if (judgeMode) opts.judgeMode = judgeMode;
  const avoid = typeof payload?.avoid === 'string' ? payload.avoid.trim() : '';
  if (avoid) opts.avoid = avoid;
  const size = resolveSize(payload?.size);
  if (size) opts.size = size;

  send({ type: 'started', runId, kind: 'run' });
  const { session, iterations, best } = await runAuto(opts);
  send({ type: 'done', runId, result: runResultJson(session, iterations, best) });
}

/**
 * Gera (ou regera) o sprite de um personagem do elenco de um projeto. O sprite
 * nasce SEMPRE reprovado — quem valida é o usuário na tela do projeto.
 */
async function handleSpriteRun(payload: any, runId: string, send: Send): Promise<void> {
  const projectId = String(payload?.projectId ?? '');
  const memberId = String(payload?.memberId ?? '');
  const project = projectId ? loadProject(projectId) : null;
  if (!project) {
    send({ type: 'error', runId, message: `projeto "${projectId}" não encontrado` });
    return;
  }
  const member = findMember(project, memberId);
  if (!member) {
    send({ type: 'error', runId, message: `personagem "${memberId}" não encontrado no projeto` });
    return;
  }
  if (!loadSettings().enabledClis.codex) {
    send({ type: 'error', runId, message: 'CLI codex está desligada — o sprite é gerado por ela.' });
    return;
  }

  const startedAt = Date.now();
  send({ type: 'started', runId, kind: 'sprite-run' });
  await generateSprite(project, member, {
    size: resolveSize(payload?.size),
    quality: typeof payload?.quality === 'string' ? payload.quality : undefined,
    extra: typeof payload?.extra === 'string' && payload.extra.trim() ? payload.extra.trim() : undefined,
    onProgress: (ev) => send({ type: 'progress', runId, ev }),
    onLog: (m) =>
      send({ type: 'log', runId, entry: { ts: new Date().toISOString(), elapsedMs: Date.now() - startedAt, level: 'info', msg: m } }),
  });
  saveProject(project);
  send({ type: 'done', runId, result: { projectId: project.id, member: memberJson(member) } });
}

async function handleSerieRun(payload: any, runId: string, send: Send): Promise<void> {
  const spec = payload?.spec;
  if (!spec || typeof spec !== 'object' || !spec.titulo) {
    send({ type: 'error', runId, message: 'serie-run requer payload.spec com ao menos { titulo, paineis }' });
    return;
  }

  // Âncora é caminho de arquivo: nunca aceita do cliente. Só o elenco aprovado do
  // projeto (resolvido aqui, no servidor) pode reaproveitar um sprite validado.
  if (spec.canon?.personagens) {
    spec.canon.personagens = spec.canon.personagens.map((p: any) => ({ nome: p?.nome, descricao: p?.descricao }));
  }
  const project = spec.projectId ? loadProject(String(spec.projectId)) : null;
  if (spec.projectId && !project) {
    send({ type: 'error', runId, message: `projeto "${spec.projectId}" não encontrado` });
    return;
  }
  if (project) {
    const elenco = approvedCast(project);
    if (!elenco.length) {
      send({ type: 'error', runId, message: 'nenhum personagem aprovado neste projeto — gere e valide os sprites antes de rodar a série' });
      return;
    }
    spec.estilo = spec.estilo || project.estiloId || 'custom';
    spec.canon = {
      ...(spec.canon ?? {}),
      personagens: elenco.map((m) => ({ nome: m.nome, descricao: m.descricao, anchorPng: m.spritePng })),
    };
  }
  // runSerie valida as CLIs habilitadas no topo (lança ANTES de qualquer geração);
  // o catch do socket converte o erro em {type:'error'}.
  const startedAt = Date.now();
  const size = resolveSize(payload?.size);
  send({ type: 'started', runId, kind: 'serie-run' });

  // O id só nasce dentro do runSerie; onAttempt é criado antes e lê daqui.
  const serieIdRef = { id: '' };

  // Toda imagem que sai do gerador é copiada para a biblioteca NA HORA, aprovada
  // ou não: o arquivo do painel é sobrescrito pela tentativa seguinte, e o run
  // pode ser interrompido no meio. Assim nada do que já foi pago se perde.
  const onAttempt: RunSerieOpts['onAttempt'] = project
    ? (info) => {
        addToLibrary(project.id, info.pngPath, {
          cena: info.painel.cena,
          serieId: serieIdRef.id,
          painel: info.painel.n,
          tentativa: info.tentativa,
          consistencia: info.veredito.consistencia,
          cenaNota: info.veredito.cenaNota,
          aprovado: info.aprovado,
        });
      }
    : undefined;

  // 0 = ilimitado; ausente/inválido = o default das configurações.
  const conc = Number(payload?.concurrency);
  const serie = await runSerie(spec as SerieSpec, {
    size,
    quality: typeof payload?.quality === 'string' ? payload.quality : undefined,
    ...(Number.isFinite(conc) && conc >= 0 ? { concurrency: Math.round(conc) } : {}),
    onLog: (m) => send({ type: 'log', runId, entry: { ts: new Date().toISOString(), elapsedMs: Date.now() - startedAt, level: 'info', msg: m } }),
    onProgress: (ev) => send({ type: 'progress', runId, ev }),
    onAttempt,
    onSerieCreated: (s) => {
      serieIdRef.id = s.id;
      if (!project) return;
      // Liga a série ao projeto JÁ NO INÍCIO: se o run morrer no meio, o que foi
      // gerado continua alcançável a partir do projeto.
      const fresh = loadProject(project.id);
      if (!fresh) return;
      fresh.serieIds = [s.id, ...fresh.serieIds.filter((x) => x !== s.id)];
      saveProject(fresh);
    },
  });
  let contactSheet: string | null = null;
  try {
    contactSheet = buildSerieContactSheet(serie.id);
  } catch {
    contactSheet = null;
  }
  send({
    type: 'done',
    runId,
    result: {
      serieId: serie.id,
      dir: serieDir(serie.id),
      canon: { personagens: serie.canon.personagens.map((p) => ({ nome: p.nome, anchorPng: p.anchorPng ?? null })) },
      paineis: (serie.paineis ?? []).map((p) => ({
        n: p.n,
        cena: p.cena,
        pngPath: p.pngPath ?? null,
        consistencia: p.consistencia ?? null,
        cenaNota: p.cenaNota ?? null,
        aprovado: p.aprovado ?? false,
      })),
      contactSheet,
    },
  });
}

function attachWs(socket: WsSocket): void {
  let running = false;
  const send: Send = (obj) => {
    try {
      socket.send(JSON.stringify(obj));
    } catch {
      /* socket já fechou — ignora */
    }
  };

  socket.on('message', async (raw: unknown) => {
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send({ type: 'error', runId: null, message: 'mensagem não é JSON válido' });
      return;
    }
    // 1 run por socket: se já roda, recusa (não enfileira) com mensagem clara.
    if (running) {
      send({ type: 'error', runId: null, message: 'já há um run em andamento neste socket; aguarde terminar' });
      return;
    }
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    running = true;
    try {
      if (msg?.type === 'run') await handleRun(msg.payload ?? {}, runId, send);
      else if (msg?.type === 'serie-run') await handleSerieRun(msg.payload ?? {}, runId, send);
      else if (msg?.type === 'sprite-run') await handleSpriteRun(msg.payload ?? {}, runId, send);
      else send({ type: 'error', runId, message: `tipo desconhecido: ${msg?.type ?? '(vazio)'}` });
    } catch (e: any) {
      send({ type: 'error', runId, message: String(e?.message ?? e) });
    } finally {
      running = false;
    }
  });
}

// ── Rotas /api (plugin registrado APÓS o @fastify/websocket) ─────────────────
async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/doctor', async () => checkEnvironment());

  // ── Onboarding: login ChatGPT pelo Codex CLI embutido ────────────────────
  // Estas rotas existem para o wizard de 1ª execução conseguir autenticar o
  // usuário sem terminal. O login roda em background; a UI faz polling do status.
  app.get('/api/auth/codex', async () => ({
    ...(await loginStatus()),
    emCurso: loginEmCurso(),
    binEmbutido: codexBin() != null,
  }));

  app.post('/api/auth/codex/login', async () => iniciarLogin());

  app.post('/api/auth/codex/cancelar', async () => {
    abortarLogin();
    return { ok: true };
  });

  // Serve um arquivo do disco APENAS se estiver sob ~/.atelie (SESSIONS_ROOT/ATELIE_HOME).
  // Usado pelas <img> das sessões/séries e para abrir os contact-sheets no navegador.
  const CONTENT_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };
  app.get('/api/file', async (req, reply) => {
    const raw = (req.query as { path?: string } | undefined)?.path;
    if (typeof raw !== 'string' || !raw.trim()) return reply.code(400).send({ error: 'parâmetro "path" obrigatório' });
    const abs = path.resolve(raw);
    const rootSep = SESSIONS_ROOT.endsWith(path.sep) ? SESSIONS_ROOT : SESSIONS_ROOT + path.sep;
    // Barreira de path traversal: só dentro de ~/.atelie.
    if (abs !== SESSIONS_ROOT && !abs.startsWith(rootSep)) return reply.code(403).send({ error: 'acesso negado: caminho fora de ~/.atelie' });
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      return reply.code(404).send({ error: 'arquivo não encontrado' });
    }
    if (!stat.isFile()) return reply.code(404).send({ error: 'não é um arquivo' });
    reply.type(CONTENT_TYPES[path.extname(abs).toLowerCase()] ?? 'application/octet-stream');
    return reply.send(fs.createReadStream(abs));
  });

  // ── Portfólio de estilos ──────────────────────────────────────────────────
  app.get('/api/styles', async () => getAllStyles().map(styleInfo));

  app.get('/api/styles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = findStyle(id);
    if (!s) return reply.code(404).send({ error: `estilo "${id}" não encontrado` });
    return { ...styleInfo(s), template: s.template, defaults: s.defaults };
  });

  /**
   * Cria um estilo do usuário. `descricao` é o texto explicativo; `imagens` são
   * data URLs de referência. Com `autor: 'claude'` (default) a Claude vê as
   * imagens e escreve o StyleDef; com `autor: 'manual'` o template vem do corpo.
   */
  app.post('/api/styles', async (req, reply) => {
    const body = (req.body ?? {}) as {
      nome?: string;
      descricao?: string;
      grupo?: string;
      template?: string;
      autor?: 'claude' | 'manual';
      imagens?: unknown;
    };
    const descricao = String(body.descricao ?? '').trim();
    if (!descricao) return reply.code(400).send({ error: 'descrição do estilo é obrigatória' });

    const imagens = coerceUploads(body.imagens);
    const settings = loadSettings();
    const autor = body.autor === 'manual' ? 'manual' : 'claude';
    if (autor === 'claude' && !settings.enabledClis.claude) {
      return reply.code(400).send({ error: 'a CLI claude está desligada — ligue-a no Ambiente ou crie o estilo em modo manual' });
    }

    // Id definitivo primeiro: as referências moram em ~/.atelie/styles/<id>/.
    const id = uniqueStyleId(body.nome?.trim() || descricao.slice(0, 40));
    let refs: string[] = [];
    try {
      if (imagens.length) refs = saveImagesTo(styleAssetsDir(id), imagens);
    } catch (e: any) {
      return reply.code(400).send({ error: String(e?.message ?? e) });
    }

    let style: StyleDef;
    try {
      if (autor === 'claude') {
        const gen = await generateStyleDef({ descricao, imagens: refs });
        style = { ...gen.style, id, nome: body.nome?.trim() || gen.style.nome };
      } else {
        style = manualStyle(id, body, descricao);
      }
    } catch (e: any) {
      // Sem estilo salvo, as referências no disco viram lixo — limpa.
      try {
        fs.rmSync(styleAssetsDir(id), { recursive: true, force: true });
      } catch {
        /* nada a limpar */
      }
      return reply.code(502).send({ error: `não foi possível montar o estilo: ${String(e?.message ?? e)}` });
    }

    if (body.grupo?.trim()) style.grupo = body.grupo.trim();
    style.refs = refs;
    style.criadoEm = new Date().toISOString();
    saveUserStyle(style);
    return reply.code(201).send({ ...styleInfo(style), template: style.template, defaults: style.defaults });
  });

  /**
   * Troca a capa de um estilo DO USUÁRIO: elege uma das refs (refIndex) e/ou anexa
   * imagens novas, que entram já como capa. A capa é sempre `refs[0]`.
   *
   * Estilos do catálogo são imutáveis por decisão de produto — as capas deles vêm
   * do seed (style-assets.json) e não podem ser editadas aqui.
   */
  app.put('/api/styles/:id/cover', async (req, reply) => {
    const { id } = req.params as { id: string };
    const style = findStyle(id);
    if (!style) return reply.code(404).send({ error: `estilo "${id}" não encontrado` });
    if (style.origem !== 'user') {
      return reply.code(403).send({ error: 'estilos do catálogo não podem ter a capa alterada — só os que você criou' });
    }
    const b = (req.body ?? {}) as { refIndex?: number; imagens?: unknown };
    const imagens = coerceUploads(b.imagens);
    let refs = [...(style.refs ?? [])];

    if (imagens.length) {
      try {
        const novos = saveImagesTo(styleAssetsDir(id), imagens, refs.length);
        refs = [...novos, ...refs]; // a mais recente vira a capa
      } catch (e: any) {
        return reply.code(400).send({ error: String(e?.message ?? e) });
      }
    } else if (typeof b.refIndex === 'number') {
      const i = Math.trunc(b.refIndex);
      if (i < 0 || i >= refs.length) return reply.code(400).send({ error: `refIndex fora da faixa (0..${refs.length - 1})` });
      refs = [refs[i], ...refs.filter((_, j) => j !== i)];
    } else {
      return reply.code(400).send({ error: 'envie `imagens` ou `refIndex`' });
    }

    saveUserStyle({ ...style, refs });
    const atual = findStyle(id)!;
    return { ...styleInfo(atual), template: atual.template, defaults: atual.defaults };
  });

  app.delete('/api/styles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadUserStyles().some((s) => s.id === id)) {
      return reply.code(404).send({ error: `"${id}" não é um estilo do usuário (estilos do catálogo não podem ser apagados)` });
    }
    deleteUserStyle(id);
    return { ok: true };
  });

  // ── Projetos ──────────────────────────────────────────────────────────────
  app.get('/api/projects', async () => listProjects());

  app.post('/api/projects', async (req, reply) => {
    const b = (req.body ?? {}) as { nome?: string; descricao?: string; estiloId?: string | null };
    const nome = String(b.nome ?? '').trim();
    if (!nome) return reply.code(400).send({ error: 'nome do projeto é obrigatório' });
    const estiloId = b.estiloId && findStyle(String(b.estiloId)) ? String(b.estiloId) : null;
    return reply.code(201).send(projectJson(createProject(nome, String(b.descricao ?? ''), estiloId)));
  });

  /** Carrega o projeto ou responde 404 — usado por todas as rotas abaixo. */
  const requireProject = (id: string, reply: any): Project | null => {
    const p = loadProject(id);
    if (!p) {
      reply.code(404).send({ error: `projeto "${id}" não encontrado` });
      return null;
    }
    return p;
  };

  app.get('/api/projects/:id', async (req, reply) => {
    const p = requireProject((req.params as { id: string }).id, reply);
    return p ? projectJson(p) : reply;
  });

  app.put('/api/projects/:id', async (req, reply) => {
    const p = requireProject((req.params as { id: string }).id, reply);
    if (!p) return reply;
    const b = (req.body ?? {}) as { nome?: string; descricao?: string; estiloId?: string | null; capaItemId?: string | null };
    if (typeof b.nome === 'string' && b.nome.trim()) p.nome = b.nome.trim();
    if (typeof b.descricao === 'string') p.descricao = b.descricao.trim();
    if ('estiloId' in b) p.estiloId = b.estiloId && findStyle(String(b.estiloId)) ? String(b.estiloId) : null;
    if ('capaItemId' in b) {
      // Só id da PRÓPRIA biblioteca: nunca caminho de arquivo vindo do cliente.
      const alvo = b.capaItemId ? p.biblioteca.find((x) => x.id === String(b.capaItemId)) : null;
      if (b.capaItemId && !alvo) return reply.code(400).send({ error: 'a capa precisa ser uma imagem da biblioteca deste projeto' });
      p.capaItemId = alvo ? alvo.id : undefined;
    }
    saveProject(p);
    return projectJson(p);
  });

  app.delete('/api/projects/:id', async (req, reply) => {
    const p = requireProject((req.params as { id: string }).id, reply);
    if (!p) return reply;
    deleteProject(p.id);
    return { ok: true };
  });

  // ── Elenco (personagens + imagens de referência) ───────────────────────────
  app.post('/api/projects/:id/cast', async (req, reply) => {
    const p = requireProject((req.params as { id: string }).id, reply);
    if (!p) return reply;
    const b = (req.body ?? {}) as { nome?: string; descricao?: string; imagens?: unknown };
    const nome = String(b.nome ?? '').trim();
    if (!nome) return reply.code(400).send({ error: 'nome do personagem é obrigatório' });

    const memberId = uniqueMemberId(p, nome);
    let refs: string[] = [];
    try {
      const imagens = coerceUploads(b.imagens);
      if (imagens.length) refs = saveImagesTo(castRefsDir(p.id, memberId), imagens);
    } catch (e: any) {
      return reply.code(400).send({ error: String(e?.message ?? e) });
    }
    const member: CastMember = {
      id: memberId,
      nome,
      descricao: String(b.descricao ?? '').trim(),
      refs,
      aprovado: false,
      atualizadoEm: new Date().toISOString(),
    };
    p.elenco.push(member);
    saveProject(p);
    return reply.code(201).send(memberJson(member));
  });

  app.put('/api/projects/:id/cast/:memberId', async (req, reply) => {
    const { id, memberId } = req.params as { id: string; memberId: string };
    const p = requireProject(id, reply);
    if (!p) return reply;
    const m = findMember(p, memberId);
    if (!m) return reply.code(404).send({ error: `personagem "${memberId}" não encontrado` });
    const b = (req.body ?? {}) as { nome?: string; descricao?: string; aprovado?: boolean; imagens?: unknown };
    if (typeof b.nome === 'string' && b.nome.trim()) m.nome = b.nome.trim();
    if (typeof b.descricao === 'string') m.descricao = b.descricao.trim();
    // Só aprova o que tem sprite em disco — aprovação é sobre a imagem, não sobre o texto.
    if (typeof b.aprovado === 'boolean') {
      if (b.aprovado && !(m.spritePng && fs.existsSync(m.spritePng))) {
        return reply.code(400).send({ error: 'gere o sprite antes de aprovar o personagem' });
      }
      m.aprovado = b.aprovado;
    }
    try {
      const imagens = coerceUploads(b.imagens);
      if (imagens.length) m.refs = [...m.refs, ...saveImagesTo(castRefsDir(p.id, m.id), imagens, m.refs.length)];
    } catch (e: any) {
      return reply.code(400).send({ error: String(e?.message ?? e) });
    }
    m.atualizadoEm = new Date().toISOString();
    saveProject(p);
    return memberJson(m);
  });

  app.delete('/api/projects/:id/cast/:memberId', async (req, reply) => {
    const { id, memberId } = req.params as { id: string; memberId: string };
    const p = requireProject(id, reply);
    if (!p) return reply;
    if (!findMember(p, memberId)) return reply.code(404).send({ error: `personagem "${memberId}" não encontrado` });
    removeMember(p, memberId);
    return { ok: true };
  });

  // ── Briefings (o texto de cada imagem da série) ────────────────────────────
  app.post('/api/projects/:id/briefings', async (req, reply) => {
    const p = requireProject((req.params as { id: string }).id, reply);
    if (!p) return reply;
    const b = (req.body ?? {}) as { texto?: string; textos?: unknown; personagens?: unknown };
    const nomes = Array.isArray(b.personagens) ? b.personagens.map((x) => String(x)).filter(Boolean) : [];
    // `textos` (multilinha colada de uma vez) vira um briefing por linha.
    const textos = Array.isArray(b.textos)
      ? b.textos.map((t) => String(t).trim()).filter(Boolean)
      : String(b.texto ?? '')
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean);
    if (!textos.length) return reply.code(400).send({ error: 'briefing vazio' });
    const novos: Briefing[] = textos.map((texto, i) => ({
      id: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      texto,
      personagens: nomes,
      criadoEm: new Date().toISOString(),
    }));
    p.briefings.push(...novos);
    saveProject(p);
    return reply.code(201).send(novos);
  });

  app.put('/api/projects/:id/briefings/:briefingId', async (req, reply) => {
    const { id, briefingId } = req.params as { id: string; briefingId: string };
    const p = requireProject(id, reply);
    if (!p) return reply;
    const br = p.briefings.find((x) => x.id === briefingId);
    if (!br) return reply.code(404).send({ error: `briefing "${briefingId}" não encontrado` });
    const b = (req.body ?? {}) as { texto?: string; personagens?: unknown };
    if (typeof b.texto === 'string' && b.texto.trim()) br.texto = b.texto.trim();
    if (Array.isArray(b.personagens)) br.personagens = b.personagens.map((x) => String(x)).filter(Boolean);
    saveProject(p);
    return br;
  });

  app.delete('/api/projects/:id/briefings/:briefingId', async (req, reply) => {
    const { id, briefingId } = req.params as { id: string; briefingId: string };
    const p = requireProject(id, reply);
    if (!p) return reply;
    const antes = p.briefings.length;
    p.briefings = p.briefings.filter((x) => x.id !== briefingId);
    if (p.briefings.length === antes) return reply.code(404).send({ error: `briefing "${briefingId}" não encontrado` });
    saveProject(p);
    return { ok: true };
  });

  // ── Biblioteca do projeto ─────────────────────────────────────────────────
  /**
   * Anexa imagens à biblioteca à mão (upload do usuário, ou uma imagem que ele
   * quer guardar junto). A geração já arquiva sozinha — isto é a via manual.
   */
  app.post('/api/projects/:id/library', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = requireProject(id, reply);
    if (!p) return reply;
    const b = (req.body ?? {}) as { imagens?: unknown; cena?: string };
    const imagens = coerceUploads(b.imagens);
    if (!imagens.length) return reply.code(400).send({ error: 'nenhuma imagem enviada' });

    // Grava num staging e move para a biblioteca pelo mesmo caminho da geração,
    // para o índice e os nomes de arquivo saírem idênticos nos dois casos.
    const staging = path.join(libraryDir(id), '_upload');
    let novos: LibraryItem[] = [];
    try {
      const salvos = saveImagesTo(staging, imagens);
      novos = salvos
        .map((src) => addToLibrary(id, src, { cena: String(b.cena ?? '').trim(), aprovado: false, consistencia: null, cenaNota: null }))
        .filter((x): x is LibraryItem => !!x);
    } catch (e: any) {
      return reply.code(400).send({ error: String(e?.message ?? e) });
    } finally {
      try {
        fs.rmSync(staging, { recursive: true, force: true });
      } catch {
        /* staging já limpo */
      }
    }
    if (!novos.length) return reply.code(500).send({ error: 'não foi possível arquivar as imagens' });
    return reply.code(201).send(novos);
  });

  app.delete('/api/projects/:id/library/:itemId', async (req, reply) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    const p = requireProject(id, reply);
    if (!p) return reply;
    if (!removeFromLibrary(p, itemId)) {
      return reply.code(404).send({ error: `imagem "${itemId}" não está na biblioteca` });
    }
    return { ok: true };
  });

  // ── Séries (listagem; a geração continua pelo WebSocket) ───────────────────
  app.get('/api/series', async (req) => {
    const projectId = (req.query as { projectId?: string } | undefined)?.projectId;
    const all = listSeries();
    return projectId ? all.filter((s) => s.projectId === projectId) : all;
  });

  app.get('/api/series/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = loadSerie(id);
    if (!s) return reply.code(404).send({ error: `série "${id}" não encontrada` });
    return s;
  });

  app.get('/api/sessions', async () => listSessions());

  app.get('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const full = loadFullSession(id);
    if (!full) return reply.code(404).send({ error: `sessão "${id}" não encontrada` });
    return full;
  });

  app.get('/api/settings', async () => loadSettings());

  app.put('/api/settings', async (req) => {
    const body = (req.body ?? {}) as Partial<Settings>;
    saveSettings({ ...loadSettings(), ...body } as Settings); // coerce (em saveSettings) valida o merge
    return loadSettings();
  });

  app.get('/api/clis', async () => ({ enabledClis: loadSettings().enabledClis, capabilities: capabilityMap() }));

  app.put('/api/clis', async (req) => {
    const body = (req.body ?? {}) as Partial<{ codex: boolean; claude: boolean }>;
    const s = loadSettings();
    const enabledClis = {
      codex: typeof body.codex === 'boolean' ? body.codex : s.enabledClis.codex,
      claude: typeof body.claude === 'boolean' ? body.claude : s.enabledClis.claude,
    };
    saveSettings({ ...s, enabledClis });
    return { enabledClis: loadSettings().enabledClis, capabilities: capabilityMap() };
  });

  app.post('/api/serie/sheet/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return { path: buildSerieContactSheet(id) };
    } catch (e: any) {
      return reply.code(404).send({ error: String(e?.message ?? e) });
    }
  });

  app.post('/api/sessions/sheet/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return { path: buildContactSheet(id) };
    } catch (e: any) {
      return reply.code(404).send({ error: String(e?.message ?? e) });
    }
  });

  // WebSocket: 1 run por conexão (ver attachWs). @fastify/websocket v11 → handler (socket, req).
  app.get('/api/ws', { websocket: true }, (socket) => attachWs(socket));
}

/** Monta a instância Fastify (rotas + WS + estático + CORS localhost). Não escuta ainda. */
export function createServer(): FastifyInstance {
  // Instala os estilos embarcados antes de servir a primeira requisição, para que
  // a tela de Estilos já os mostre na primeira abertura do app.
  try {
    seedBundledStyles();
  } catch {
    /* semeadura é conveniência: se falhar, o app abre igual, só sem esses estilos */
  }

  // bodyLimit generoso: as imagens de referência (estilos e personagens) sobem
  // como data URL base64 dentro do JSON — o default de 1 MB do Fastify não serve.
  const app = Fastify({ logger: false, bodyLimit: 96 * 1024 * 1024 });

  // CORS liberado só p/ origens localhost (o bind já é 127.0.0.1, então é a fundo dupla).
  app.addHook('onRequest', async (req, reply) => {
    if (req.headers.upgrade) return; // handshake de upgrade do WS não usa reply
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'content-type');
    }
  });
  app.options('/*', async (_req, reply) => reply.code(204).send());

  app.register(fastifyWebsocket);
  app.register(apiRoutes);

  if (fs.existsSync(UI_DIST)) {
    app.register(fastifyStatic, { root: UI_DIST, prefix: '/' });
  } else {
    app.get('/', async (_req, reply) => {
      reply.type('text/html');
      return '<!doctype html><meta charset="utf-8"><title>Ateliê</title><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem"><h1>Ateliê</h1><p>UI ainda não construída (<code>ui/dist</code> ausente). A API está viva — veja <code>/api/health</code> e <code>/api/doctor</code>.</p></body>';
    });
  }

  return app;
}

/** Sobe o servidor em 127.0.0.1 (porta efêmera se omitida) e devolve URL + close(). */
export async function startServer(port?: number): Promise<{ url: string; port: number; close: () => Promise<void> }> {
  const app = createServer();
  // Antes de aceitar tráfego: alinhar as feature-flags ao que existe na máquina,
  // para uma instalação sem Claude Code não julgar com um provedor inexistente.
  const desligadas = await desligarClisAusentes();
  if (desligadas.length) console.log(`Ateliê · CLIs ausentes desativadas: ${desligadas.join(', ')}`);
  await app.listen({ port: port ?? 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port ?? 0;
  const url = `http://127.0.0.1:${actualPort}`;
  console.log(`Ateliê · servidor local em ${url}`);
  return { url, port: actualPort, close: () => app.close() };
}
