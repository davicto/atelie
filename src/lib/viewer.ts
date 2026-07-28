import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import { loadSettings } from './settings';

/** Abre o PNG no viewer do sistema (destacado, sem prender a TUI). */
export function openViewer(p: string): void {
  const cmd = loadSettings().viewerCmd || 'xdg-open';
  try {
    // viewerCmd é tratado como binário único: split por espaço quebraria caminhos
    // com espaço. O evento 'error' do spawn é ASSÍNCRONO — sem handler, um viewer
    // ausente (ex.: xdg-open no WSL) derrubaria a TUI mesmo dentro deste try.
    const c = spawn(cmd, [p], { detached: true, stdio: 'ignore' });
    c.on('error', () => {});
    c.unref();
  } catch {
    /* viewer indisponível — silencioso */
  }
}

/** true quando rodando sob WSL (xdg-open costuma não existir lá). */
function isWsl(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Abre a PASTA no explorador de arquivos do sistema. Sob WSL usa
 * `explorer.exe` com o caminho convertido por `wslpath -w` (xdg-open não
 * costuma existir); nos demais, o mesmo viewer/xdg-open.
 */
export function openFolder(dir: string): void {
  try {
    if (isWsl()) {
      const win = execFileSync('wslpath', ['-w', dir], { encoding: 'utf8' }).trim();
      const c = spawn('explorer.exe', [win], { detached: true, stdio: 'ignore' });
      c.on('error', () => {});
      c.unref();
      return;
    }
  } catch {
    /* cai no caminho genérico abaixo */
  }
  const cmd = loadSettings().viewerCmd || (process.platform === 'darwin' ? 'open' : 'xdg-open');
  try {
    const c = spawn(cmd, [dir], { detached: true, stdio: 'ignore' });
    c.on('error', () => {});
    c.unref();
  } catch {
    /* explorador indisponível — silencioso */
  }
}
