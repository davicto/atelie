// Bundla a casca Electron (main + preload) num único .cjs cada, com o servidor
// Fastify e o motor (src/lib/*) embutidos no main. Saída: dist-electron/.
//
//   node scripts/build-desktop.mjs
//
// `electron` fica external (o runtime provê); `electron-updater` também, pois é
// carregado sob demanda (import dinâmico protegido por try/catch no main) e traz
// requires dinâmicos que não valem embutir.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-electron');

fs.mkdirSync(OUT, { recursive: true });

/** Opções comuns aos dois bundles. */
const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  // `electron` é sempre fornecido pelo runtime; `electron-updater` é opcional.
  external: ['electron', 'electron-updater'],
};

async function main() {
  await build({
    ...common,
    entryPoints: [path.join(ROOT, 'src', 'desktop', 'main.ts')],
    outfile: path.join(OUT, 'main.cjs'),
    // `import.meta.url` não existe em CJS: main.ts e server.ts o usam para localizar
    // o bundle. Shim: apontar para o próprio arquivo (__filename) via file:// URL.
    // Só no main (processo Node completo); o preload sandbox tem `require` restrito.
    banner: { js: "const __ATELIE_IMPORT_META_URL__ = require('node:url').pathToFileURL(__filename).href;" },
    define: { 'import.meta.url': '__ATELIE_IMPORT_META_URL__' },
  });
  await build({
    ...common,
    entryPoints: [path.join(ROOT, 'src', 'desktop', 'preload.ts')],
    outfile: path.join(OUT, 'preload.cjs'),
  });
  console.log('✓ dist-electron/main.cjs + preload.cjs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
