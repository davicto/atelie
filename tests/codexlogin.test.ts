// Parser da saída do `codex login --device-auth` — o passo do wizard de 1ª execução.
// As fixtures são a saída REAL do codex v0.145.0 (com as cores ANSI, que é como ela
// chega quando o app spawna o binário sem TTY). Se o formato do codex mudar, este
// teste quebra aqui em vez de travar o usuário final numa tela sem código.
import { semAnsi } from '../src/lib/codexCli';

const SAIDA_REAL = [
  '',
  "Welcome to Codex [v[90m0.145.0[0m]",
  "[90mOpenAI's command-line coding agent[0m",
  '',
  'Follow these steps to sign in with ChatGPT using device code authorization:',
  '',
  '1. Open this link in your browser and sign in to your account',
  '   [94mhttps://auth.openai.com/codex/device[0m',
  '',
  '2. Enter this one-time code [90m(expires in 15 minutes)[0m',
  '   [94mWUYU-U4WYZ[0m',
];

// Mesma extração de `iniciarLogin`, mantida em sincronia de propósito.
function extrair(linhas: string[]): { url?: string; codigo?: string } {
  let url: string | undefined;
  let codigo: string | undefined;
  for (const linha of linhas) {
    const limpa = semAnsi(linha);
    url = limpa.match(/https?:\/\/\S+/)?.[0] ?? url;
    codigo = limpa.match(/\b[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\b/)?.[0] ?? codigo;
  }
  return { url, codigo };
}

let pass = 0;
const fails: string[] = [];
function ok(cond: boolean, nome: string): void {
  if (cond) pass++;
  else fails.push(nome);
}

ok(semAnsi('   [94mWUYU-U4WYZ[0m') === '   WUYU-U4WYZ', 'semAnsi remove as cores da saída');
ok(extrair(SAIDA_REAL).url === 'https://auth.openai.com/codex/device', 'extrai a URL de confirmação');
ok(extrair(SAIDA_REAL).codigo === 'WUYU-U4WYZ', 'extrai o código (blocos assimétricos 4-5)');
ok(extrair([SAIDA_REAL[1]]).codigo === undefined, 'não confunde a versão do cabeçalho com o código');

console.log(`PASSOU: ${pass}  FALHOU: ${fails.length}`);
if (fails.length) {
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
