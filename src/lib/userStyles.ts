import fs from 'fs';
import path from 'path';
import { STYLES_FILE } from '../config';
import { CATALOG } from '../styles/catalog';
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

export function deleteUserStyle(id: string): void {
  const list = loadUserStyles().filter((x) => x.id !== id);
  writeUserStyles(list);
}

/**
 * CATALOG (builtin) ++ estilos do usuário. Dedupe por id com PRECEDÊNCIA do usuário:
 * se um id de usuário colide com um builtin, o do usuário substitui o builtin no lugar
 * (senão findStyle devolveria o builtin e a versão do usuário viraria duplicata ignorada).
 */
export function getAllStyles(): StyleDef[] {
  const user = loadUserStyles();
  const byId = new Map(user.map((s) => [s.id, s]));
  const builtin: StyleDef[] = CATALOG.map((s) => byId.get(s.id) ?? ({ ...s, origem: 'builtin' as const }));
  const builtinIds = new Set(CATALOG.map((s) => s.id));
  const extra = user.filter((s) => !builtinIds.has(s.id)); // estilos do usuário sem colisão
  return [...builtin, ...extra];
}

export function findStyle(id: string): StyleDef | undefined {
  return getAllStyles().find((s) => s.id === id);
}
