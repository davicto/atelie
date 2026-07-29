import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'node:module';

// Wrapper de geração (ver BUILD_CONTRACT): sempre invocado como `node <WRAPPER_CJS>`.
//
// A fonte canônica passou a ser o pacote npm `gpt-image-2-skill` (dependência do
// projeto): o `bin/gpt-image-2-skill.js` dele é justamente um .cjs que resolve o
// binário Rust da PLATAFORMA (optionalDependencies por SO/arch) e repassa argv —
// o mesmo contrato do shim caseiro, porém multiplataforma. É o que torna o app
// instalável no Windows sem o usuário instalar nada à mão.
//
// No app EMPACOTADO não existe node_modules ao lado do bundle: o electron-builder
// copia a árvore do wrapper para `resources/wrapper/node_modules/` (extraResources),
// preservando o layout que o `require.resolve` interno do pacote precisa para achar
// o binário da plataforma.
const RESOURCES_DIR = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

/** Caminho do bin do pacote npm em dev, via resolução real (imune a hoisting). */
function wrapperDoNodeModules(): string | undefined {
  try {
    return createRequire(import.meta.url).resolve('gpt-image-2-skill/bin/gpt-image-2-skill.js');
  } catch {
    return undefined;
  }
}

const WRAPPER_CANDIDATOS = [
  process.env.ATELIE_WRAPPER_CJS,
  // app empacotado (Electron)
  RESOURCES_DIR ? path.join(RESOURCES_DIR, 'wrapper/node_modules/gpt-image-2-skill/bin/gpt-image-2-skill.js') : undefined,
  // dev / `npm run serve`
  wrapperDoNodeModules(),
  // shim legado (instalação manual anterior); mantido como último recurso
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
