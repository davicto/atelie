import fs from 'fs';
import path from 'path';
import { STYLE_ASSETS_DIR, STYLE_ASSETS_FILE, STYLES_FILE } from '../config';
import { CATALOG } from '../styles/catalog';
import { renderTemplate } from '../styles/catalog.types';
import type { StyleDef } from '../styles/catalog.types';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isKebab(id: string): boolean {
  return KEBAB.test(id);
}

/** Slug kebab-case a partir de um texto livre (sem acento, sem símbolo). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Estilos do usuário (styles.json). [] se ausente/corrompido. */
export function loadUserStyles(): StyleDef[] {
  try {
    const arr = JSON.parse(fs.readFileSync(STYLES_FILE, 'utf8'));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.id === 'string')
      .map((s) => ({ ...s, origem: 'user' as const }));
  } catch {
    return [];
  }
}

function writeUserStyles(list: StyleDef[]): void {
  fs.mkdirSync(path.dirname(STYLES_FILE), { recursive: true });
  fs.writeFileSync(STYLES_FILE, JSON.stringify(list, null, 2));
}

/** Upsert por id (kebab-case válido e único entre os estilos do usuário). */
export function saveUserStyle(s: StyleDef): void {
  if (!isKebab(s.id)) throw new Error(`id inválido (precisa ser kebab-case): "${s.id}"`);
  const list = loadUserStyles();
  const idx = list.findIndex((x) => x.id === s.id);
  const entry: StyleDef = { ...s, origem: 'user' };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  writeUserStyles(list);
}

/** Pasta das imagens de referência de um estilo do usuário. */
export function styleAssetsDir(id: string): string {
  return path.join(STYLE_ASSETS_DIR, id);
}

/** Remove o estilo do styles.json e apaga suas imagens de referência. */
export function deleteUserStyle(id: string): void {
  const list = loadUserStyles().filter((x) => x.id !== id);
  writeUserStyles(list);
  try {
    fs.rmSync(styleAssetsDir(id), { recursive: true, force: true });
  } catch {
    /* pasta ausente / em uso — o estilo já saiu do índice, segue */
  }
}

/** Id livre a partir de um desejado: `nome`, `nome-2`, `nome-3`… */
export function uniqueStyleId(desired: string): string {
  const base = slugify(desired) || 'estilo';
  const taken = new Set(getAllStyles().map((s) => s.id));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 500; i++) {
    const cand = `${base}-${i}`;
    if (!taken.has(cand)) return cand;
  }
  return `${base}-${Date.now()}`;
}

/** Refs semeadas dos estilos do catálogo (id → caminhos). {} se ausente/corrompido. */
export function loadBuiltinRefs(): Record<string, string[]> {
  try {
    const raw = JSON.parse(fs.readFileSync(STYLE_ASSETS_FILE, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string[]> = {};
    for (const [id, refs] of Object.entries(raw)) {
      if (Array.isArray(refs)) out[id] = refs.filter((r): r is string => typeof r === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Registra as refs de um estilo do CATÁLOGO (usado pelo seed). Não passa pelo
 * styles.json, então o estilo continua `origem: 'builtin'` e a UI segue tratando-o
 * como imutável — é só a capa que aparece.
 */
export function setBuiltinRefs(id: string, refs: string[]): void {
  const all = loadBuiltinRefs();
  all[id] = refs;
  fs.mkdirSync(path.dirname(STYLE_ASSETS_FILE), { recursive: true });
  fs.writeFileSync(STYLE_ASSETS_FILE, JSON.stringify(all, null, 2));
}

/**
 * CATALOG (builtin) ++ estilos do usuário. Dedupe por id com PRECEDÊNCIA do usuário:
 * se um id de usuário colide com um builtin, o do usuário substitui o builtin no lugar
 * (senão findStyle devolveria o builtin e a versão do usuário viraria duplicata ignorada).
 */
export function getAllStyles(): StyleDef[] {
  const user = loadUserStyles();
  const byId = new Map(user.map((s) => [s.id, s]));
  const semeadas = loadBuiltinRefs();
  const builtin: StyleDef[] = CATALOG.map(
    (s) =>
      byId.get(s.id) ??
      ({ ...s, origem: 'builtin' as const, refs: (semeadas[s.id] ?? []).filter((r) => fs.existsSync(r)) }),
  );
  const builtinIds = new Set(CATALOG.map((s) => s.id));
  const extra = user.filter((s) => !builtinIds.has(s.id)); // estilos do usuário sem colisão
  return [...builtin, ...extra];
}

export function findStyle(id: string): StyleDef | undefined {
  return getAllStyles().find((s) => s.id === id);
}

/**
 * Trava de estilo injetável verbatim em prompts de imagem: o `template` do estilo
 * com os slots vazios (fica só a parte invariante — modo/luz/paleta/restrições, em
 * inglês). É o que sprite, âncora e painel precisam compartilhar para o juiz de
 * consistência não acusar deriva de linha/paleta; o `desc` (uma frase em pt-BR) é
 * fraco demais para isso e só entra como último recurso.
 */
export function styleLock(id: string | null | undefined): string {
  const s = id ? findStyle(id) : undefined;
  if (!s) return '';
  const lock = renderTemplate(s.template, { subject: '', scene: '', extra: '' })
    .replace(/\.\s*\./g, '.') // pontuação órfã deixada pelos slots vazios
    .replace(/\s{2,}/g, ' ')
    .trim();
  return lock || s.desc;
}
