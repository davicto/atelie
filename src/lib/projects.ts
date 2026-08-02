import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR } from '../config';
import { slugify } from './userStyles';

/**
 * Um personagem do projeto: as imagens de referência que o usuário subiu +
 * o SPRITE (folha de personagem) gerado a partir delas, que só vira âncora de
 * série depois de `aprovado` pelo usuário.
 */
export interface CastMember {
  id: string; // slug único dentro do projeto
  nome: string;
  descricao: string;
  refs: string[]; // imagens de referência enviadas (absolutas, sob ~/.atelie)
  spritePng?: string;
  aprovado: boolean;
  /** Ajuste livre da última regeração ("mais sorridente", "roupa azul"…). */
  ajuste?: string;
  atualizadoEm?: string;
}

/** Um briefing = o texto de uma imagem da série (vira um painel na geração). */
export interface Briefing {
  id: string;
  texto: string;
  personagens: string[]; // nomes do elenco presentes (vazio = todos)
  criadoEm: string;
}

/**
 * Uma imagem guardada na biblioteca do projeto. TODA imagem gerada entra aqui
 * assim que sai do gerador — inclusive tentativa reprovada pelo juiz —, porque o
 * painel no disco da série é sobrescrito pela tentativa seguinte e sumiria. O PNG
 * é COPIADO para projects/<id>/library/, então a biblioteca sobrevive a apagar a
 * série. Curadoria é do usuário: ele remove o que não quiser.
 */
export interface LibraryItem {
  id: string;
  png: string; // absoluto, sob projects/<id>/library/
  /** Cena/briefing que originou a imagem (texto verbatim, p/ achar depois). */
  cena: string;
  serieId?: string;
  painel?: number;
  tentativa?: number;
  consistencia?: number | null;
  cenaNota?: number | null;
  /** Passou nos dois limiares na tentativa em que foi salva. */
  aprovado: boolean;
  criadoEm: string;
}

export interface Project {
  id: string;
  nome: string;
  descricao: string;
  estiloId: string | null;
  createdAt: string;
  elenco: CastMember[];
  briefings: Briefing[];
  /** Séries geradas dentro deste projeto (mais recente primeiro). */
  serieIds: string[];
  /** Imagens salvas do projeto (mais recente primeiro). */
  biblioteca: LibraryItem[];
  /**
   * Capa escolhida à mão: id de um item da biblioteca. É só uma preferência — se
   * o item for removido, `coverOf` volta sozinho para a heurística do sprite.
   * Guardamos o id, e não o caminho, para nunca aceitar caminho de arquivo vindo
   * do cliente.
   */
  capaItemId?: string;
}

export interface ProjectSummary {
  id: string;
  nome: string;
  descricao: string;
  estiloId: string | null;
  createdAt: string;
  personagens: number;
  aprovados: number;
  briefings: number;
  series: number;
  /** Imagens guardadas na biblioteca. */
  imagens: number;
  capa: string | null;
}

// ── Caminhos ────────────────────────────────────────────────────────────────
export function projectDir(id: string): string {
  return path.join(PROJECTS_DIR, id);
}
export function castDir(projectId: string, memberId: string): string {
  return path.join(projectDir(projectId), 'cast', memberId);
}
export function castRefsDir(projectId: string, memberId: string): string {
  return path.join(castDir(projectId, memberId), 'refs');
}
export function spritePath(projectId: string, memberId: string): string {
  return path.join(castDir(projectId, memberId), 'sprite.png');
}
export function libraryDir(projectId: string): string {
  return path.join(projectDir(projectId), 'library');
}
function projectFile(id: string): string {
  return path.join(projectDir(id), 'project.json');
}

function timestampId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${stamp}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
}

