#!/usr/bin/env node
/**
 * Publica uma versão nova do Ateliê.
 *
 * A atualização automática depende de DUAS coisas acontecerem juntas: o número
 * da versão subir E existir uma Release no GitHub com o instalador + latest.yml.
 * Fazer isso à mão erra fácil — subir a versão e esquecer de publicar deixa o
 * app dos outros achando que já está atualizado; publicar sem subir a versão
 * também. Por isso é um comando só.
 *
 * Uso:
 *   npm run release              # 0.1.0 -> 0.1.1 (correção)
 *   npm run release -- minor     # 0.1.0 -> 0.2.0 (recurso novo)
 *   npm run release -- major     # 0.1.0 -> 1.0.0 (quebra algo)
 *   npm run release -- 1.2.3     # versão exata
 *   npm run release -- --dry     # só mostra o que faria
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = path.join(RAIZ, 'package.json');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const alvo = args.find((a) => !a.startsWith('--')) ?? 'patch';

function sh(cmd, argv, opts = {}) {
  return execFileSync(cmd, argv, { cwd: RAIZ, encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}
function shLoud(cmd, argv) {
  execFileSync(cmd, argv, { cwd: RAIZ, stdio: 'inherit' });
}
function morrer(msg, dica) {
  console.error(`\n✗ ${msg}`);
  if (dica) console.error(`  ${dica}`);
  process.exit(1);
}

function proximaVersao(atual, spec) {
  if (/^\d+\.\d+\.\d+$/.test(spec)) return spec;
  const [ma, mi, pa] = atual.split('.').map(Number);
  if (spec === 'major') return `${ma + 1}.0.0`;
  if (spec === 'minor') return `${ma}.${mi + 1}.0`;
  if (spec === 'patch') return `${ma}.${mi}.${pa + 1}`;
  morrer(`não entendi "${spec}"`, 'use patch | minor | major | 1.2.3');
}

const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const versao = proximaVersao(pkg.version, alvo);
console.log(`\nAteliê ${pkg.version} → ${versao}${dry ? '   (simulação)' : ''}\n`);

// ── Portões: melhor recusar do que publicar algo quebrado ou meio-commitado ──
if (sh('git', ['status', '--porcelain'])) {
  morrer('há alterações não commitadas.', 'Commite ou descarte antes — a Release precisa refletir um estado salvo.');
}
const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') morrer(`você está na branch "${branch}".`, 'Publique a partir da main.');

sh('git', ['fetch', 'origin']);
const [frente, atras] = sh('git', ['rev-list', '--left-right', '--count', 'main...origin/main']).split(/\s+/).map(Number);
if (atras > 0) morrer(`sua main está ${atras} commit(s) atrás do GitHub.`, 'Rode `git pull` primeiro.');

if (sh('git', ['tag', '-l', `v${versao}`])) morrer(`a tag v${versao} já existe.`, 'Escolha outra versão.');

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token && !dry) {
  morrer(
    'sem GH_TOKEN — não dá para publicar a Release.',
    'Crie um token em github.com/settings/tokens?type=beta (Contents: Read and write no repo atelie) e rode:\n  $env:GH_TOKEN="seu_token"; npm run release',
  );
}

if (dry) {
  console.log(`Faria, nesta ordem:
  1. testes (npm test)
  2. package.json → ${versao}
  3. commit "Versão ${versao}" + tag v${versao}
  4. git push (commit e tag)
  5. build do instalador e publicação da Release no GitHub
${frente > 0 ? `\n  (você tem ${frente} commit(s) locais que subiriam junto)` : ''}`);
  process.exit(0);
}

// ── 1. Testes ────────────────────────────────────────────────────────────────
console.log('▸ rodando os testes…');
try {
  shLoud('npm', ['test']);
} catch {
  morrer('os testes falharam — nada foi publicado.', 'Corrija e rode de novo.');
}

// ── 2-3. Versão, commit e tag ────────────────────────────────────────────────
console.log(`\n▸ marcando a versão ${versao}…`);
pkg.version = versao;
fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
sh('git', ['add', 'package.json']);
sh('git', ['commit', '-m', `Versão ${versao}`]);
sh('git', ['tag', '-a', `v${versao}`, '-m', `Ateliê ${versao}`]);

// ── 4. Push ──────────────────────────────────────────────────────────────────
console.log('▸ enviando para o GitHub…');
try {
  shLoud('git', ['push', 'origin', 'main', '--follow-tags']);
} catch {
  // Desfaz o commit/tag locais: sem push, publicar deixaria a Release apontando
  // para um commit que não existe no GitHub.
  sh('git', ['tag', '-d', `v${versao}`]);
  sh('git', ['reset', '--hard', 'HEAD~1']);
  morrer('o push falhou — a versão foi revertida localmente.', 'Verifique a conexão/credenciais e tente de novo.');
}

// ── 5. Build + Release ───────────────────────────────────────────────────────
console.log('\n▸ construindo e publicando o instalador (demora vários minutos)…\n');
shLoud('npm', ['run', 'dist', '--', '--publish', 'always']);

console.log(`\n✓ Ateliê ${versao} publicado.
  Release: https://github.com/davicto/atelie/releases/tag/v${versao}

  Quem já tem o app instalado recebe a atualização sozinho: ao abrir, o app
  consulta o GitHub, baixa em segundo plano e avisa que será aplicada ao fechar.`);
