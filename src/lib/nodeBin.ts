// Resolução do binário Node usado para spawnar o wrapper .cjs (gpt-image-2) e as
// chamadas ao provider `codex` via Node.
//
// Em dev/CLI/`npm run serve` não há env → usa o `node` da PATH.
// Sob Electron EMPACOTADO não há `node` garantido na PATH: `src/desktop/main.ts`
// seta `ATELIE_NODE_BIN=process.execPath` (o próprio binário do Electron). Para o
// Electron agir como Node puro ao rodar o .cjs, o spawn precisa de
// `ELECTRON_RUN_AS_NODE=1` no ambiente.
//
// Ambos são funções (lidas a cada chamada) de propósito: o valor é decidido em
// tempo de execução, depois que o main do Electron ajusta o ambiente — nunca
// congelado no import.

/** Binário Node a usar no spawn. `ATELIE_NODE_BIN` (Electron) ou `node` (dev). */
export function nodeBin(): string {
  return process.env.ATELIE_NODE_BIN || 'node';
}

/**
 * Ambiente para o spawn do Node. Sem `ATELIE_NODE_BIN` (dev) devolve `undefined`
 * → o filho herda o ambiente do pai (comportamento atual, intocado). Com a env
 * setada (Electron), injeta `ELECTRON_RUN_AS_NODE=1` para o Electron virar Node.
 */
export function nodeSpawnEnv(): NodeJS.ProcessEnv | undefined {
  if (!process.env.ATELIE_NODE_BIN) return undefined;
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
}
