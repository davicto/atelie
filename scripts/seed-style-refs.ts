/**
 * Semeia UMA imagem de referência para cada estilo do CATÁLOGO, para que os cards
 * do portfólio deixem de sair sem capa.
 *
 * Todos os estilos recebem o MESMO assunto de propósito: com o motivo fixo, a
 * galeria vira uma cartela de amostras — a única variável entre um card e outro é
 * o estilo, que é exatamente o que o usuário está comparando ali.
 *
 * As refs vão para style-assets.json (não para styles.json), então o estilo
 * continua sendo do catálogo e não vira "meu estilo".
 *
 * Uso:
 *   npm run seed:style-refs                 # todos os que ainda não têm capa
 *   npm run seed:style-refs -- --force      # regera inclusive os que já têm
 *   npm run seed:style-refs -- --only watercolor,ink-chines
 *   npm run seed:style-refs -- --quality medium
 */
import fs from 'fs';
import path from 'path';
import { generate } from '../src/lib/imageBackend';
import { compose } from '../src/lib/promptComposer';
import { CATALOG } from '../src/styles/catalog';
import { loadBuiltinRefs, setBuiltinRefs, styleAssetsDir } from '../src/lib/userStyles';
import type { GenJob } from '../src/types';

/** Motivo único da cartela: concreto, com figura + cenário + fundo. */
const ASSUNTO = 'a red fox sitting beside a tall tree, a small house in the background';

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const force = process.argv.includes('--force');
const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const quality = arg('quality');

async function main(): Promise<void> {
  const jaTem = loadBuiltinRefs();
  const alvos = CATALOG.filter((s) => {
    if (only) return only.includes(s.id);
    if (force) return true;
    return !(jaTem[s.id] ?? []).some((r) => fs.existsSync(r));
  });

  if (!alvos.length) {
    console.log('nada a semear — todos os estilos do catálogo já têm capa (use --force para regerar).');
    return;
  }
  console.log(`semeando ${alvos.length} estilo(s) do catálogo · assunto: "${ASSUNTO}"\n`);

  let ok = 0;
  const falhas: string[] = [];
  for (const [i, style] of alvos.entries()) {
    const rotulo = `[${i + 1}/${alvos.length}] ${style.id}`;
    const dir = styleAssetsDir(style.id);
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, 'capa.png');

    const job: GenJob = {
      id: `seed-${style.id}`,
      styleId: style.id,
      index: 0,
      prompt: compose(ASSUNTO, style),
      // Estilo de asset com fundo transparente precisa do modo próprio, senão o
      // gerador devolve fundo chapado e a amostra mente sobre o estilo.
      mode: style.defaults.background === 'transparent' ? 'transparent' : 'generate',
      outPath,
    };

    process.stdout.write(`${rotulo} … `);
    const t0 = Date.now();
    try {
      const { pngPath } = await generate(job, style.defaults.size, quality || style.defaults.quality);
      setBuiltinRefs(style.id, [pngPath]);
      ok++;
      console.log(`ok (${Math.round((Date.now() - t0) / 1000)}s)`);
    } catch (e: any) {
      falhas.push(`${style.id}: ${String(e?.message ?? e).split('\n')[0]}`);
      console.log(`FALHOU — ${String(e?.message ?? e).split('\n')[0]}`);
    }
  }

  console.log(`\nsemeados: ${ok}/${alvos.length}`);
  if (falhas.length) {
    console.log('falhas:');
    for (const f of falhas) console.log('  ✗ ' + f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('erro no seed:', e?.stack || e);
  process.exit(2);
});
