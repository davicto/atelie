#!/usr/bin/env node
// Entrypoint da camada de servidor local: `tsx src/server/serve.ts [--port N]`.
import { startServer } from './server';

/** Lê `--port <N>` do argv (opcional; ausente → porta efêmera). */
function parsePort(argv: string[]): number | undefined {
  const i = argv.indexOf('--port');
  if (i >= 0 && argv[i + 1]) {
    const n = Number(argv[i + 1]);
    if (Number.isFinite(n) && n >= 0 && n < 65536) return n;
  }
  return undefined;
}

async function main(): Promise<void> {
  const port = parsePort(process.argv.slice(2));
  const { close } = await startServer(port);
  // Encerra limpo em SIGINT/SIGTERM (o listen mantém o processo vivo até lá).
  const bye = () => {
    close().finally(() => process.exit(0));
  };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
