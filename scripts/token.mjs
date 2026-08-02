#!/usr/bin/env node
/**
 * Grava o token de publicação em `.env.local` (ignorado pelo Git).
 *
 * Existe porque as duas formas manuais têm armadilha: criar o arquivo pelo Bloco
 * de Notas costuma virar `.env.local.txt` (o Windows esconde a extensão), e
 * digitar `$env:GH_TOKEN="..."` deixa o token no histórico do PowerShell.
 *
 * Aqui a digitação é OCULTA e nada é ecoado — nem na tela, nem em histórico.
 *
 * Uso:  npm run token
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQUIVO = path.join(RAIZ, '.env.local');

function perguntarOculto(rotulo) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Enquanto `mudo` estiver ligado, o write do readline não imprime nada: o
    // token não aparece na tela nem fica na rolagem do terminal.
    let mudo = false;
    const write = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = (s) => {
      if (!mudo) write?.(s);
    };
    rl.question(rotulo, (resposta) => {
      rl._writeToOutput = write;
      rl.close();
      process.stdout.write('\n');
      resolve(resposta.trim());
    });
    mudo = true;
  });
}

const jaExiste = fs.existsSync(ARQUIVO);
console.log(`\nToken de publicação → ${path.relative(process.cwd(), ARQUIVO) || '.env.local'}`);
if (jaExiste) console.log('(já existe um arquivo; ele será substituído)');
console.log(`
Crie em: github.com/settings/tokens?type=beta
  · Only select repositories → atelie
  · Permissions → Repository permissions → Contents: Read and write
`);

if (!process.stdin.isTTY) {
  console.error('✗ este comando precisa de um terminal interativo.');
  console.error('  Abra o PowerShell na pasta do projeto e rode: npm run token');
  process.exit(1);
}

const token = await perguntarOculto('Cole o token (não vai aparecer na tela): ');

if (!token) {
  console.error('✗ nada digitado — nada foi gravado.');
  process.exit(1);
}
// Só um sanity check de formato; quem valida de verdade é o GitHub no push.
if (!/^(github_pat_|ghp_|gho_)/.test(token)) {
  console.error('✗ isso não parece um token do GitHub (esperado começar com `github_pat_` ou `ghp_`).');
  console.error('  Nada foi gravado.');
  process.exit(1);
}

fs.writeFileSync(ARQUIVO, `GH_TOKEN=${token}\n`, { mode: 0o600 });
console.log(`✓ gravado (${token.length} caracteres). O arquivo é ignorado pelo Git.

  Agora rode:  npm run release`);