// ── Coerção (o project.json pode ter sido escrito por uma versão anterior) ───
function coerceMember(raw: any): CastMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const nome = String(raw.nome ?? '').trim();
  if (!nome) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : slugify(nome) || 'personagem';
  return {
    id,
    nome,
    descricao: String(raw.descricao ?? '').trim(),
    refs: Array.isArray(raw.refs) ? raw.refs.filter((r: unknown) => typeof r === 'string') : [],
    spritePng: typeof raw.spritePng === 'string' ? raw.spritePng : undefined,
    aprovado: raw.aprovado === true,
    ajuste: typeof raw.ajuste === 'string' && raw.ajuste.trim() ? raw.ajuste.trim() : undefined,
    atualizadoEm: typeof raw.atualizadoEm === 'string' ? raw.atualizadoEm : undefined,
  };
}

function coerceBriefing(raw: any): Briefing | null {
  if (!raw || typeof raw !== 'object') return null;
  const texto = String(raw.texto ?? '').trim();
  if (!texto) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : timestampId(),
    texto,
    personagens: Array.isArray(raw.personagens) ? raw.personagens.map((p: unknown) => String(p)).filter(Boolean) : [],
    criadoEm: typeof raw.criadoEm === 'string' ? raw.criadoEm : new Date().toISOString(),
  };
}

function coerceLibraryItem(raw: any): LibraryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const png = String(raw.png ?? '').trim();
  if (!png) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : timestampId(),
    png,
    cena: String(raw.cena ?? '').trim(),
    serieId: typeof raw.serieId === 'string' ? raw.serieId : undefined,
    painel: num(raw.painel) ?? undefined,
    tentativa: num(raw.tentativa) ?? undefined,
    consistencia: num(raw.consistencia),
    cenaNota: num(raw.cenaNota),
    aprovado: raw.aprovado === true,
    criadoEm: typeof raw.criadoEm === 'string' ? raw.criadoEm : new Date().toISOString(),
  };
}

function coerceProject(raw: any, id: string): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : id,
    nome: String(raw.nome ?? '').trim() || id,
    descricao: String(raw.descricao ?? '').trim(),
    estiloId: typeof raw.estiloId === 'string' && raw.estiloId ? raw.estiloId : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    elenco: Array.isArray(raw.elenco) ? raw.elenco.map(coerceMember).filter((m: CastMember | null): m is CastMember => !!m) : [],
    briefings: Array.isArray(raw.briefings)
      ? raw.briefings.map(coerceBriefing).filter((b: Briefing | null): b is Briefing => !!b)
      : [],
    serieIds: Array.isArray(raw.serieIds) ? raw.serieIds.filter((s: unknown) => typeof s === 'string') : [],
    // Projetos criados antes da biblioteca simplesmente vêm com a lista vazia.
    biblioteca: Array.isArray(raw.biblioteca)
      ? raw.biblioteca.map(coerceLibraryItem).filter((b: LibraryItem | null): b is LibraryItem => !!b)
      : [],
    capaItemId: typeof raw.capaItemId === 'string' && raw.capaItemId ? raw.capaItemId : undefined,
  };
}

// ── Persistência ────────────────────────────────────────────────────────────
export function saveProject(p: Project): void {
  fs.mkdirSync(projectDir(p.id), { recursive: true });
  fs.writeFileSync(projectFile(p.id), JSON.stringify(p, null, 2));
}

export function loadProject(id: string): Project | null {
  try {
    return coerceProject(JSON.parse(fs.readFileSync(projectFile(id), 'utf8')), id);
  } catch {
    return null;
  }
}

export function createProject(nome: string, descricao: string, estiloId: string | null): Project {
  const p: Project = {
    id: timestampId(),
    nome: nome.trim() || 'Projeto sem nome',
    descricao: descricao.trim(),
    estiloId: estiloId || null,
    createdAt: new Date().toISOString(),
    elenco: [],
    briefings: [],
    serieIds: [],
    biblioteca: [],
  };
  saveProject(p);
  return p;
}

export function deleteProject(id: string): void {
  fs.rmSync(projectDir(id), { recursive: true, force: true });
}

/**
 * Capa do projeto: a escolha do usuário quando ela ainda existe em disco; senão o
 * primeiro sprite aprovado, senão qualquer sprite/referência.
 */
