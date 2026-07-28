import fs from 'fs';
import os from 'os';
import path from 'path';

// Wrapper de geração (ver BUILD_CONTRACT): sempre invocado como `node <WRAPPER_CJS>`.
// O repo clonado que hospedava o bootstrapper original foi apagado na reorganização de
// 26/07/2026; o shim em ~/.local/lib/atelie preserva o mesmo contrato sobre o binário
// Rust. A ordem abaixo deixa o repo voltar a ter precedência se for re-clonado.
const WRAPPER_CANDIDATOS = [
  process.env.ATELIE_WRAPPER_CJS,
  '/home/pedro/repo/Active/images-editor/gpt-image-2-skill/skills/gpt-image-2-skill/scripts/gpt_image_2_skill.cjs',
  path.join(os.homedir(), '.local/lib/atelie/gpt_image_2_skill.cjs'),
].filter((p): p is string => Boolean(p));

export const WRAPPER_CJS =
  WRAPPER_CANDIDATOS.find((p) => fs.existsSync(p)) ?? WRAPPER_CANDIDATOS[WRAPPER_CANDIDATOS.length - 1];

// Raiz de dados do app (~/.atelie ou ATELIE_HOME). Só CAMINHOS estáticos moram
// aqui; todo valor ajustável (modelo do juiz, concorrência, limiar, etc.) vem de
// lib/settings.ts (config.json).
export const SESSIONS_ROOT = process.env.ATELIE_HOME || path.join(os.homedir(), '.atelie');
export const SESSIONS_DIR = path.join(SESSIONS_ROOT, 'sessions');
export const CONFIG_FILE = path.join(SESSIONS_ROOT, 'config.json');
export const STYLES_FILE = path.join(SESSIONS_ROOT, 'styles.json');
