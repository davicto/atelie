import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Capability, CliId, ClisResponse, Environment } from '../types';
import { Badge, Button, ErrorBanner, Loading, Toggle } from '../ui';
import { cx } from '../util';

const CAP_LABEL: Record<Capability, string> = {
  'geração': 'Geração de imagem',
  'juiz': 'Painel de juízes',
  'add-style': 'Criar estilo (Claude autora)',
  'cânone-série': 'Cânone da série',
};

export default function Dashboard() {
  const [env, setEnv] = useState<Environment | null>(null);
  const [clis, setClis] = useState<ClisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<CliId | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [e, c] = await Promise.all([api.doctor(), api.clis()]);
      setEnv(e);
      setClis(c);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function toggleCli(id: CliId, next: boolean) {
    setBusy(id);
    try {
      const c = await api.putClis({ [id]: next });
      setClis(c);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(null);
    }
  }

  function providersFor(cap: Capability): { active: CliId[]; all: CliId[] } {
    const all = clis?.capabilities[cap] ?? [];
    const active = all.filter((p) => clis?.enabledClis[p]);
    return { active, all };
  }

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <div className="page-kicker">Diagnóstico</div>
          <h1 className="page-title">Ambiente & CLIs</h1>
          <p className="page-desc">Estado das ferramentas de linha de comando, chaves de API e capacidades. Ligue ou desligue cada CLI — a mudança é persistida e afeta imediatamente quais recursos ficam disponíveis.</p>
        </div>
        <Button onClick={() => void load()}>↻ Recarregar</Button>
      </div>

      {error && <ErrorBanner msg={error} />}
      {loading && !env ? (
        <Loading label="sondando ambiente…" />
      ) : env && clis ? (
        <>
          <div className="section-title">Ferramentas (CLIs)</div>
          <div className="grid-cards">
            {env.clis.map((cli) => {
              const on = clis.enabledClis[cli.id];
              return (
                <div className={cx('card', 'card-pad', 'cli-card', !on && 'off')} key={cli.id}>
                  <div className="cli-head">
                    <div>
                      <div className="cli-name">{cli.nome}</div>
                      {cli.versao && <div className="cli-ver">{cli.versao}</div>}
                    </div>
                    <Toggle checked={on} disabled={busy === cli.id} ariaLabel={`habilitar ${cli.nome}`} onChange={(v) => void toggleCli(cli.id, v)} />
                  </div>

                  <div className="chips-wrap">
                    <Badge tone={cli.instalada ? 'ok' : 'err'}>{cli.instalada ? 'instalada' : 'ausente'}</Badge>
                    <Badge tone={cli.autenticada ? 'ok' : 'warn'}>{cli.autenticada ? 'autenticada' : 'sem auth'}</Badge>
                    {!on && <Badge tone="mute">desligada</Badge>}
                  </div>

                  <div className="cli-detail">{cli.detalhe}</div>

                  <div className="chips-wrap">
                    {cli.capacidades.map((c) => (
                      <span className="badge accent" key={c}>{c}</span>
                    ))}
                  </div>

                  {(!cli.instalada || !cli.autenticada) && cli.remediacao && cli.remediacao.length > 0 && (
                    <div className="remediation">
                      <b>Como resolver</b>
                      <ul>
                        {cli.remediacao.map((r, i) => (
                          <li key={i} dangerouslySetInnerHTML={{ __html: escapeCodes(r) }} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="section-title">Capacidades do app</div>
          <div className="panel">
            {(Object.keys(CAP_LABEL) as Capability[]).map((cap) => {
              const { active, all } = providersFor(cap);
              const down = active.length === 0;
              return (
                <div className="cap-row" key={cap}>
                  <div>
                    <div className="cap-name">{CAP_LABEL[cap]}</div>
                    <div className="cap-providers">
                      via {all.map((p) => (active.includes(p) ? p : `${p} (off)`)).join(' · ')}
                    </div>
                  </div>
                  <Badge tone={down ? 'err' : 'ok'}>{down ? 'parado' : `ativo · ${active.length}`}</Badge>
                </div>
              );
            })}
          </div>

          <div className="section-title">Chaves de API</div>
          <div className="panel">
            <div className="kv">
              <span className="kv-key">modo de autenticação</span>
              <Badge tone="accent">{env.authMode}</Badge>
            </div>
            {env.apiKeys.map((k) => (
              <div className="kv" key={k.provider}>
                <span className="kv-key">{k.provider}</span>
                <span className="chips-wrap">
                  <Badge tone={k.presente ? 'ok' : 'mute'}>{k.presente ? 'presente' : 'ausente'}</Badge>
                  <Badge tone="mute">{k.origem}</Badge>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// Realça trechos em `crase` da remediação como <code> (sem HTML arbitrário).
function escapeCodes(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/`([^`]+)`/g, '<code>$1</code>');
}
