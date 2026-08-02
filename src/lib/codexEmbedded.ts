import fs from 'fs';
import os from 'os';
import path from 'path';
import { run } from './runner';

// Codex CLI EMBUTIDO no app. Ele existe aqui por um motivo só: produzir o
// `~/.codex/auth.json` (login ChatGPT) que o wrapper gpt-image-2 consome. Sem ele,
// o usuário final teria que instalar Node + `npm i -g @openai/codex` na mão antes
// de abrir o Ateliê — inviável para quem não é técnico.
//
// Chamamos o EXECUTÁVEL nativo direto (não o `bin/codex.js`), porque o launcher é
// ESM e depende da resolução npm, que não existe no app empacotado. O layout do
// pacote de plataforma é `vendor/<target-triple>/bin/codex[.exe]`; o
// electron-builder copia esse diretório inteiro para `resources/codex/`.

const TRIPLE_POR_PLATAFORMA: Record<string, string | undefined> = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-musl',
  'linux-arm64': 'aarch64-unknown-linux-musl',
};

const PACOTE_POR_PLATAFORMA: Record<string, string | undefined> = {
  'win32-x64': '@openai/codex-win32-x64',
  'win32-arm64': '@openai/codex-win32-arm64',
  'darwin-x64': '@openai/codex-darwin-x64',
  'darwin-arm64': '@openai/codex-darwin-arm64',
  'linux-x64': '@openai/codex-linux-x64',
  'linux-arm64': '@openai/codex-linux-arm64',
};

const RESOURCES_DIR = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
const CHAVE = `${process.platform}-${process.arch}`;
const EXE = process.platform === 'win32' ? 'codex.exe' : 'codex';

function candidatos(): string[] {
  const triple = TRIPLE_POR_PLATAFORMA[CHAVE];
  const pacote = PACOTE_POR_PLATAFORMA[CHAVE];
  const lista: Array<string | undefined> = [
    process.env.ATELIE_CODEX_BIN,
    // app empacotado
    RESOURCES_DIR ? path.join(RESOURCES_DIR, 'codex', 'bin', EXE) : undefined,
    // dev / `npm run serve`
    pacote && triple
      ? path.join(process.cwd(), 'node_modules', ...pacote.split('/'), 'vendor', triple, 'bin', EXE)
      : undefined,
  ];
  return lista.filter((p): p is string => Boolean(p));
}

/** Caminho do executável embutido, ou `null` se nenhum candidato existir. */
export function codexBin(): string | null {
  return candidatos().find((p) => fs.existsSync(p)) ?? null;
}

/**
 * Binário a usar: o embutido, senão o `codex` da PATH (quem já tem instalado).
 * Nunca lança — quem chama trata o caso "não encontrado" pelo resultado da sonda.
 */
export function codexBinOuPath(): string {
  return codexBin() ?? 'codex';
}

/** Onde o login grava as credenciais (o wrapper lê exatamente este arquivo). */
export function authFile(): string {
  return process.env.CODEX_HOME
    ? path.join(process.env.CODEX_HOME, 'auth.json')
    : path.join(os.homedir(), '.codex', 'auth.json');
}

export interface LoginStatus {
  logado: boolean;
  detalhe: string;
  /** true se o executável foi encontrado (embutido ou na PATH). */
  disponivel: boolean;
}

/** `codex login status` — sonda barata, não consome tokens nem abre navegador. */
export async function loginStatus(): Promise<LoginStatus> {
  try {
    const { code, stdout, stderr } = await run(codexBinOuPath(), ['login', 'status'], { timeoutMs: 15000 }).done;
    const saida = (stdout + stderr).trim();
    // O CLI responde "Logged in using ChatGPT" (ou similar) com exit 0 quando há sessão.
    const logado = code === 0 && /logged in/i.test(saida);
    return {
      logado,
      disponivel: true,
      detalhe: saida || (logado ? 'sessão ChatGPT ativa' : 'sem sessão'),
    };
  } catch {
    return { logado: false, disponivel: false, detalhe: 'Codex CLI não encontrado' };
  }
}

// ── Login por código de dispositivo ────────────────────────────────────────
// `codex login --device-auth` imprime uma URL e um código curto; o usuário abre a
// URL noutro aparelho/aba e digita o código. É o único fluxo que funciona sem TTY
// e sem servidor local, então é o que cabe num wizard gráfico.

/** Remove sequências ANSI (cor/estilo) — o codex colore a saída mesmo sem TTY. */
export function semAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

export interface LoginEmCurso {
  fase: 'iniciando' | 'aguardando-codigo' | 'concluido' | 'erro';
  url?: string;
  codigo?: string;
  mensagem?: string;
}

let emCurso: LoginEmCurso | null = null;
let cancelar: (() => void) | null = null;

/** Estado do login em andamento (`null` = nenhum). */
export function loginEmCurso(): LoginEmCurso | null {
  return emCurso;
}

/** Aborta um login pendente (usuário desistiu ou fechou o wizard). */
export function abortarLogin(): void {
  cancelar?.();
  cancelar = null;
  emCurso = null;
}

/**
 * Dispara `codex login --device-auth` e vai preenchendo o estado conforme a saída.
 * Retorna imediatamente: a UI acompanha por polling de `loginEmCurso()`.
 */
export function iniciarLogin(): LoginEmCurso {
  if (emCurso && emCurso.fase !== 'concluido' && emCurso.fase !== 'erro') return emCurso;

  emCurso = { fase: 'iniciando' };
  const capturar = (linha: string) => {
    // A saída do codex vem colorida; sem tirar o ANSI os regexes não casam.
    const limpa = semAnsi(linha);
    const url = limpa.match(/https?:\/\/\S+/)?.[0];
    // Formato observado no v0.145: "WUYU-U4WYZ" (blocos de 4–6, não simétricos).
    const codigo = limpa.match(/\b[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\b/)?.[0];
    if (!emCurso) return;
    if (url) emCurso = { ...emCurso, url, fase: 'aguardando-codigo' };
    if (codigo) emCurso = { ...emCurso, codigo, fase: 'aguardando-codigo' };
  };

  const handle = run(codexBinOuPath(), ['login', '--device-auth'], {
    // O usuário precisa de tempo real para abrir o link e digitar o código.
    timeoutMs: 10 * 60 * 1000,
    onStdoutLine: capturar,
    onStderrLine: capturar,
  });
  cancelar = handle.cancel;

  void handle.done
    .then(({ code, stdout, stderr }) => {
      const saida = (stdout + stderr).trim();
      emCurso =
        code === 0
          ? { fase: 'concluido', mensagem: 'login concluído' }
          : { fase: 'erro', mensagem: saida.split('\n').slice(-3).join(' ') || `codex login saiu com código ${code}` };
    })
    .catch((err) => {
      emCurso = { fase: 'erro', mensagem: err instanceof Error ? err.message : String(err) };
    })
    .finally(() => {
      cancelar = null;
    });

  return emCurso;
}