function coverOf(p: Project): string | null {
  if (p.capaItemId) {
    const escolhida = p.biblioteca.find((b) => b.id === p.capaItemId);
    if (escolhida && fs.existsSync(escolhida.png)) return escolhida.png;
  }
  const aprovado = p.elenco.find((m) => m.aprovado && m.spritePng);
  if (aprovado?.spritePng) return aprovado.spritePng;
  const comSprite = p.elenco.find((m) => m.spritePng);
  if (comSprite?.spritePng) return comSprite.spritePng;
  return p.elenco.find((m) => m.refs.length > 0)?.refs[0] ?? null;
}

export function summarize(p: Project): ProjectSummary {
  return {
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    estiloId: p.estiloId,
    createdAt: p.createdAt,
    personagens: p.elenco.length,
    aprovados: p.elenco.filter((m) => m.aprovado).length,
    briefings: p.briefings.length,
    series: p.serieIds.length,
    imagens: p.biblioteca.length,
    capa: coverOf(p),
  };
}

/** Varre ~/.atelie/projects; mais recentes primeiro. */
export function listProjects(): ProjectSummary[] {
  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ProjectSummary[] = [];
  for (const d of dirs) {
    if (!d.isDirectory() || d.name.startsWith('_')) continue;
    const p = loadProject(d.name);
    if (p) out.push(summarize(p));
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out;
}

// ── Elenco ──────────────────────────────────────────────────────────────────
/** Id livre para um personagem dentro do projeto (`nara`, `nara-2`…). */
export function uniqueMemberId(p: Project, nome: string): string {
  const base = slugify(nome) || 'personagem';
  const taken = new Set(p.elenco.map((m) => m.id));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 500; i++) {
    if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

export function findMember(p: Project, memberId: string): CastMember | undefined {
  return p.elenco.find((m) => m.id === memberId);
}

/** Remove o personagem do project.json e apaga refs/sprite do disco. */
export function removeMember(p: Project, memberId: string): void {
  p.elenco = p.elenco.filter((m) => m.id !== memberId);
  saveProject(p);
  try {
    fs.rmSync(castDir(p.id, memberId), { recursive: true, force: true });
  } catch {
    /* já removido */
  }
}

/** Personagens prontos para virar âncora de série (aprovados e com sprite em disco). */
export function approvedCast(p: Project): CastMember[] {
  return p.elenco.filter((m) => m.aprovado && m.spritePng && fs.existsSync(m.spritePng));
}

// ── Biblioteca ──────────────────────────────────────────────────────────────
/**
 * COPIA `srcPng` para a biblioteca do projeto e registra a entrada (mais recente
 * primeiro). Copiar, e não referenciar, é o ponto todo: o painel da série é
 * sobrescrito pela tentativa seguinte e some — aqui a imagem fica.
 *
 * Persiste o projeto relendo-o do disco antes de gravar: um run de série dura
 * minutos e o usuário pode ter mexido no elenco/briefings nesse meio-tempo;
 * salvar o objeto em memória apagaria essas edições.
 */
export function addToLibrary(projectId: string, srcPng: string, meta: Omit<LibraryItem, 'id' | 'png' | 'criadoEm'>): LibraryItem | null {
  if (!srcPng || !fs.existsSync(srcPng)) return null;
  const p = loadProject(projectId);
  if (!p) return null;

  const id = timestampId();
  const dir = libraryDir(projectId);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${id}${path.extname(srcPng) || '.png'}`);
  try {
    fs.copyFileSync(srcPng, dest);
  } catch {
    return null; // origem sumiu no meio do caminho — a geração segue sem a cópia
  }

  const item: LibraryItem = { ...meta, id, png: dest, criadoEm: new Date().toISOString() };
  p.biblioteca.unshift(item);
  saveProject(p);
  return item;
}

/** Tira a entrada do índice e apaga o arquivo copiado. */
export function removeFromLibrary(p: Project, itemId: string): boolean {
  const item = p.biblioteca.find((x) => x.id === itemId);
  if (!item) return false;
  p.biblioteca = p.biblioteca.filter((x) => x.id !== itemId);
  saveProject(p);
  try {
    fs.rmSync(item.png, { force: true });
  } catch {
    /* arquivo já sumiu — o índice é o que importa */
  }
  return true;
}
