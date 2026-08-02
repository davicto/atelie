import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { cx } from './util';
import { BrushLogo, Splats } from './ui';
import Menu from './screens/Menu';
import Estilos from './screens/Estilos';
import Projetos from './screens/Projetos';
import Projeto from './screens/Projeto';
import Ambiente from './screens/Dashboard';
import Criar from './screens/Criar';
import Serie from './screens/Serie';
import Sessoes from './screens/Sessoes';
import Config from './screens/Config';

export type Route = 'menu' | 'estilos' | 'projetos' | 'projeto' | 'criar' | 'serie' | 'sessoes' | 'ambiente' | 'config';

/** Navegação: `goto('projeto', id)` abre um projeto específico. */
export type Goto = (r: Route, projetoId?: string) => void;

const NAV: Array<{ id: Route; label: string }> = [
  { id: 'estilos', label: 'Estilos' },
  { id: 'projetos', label: 'Projetos' },
  { id: 'criar', label: 'Criar' },
  { id: 'serie', label: 'Série' },
  { id: 'sessoes', label: 'Sessões' },
  { id: 'ambiente', label: 'Ambiente' },
  { id: 'config', label: 'Ajustes' },
];

export default function App() {
  const [route, setRoute] = useState<Route>('menu');
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [health, setHealth] = useState<'ok' | 'err' | 'idle'>('idle');

  const goto = useCallback<Goto>((r, id) => {
    setProjetoId(id ?? null);
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        await api.health();
        if (alive) setHealth('ok');
      } catch {
        if (alive) setHealth('err');
      }
    };
    void ping();
    const t = setInterval(ping, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <>
      <Splats />
      <div className="shell">
        <header className="topbar">
          {/* O logo é o caminho de volta ao menu, de qualquer tela. */}
          <button className="brand" onClick={() => goto('menu')} title="voltar ao menu">
            <BrushLogo />
            <span>
              <span className="brand-name">Ateliê</span>
              <span className="brand-sub">estúdio de ilustração</span>
            </span>
          </button>
          <nav className="nav">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={cx('nav-item', (route === n.id || (n.id === 'projetos' && route === 'projeto')) && 'active')}
                onClick={() => goto(n.id)}
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="health">
            <span className={cx('dot', health)} />
            {health === 'ok' ? 'servidor local' : health === 'err' ? 'offline' : 'verificando…'}
          </div>
        </header>

        <main className="main">
          {route === 'menu' && <Menu goto={goto} />}
          {route === 'estilos' && <Estilos />}
          {route === 'projetos' && <Projetos goto={goto} />}
          {route === 'projeto' && projetoId && <Projeto projetoId={projetoId} goto={goto} />}
          {route === 'criar' && <Criar />}
          {route === 'serie' && <Serie />}
          {route === 'sessoes' && <Sessoes />}
          {route === 'ambiente' && <Ambiente />}
          {route === 'config' && <Config />}
        </main>
      </div>
    </>
  );
}
