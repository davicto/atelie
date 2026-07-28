import { useEffect, useState } from 'react';
import { api } from '../api';
import type { CliId, Settings } from '../types';
import { Button, ErrorBanner, Field, Loading, Toggle } from '../ui';

export default function Config() {
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  useEffect(() => {
    api.settings().then(setS).catch((err) => setError(String((err as Error).message)));
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  function setKey(id: CliId, value: boolean) {
    setS((prev) => (prev ? { ...prev, enabledClis: { ...prev.enabledClis, [id]: value } } : prev));
  }

  async function save() {
    if (!s) return;
    setSaving(true);
    setToast(null);
    try {
      const saved = await api.putSettings(s);
      setS(saved);
      setToast({ msg: 'Configurações salvas.' });
    } catch (err) {
      setToast({ msg: `Falha ao salvar: ${(err as Error).message}`, err: true });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3200);
    }
  }

  if (error) return <div className="view"><ErrorBanner msg={error} /></div>;
  if (!s) return <div className="view"><Loading label="carregando configurações…" /></div>;

  const num = (k: keyof Settings) => Number((s[k] as number) ?? 0);

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <div className="page-kicker">Preferências</div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-desc">Padrões da esteira, limiares do juiz, parâmetros da série, autenticação e chaves de API. Persistidas em ~/.atelie/config.json.</p>
        </div>
        <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
      </div>

      <div className="section-title">Geração & juiz</div>
      <div className="card card-pad">
        <div className="row">
          <Field label="Modo de autenticação">
            <select className="select" value={s.authMode} onChange={(e) => set('authMode', e.target.value as Settings['authMode'])}>
              <option value="cli">cli (login das CLIs)</option>
              <option value="apikey">apikey (chaves)</option>
              <option value="auto">auto</option>
            </select>
          </Field>
          <Field label="Provedor de geração">
            <select className="select" value={s.genProvider} onChange={(e) => set('genProvider', e.target.value as Settings['genProvider'])}>
              <option value="codex">codex</option>
            </select>
          </Field>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <Field label="Modo do juiz">
            <select className="select" value={s.judgeMode} onChange={(e) => set('judgeMode', e.target.value as Settings['judgeMode'])}>
              <option value="painel">painel</option>
              <option value="unico">único</option>
            </select>
          </Field>
          <Field label="Modelo do juiz único (claude)">
            <input className="input" value={s.judgeModel} onChange={(e) => set('judgeModel', e.target.value)} />
          </Field>
          <Field label="Nota mínima p/ aprovar">
            <input className="input num" type="number" min={0} max={10} value={num('approveThreshold')} onChange={(e) => set('approveThreshold', Number(e.target.value))} />
          </Field>
          <Field label="Concorrência">
            <input className="input num" type="number" min={1} value={num('concurrency')} onChange={(e) => set('concurrency', Number(e.target.value))} />
          </Field>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <Field label="Versões por estilo (default)">
            <input className="input num" type="number" min={1} value={num('defaultVersionsPerStyle')} onChange={(e) => set('defaultVersionsPerStyle', Number(e.target.value))} />
          </Field>
          <Field label="Qualidade (default)">
            <select className="select" value={s.defaultQuality} onChange={(e) => set('defaultQuality', e.target.value as Settings['defaultQuality'])}>
              <option value="low">baixa</option>
              <option value="medium">média</option>
              <option value="high">alta</option>
            </select>
          </Field>
          <Field label="Comando do viewer" hint="vazio = xdg-open">
            <input className="input" value={s.viewerCmd ?? ''} onChange={(e) => set('viewerCmd', e.target.value.trim() ? e.target.value : null)} />
          </Field>
          <Field label="Abrir a pasta ao terminar" hint="publica e abre a pasta das imagens">
            <div style={{ paddingTop: 4 }}>
              <Toggle checked={s.autoOpenFolder} ariaLabel="abrir a pasta ao terminar" onChange={(v) => set('autoOpenFolder', v)} />
            </div>
          </Field>
        </div>
      </div>

      <div className="section-title">Série</div>
      <div className="card card-pad">
        <div className="row">
          <Field label="Consistência mínima">
            <input className="input num" type="number" min={0} max={10} value={num('consistThreshold')} onChange={(e) => set('consistThreshold', Number(e.target.value))} />
          </Field>
          <Field label="Fidelidade à cena mínima">
            <input className="input num" type="number" min={0} max={10} value={num('cenaThreshold')} onChange={(e) => set('cenaThreshold', Number(e.target.value))} />
          </Field>
          <Field label="Tentativas por painel">
            <input className="input num" type="number" min={1} value={num('maxTentativas')} onChange={(e) => set('maxTentativas', Number(e.target.value))} />
          </Field>
          <Field label="Usar painel anterior como referência">
            <div style={{ paddingTop: 4 }}>
              <Toggle checked={s.incluirAnterior} ariaLabel="incluir painel anterior" onChange={(v) => set('incluirAnterior', v)} />
            </div>
          </Field>
        </div>
      </div>

      <div className="section-title">CLIs habilitadas</div>
      <div className="panel">
        {(['codex', 'claude'] as CliId[]).map((id) => (
          <div className="kv" key={id}>
            <span className="kv-key">{id}</span>
            <Toggle checked={s.enabledClis[id]} ariaLabel={`habilitar ${id}`} onChange={(v) => setKey(id, v)} />
          </div>
        ))}
      </div>

      <div className="section-title">Chaves de API</div>
      <div className="card card-pad">
        <Field label="OpenAI API key" hint="deixe em branco para não usar chave (login do Codex)">
          <input className="input mono" type="password" autoComplete="off" value={s.openaiApiKey ?? ''} onChange={(e) => set('openaiApiKey', e.target.value.trim() ? e.target.value : null)} placeholder="sk-…" />
        </Field>
        <Field label="Anthropic API key">
          <input className="input mono" type="password" autoComplete="off" value={s.anthropicApiKey ?? ''} onChange={(e) => set('anthropicApiKey', e.target.value.trim() ? e.target.value : null)} placeholder="sk-ant-…" />
        </Field>
        <Field label="Google API key">
          <input className="input mono" type="password" autoComplete="off" value={s.googleApiKey ?? ''} onChange={(e) => set('googleApiKey', e.target.value.trim() ? e.target.value : null)} placeholder="AIza…" />
        </Field>
      </div>

      <div style={{ marginTop: 24 }}>
        <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar configurações'}</Button>
      </div>

      {toast && <div className={`toast${toast.err ? ' err' : ''}`}>{toast.msg}</div>}
    </div>
  );
}
