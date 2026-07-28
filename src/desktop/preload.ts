// Ponte segura (contextIsolation) entre o main e a UI web. Expõe apenas metadados
// inócuos: versão do app e a URL do servidor local. A UI já fala com o mesmo
// origin via fetch/WS, então `serverUrl` é opcional (útil p/ "abrir no navegador").
import { contextBridge } from 'electron';

/** Lê `--chave=valor` do process.argv (passado via additionalArguments no main). */
function argValue(prefix: string): string {
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

contextBridge.exposeInMainWorld('atelie', {
  isDesktop: true,
  appVersion: argValue('--atelie-version='),
  serverUrl: argValue('--atelie-url='),
});
