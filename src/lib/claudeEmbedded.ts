import fs from 'fs';
import path from 'path';
import { run, type RunHandle } from './runner';
import { extractJson } from './jsonx';

// Claude Code EMBUTIDO no app, pelo mesmo motivo do codex (ver codexEmbedded.ts):
// sem ele, o usuário final teria que instalar Node e o pacote npm à mão antes de
// conseguir usar o juiz, criar estilo com IA ou montar o cânone de uma série.
//
// O pacote publica um EXECUTÁVEL NATIVO (`bin/claude.exe`), não um launcher Node —
// então o app empacotado consegue chamá-lo direto, sem runtime npm por perto.

const PACOTE_POR_PLATAFORMA: Record<string, string | undefined> = {
  'win32-x64': '@anthropic-ai/claude-code-win32-x64',
  'win32-arm64': '@anthropic-ai/claude-code-win32-arm64',
  'darwin-x64': '@anthropic-ai/claude-code-darwin-x64',
  'darwin-arm64': '@anthropic-ai/claude-code-darwin-arm64',
  'linux-x64': '@anthropic-ai/claude-code-linux-x64',
  'linux-arm64': '@anthropic-ai/claude-code-linux-arm64',
};

const RESOURCES_DIR = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
const CHAVE = `${process.platform}-${process.arch}`;
const EXE = process.platform === 'win32' ? 'claude.exe' : 'claude';

function candidatos(): string[] {
  const pacote = PACOTE_POR_PLATAFORMA[CHAVE];
  const lista: Array<string | undefined> = [
    process.env.ATELIE_CLAUDE_BIN,
    // app empacotado
    RESOURCES_DIR ? path.join(RESOURCES_DIR, 'claude', 'bin', EXE) : undefined,
    // dev / `npm run serve`
    path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', EXE),
    pacote ? path.join(process.cwd(), 'node_modules', ...pacote.split('/'), 'bin', EXE) : undefined,
  ];
  return lista.filter((p): p is string => Boolean(p));
}

/** Caminho do executável embutido, ou `null` se nenhum candidato existir. */
export function claudeBin(): string | null {
  return candidatos().find((p) => fs.existsSync(p)) ?? null;
}

/** Binário a usar: o embutido, senão o `claude` da PATH (quem já tem instalado). */
export function claudeBinOuPath(): string {
  return claudeBin() ?? 'claude';
}

export interface ClaudeLoginStatus {
  logado: boolean;
  disponivel: boolean;
  detalhe: string;
  email?: string;
  plano?: string;
}

/**
 * Estado do login via `claude auth status --json`.
 *
 * Diferente do `codex login status` (que mente — responde "Logged in" lendo só o
 * arquivo local), este devolve JSON estruturado com `loggedIn`, e-mail e plano.
 * É barato: não gera nada nem consome tokens.
 */
export async function loginStatus(): Promise<ClaudeLoginStatus> {
  const bin = claudeBin();
  const disponivel = bin !== null;
  try {
    const r = await run(claudeBinOuPath(), ['auth', 'status', '--json'], { timeoutMs: 25_000 }).done;
    const j = extractJson(r.stdout + r.stderr) as
      | { loggedIn?: boolean; email?: string; subscriptionType?: string; authMethod?: string }
      | null;
    if (!j) {
      return {
        logado: false,
        disponivel: disponivel || r.code !== null,
        detalhe: r.code === null ? 'claude não encontrado' : 'não foi possível ler o status de login',
      };
    }
    return {
      logado: j.loggedIn === true,
      disponivel: true,
      detalhe: j.loggedIn ? `conectado (${j.authMethod ?? 'claude.ai'})` : 'não conectado',
      ...(j.email ? { email: j.email } : {}),
      ...(j.subscriptionType ? { plano: j.subscriptionType } : {}),
    };
  } catch {
    return { logado: false, disponivel, detalhe: 'claude não encontrado' };
  }
}

export interface LoginEmCurso {
  fase: 'iniciando' | 'aguardando-codigo' | 'concluido' | 'erro';
  url?: string;
  /** True quando a CLI já pediu o código — a UI libera o campo de colar. */
  pedeCodigo?: boolean;
  mensagem?: string;
}

let emCurso: LoginEmCurso | null = null;
let handle: RunHandle | null = null;

export function loginEmCurso(): LoginEmCurso | null {
  return emCurso;
}

export function abortarLogin(): void {
  handle?.cancel();
  handle = null;
  emCurso = null;
}

/** Remove sequências ANSI (a CLI colore a saída mesmo sem TTY). */
function semAnsi(s: string): string {
  return s.replace(/\[[0-9;]*m/g, '');
}

/**
 * Dispara `claude auth login` e acompanha a saída.
 *
 * O fluxo NÃO é o mesmo do codex: em vez de código de dispositivo com polling, a
 * CLI imprime uma URL e depois BLOQUEIA esperando o código colado no stdin
 * ("Paste code here if prompted >"). Por isso o processo roda com stdin aberto e
 * a UI precisa de um segundo passo — ver `enviarCodigo`.
 */
export function iniciarLogin(): LoginEmCurso {
  if (emCurso && emCurso.fase !== 'concluido' && emCurso.fase !== 'erro') return emCurso;

  emCurso = { fase: 'iniciando' };
  // Lê PEDAÇOS crus, não linhas: o pedido do código é um prompt sem quebra de
  // linha ("Paste code here if prompted > ") e o processo trava ali. Por linha,
  // ele só chegaria quando o processo terminasse — a UI nunca abriria o campo.
  const capturar = (texto: string) => {
    const limpa = semAnsi(texto);
    if (!emCurso) return;
    const url = limpa.match(/https?:\/\/\S+/)?.[0];
    if (url) emCurso = { ...emCurso, url, fase: 'aguardando-codigo' };
    if (/paste code/i.test(limpa)) emCurso = { ...emCurso, pedeCodigo: true, fase: 'aguardando-codigo' };
  };

  const h = run(claudeBinOuPath(), ['auth', 'login'], {
    // Tempo real de humano: abrir o link, autorizar e voltar com o código.
    timeoutMs: 10 * 60 * 1000,
    stdinInterativo: true,
    onChunk: capturar,
  });
  handle = h;

  void h.done
    .then(({ code, stdout, stderr }) => {
      const saida = semAnsi(stdout + stderr).trim();
      emCurso =
        code === 0
          ? { fase: 'concluido', mensagem: 'login concluído' }
          : { fase: 'erro', mensagem: saida.split('\n').slice(-3).join(' ') || `claude auth login saiu com código ${code}` };
    })
    .catch((err) => {
      emCurso = { fase: 'erro', mensagem: err instanceof Error ? err.message : String(err) };
    })
    .finally(() => {
      handle = null;
    });

  return emCurso;
}

/** Cola o código do navegador no stdin do login em curso. */
export function enviarCodigo(codigo: string): LoginEmCurso {
  const txt = codigo.trim();
  if (!emCurso || !handle) return { fase: 'erro', mensagem: 'nenhum login em andamento' };
  if (!txt) return emCurso;
  if (!handle.escrever(txt)) {
    emCurso = { fase: 'erro', mensagem: 'não foi possível enviar o código (o processo de login já terminou)' };
  }
  return emCurso;
}
