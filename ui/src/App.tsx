import { useEffect, useState } from 'react';
import { api } from './api';
import { cx } from './util';
import Dashboard from './screens/Dashboard';
import Criar from './screens/Criar';
import Serie from './screens/Serie';
import Sessoes from './screens/Sessoes';
import Config from './screens/Config';

type Route = 'dashboard' | 'criar' | 'serie' | 'sessoes' | 'config';

const NAV: Array<{ id: Route; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'criar', label: 'Criar' },
  { id: 'serie', label: 'Série' },
  { id: 'sessoes', label: 'Sessões' },
  { id: 'config', label: 'Configurações' },
];

export default function App() {
  const [route, setRoute] = useState<Route>('dashboard');
  const [health, setHealth] = useState<'ok' | 'err' | 'idle'>('idle');

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
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div className="brand-name">Ateliê</div>
            <span className="brand-sub">image studio</span>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.id} className={cx('nav-item', route === n.id && 'active')} onClick={() => setRoute(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="health">
            <span className={cx('dot', health)} />
            {health === 'ok' ? 'servidor local ativo' : health === 'err' ? 'servidor offline' : 'verificando…'}
          </div>
        </div>
      </aside>
      <main className="main">
        {route === 'dashboard' && <Dashboard />}
        {route === 'criar' && <Criar />}
        {route === 'serie' && <Serie />}
        {route === 'sessoes' && <Sessoes />}
        {route === 'config' && <Config />}
      </main>
    </div>
  );
}
