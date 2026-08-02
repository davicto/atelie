import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useRunSocket } from '../ws';
import type { SerieResult, SerieSpec, StyleInfo } from '../types';
import { Badge, Button, Console, Empty, ErrorBanner, Field, NotaBadge, ProgressList, Segmented, Thumb, WorkersField } from '../ui';

interface PersonRow {
  nome: string;
  descricao: string;
}
interface PanelRow {
  cena: string;
  personagens: string;
}

export default function Serie() {
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [titulo, setTitulo] = useState('');
  const [estilo, setEstilo] = useState('custom');
  const [mode, setMode] = useState<'desc' | 'estruturado'>('desc');
  const [desc, setDesc] = useState('');
  const [scenesText, setScenesText] = useState('');
  const [persons, setPersons] = useState<PersonRow[]>([{ nome: '', descricao: '' }]);
  const [panels, setPanels] = useState<PanelRow[]>([{ cena: '', personagens: '' }]);
  const [sheetBusy, setSheetBusy] = useState(false);

  const run = useRunSocket<SerieResult>('serie-avulsa');
  // Começa no default das configurações; o ajuste aqui vale só para esta corrida.
  const [workers, setWorkers] = useState(0);

  useEffect(() => {
    api.styles().then(setStyles).catch(() => setStyles([]));
    api.settings().then((s) => setWorkers(s.concurrency)).catch(() => {});
  }, []);

  const scenes = useMemo(() => scenesText.split('\n').map((l) => l.trim()).filter(Boolean), [scenesText]);

  const spec: SerieSpec | null = useMemo(() => {
    if (!titulo.trim()) return null;
    if (mode === 'desc') {
      if (!desc.trim() || scenes.length === 0) return null;
      return { titulo: titulo.trim(), estilo, desc: desc.trim(), paineis: scenes.map((cena) => ({ cena })) };
    }
    const pers = persons.map((p) => ({ nome: p.nome.trim(), descricao: p.descricao.trim() })).filter((p) => p.nome && p.descricao);
    const pan = panels
      .map((p) => ({ cena: p.cena.trim(), personagens: p.personagens.split(',').map((s) => s.trim()).filter(Boolean) }))
      .filter((p) => p.cena);
    if (pers.length === 0 || pan.length === 0) return null;
    return { titulo: titulo.trim(), estilo, canon: { personagens: pers }, paineis: pan };
  }, [titulo, estilo, mode, desc, scenes, persons, panels]);

  function generate() {
    if (!spec || run.running) return;
    run.start({ type: 'serie-run', payload: { spec, concurrency: workers } });
  }

  async function openGallery() {
    const r = run.result;
    if (!r) return;
    setSheetBusy(true);
    try {
      const path = r.contactSheet ?? (await api.serieSheet(r.serieId)).path;
      window.open(`/api/file?path=${encodeURIComponent(path)}`, '_blank');
    } catch (err) {
      alert(`Não foi possível abrir a galeria: ${(err as Error).message}`);
    } finally {
      setSheetBusy(false);
    }
  }

  const result = run.result;

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <div className="page-kicker">Coerência</div>
          <h1 className="page-title">Série</h1>
          <p className="page-desc">Gere uma sequência de imagens com personagens consistentes. A série sempre gera via codex (edição multi-referência) e um juiz verifica a coerência painel a painel.</p>
        </div>
      </div>

      <div className="card card-pad">
        <div className="row">
          <Field label="Título">
            <input className="input" style={{ minWidth: 260 }} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex.: As aventuras de Nara" />
          </Field>
          <Field label="Estilo">
            <select className="select" value={estilo} onChange={(e) => setEstilo(e.target.value)}>
              <option value="custom">custom (livre)</option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </Field>
          <Field label="Modo do cânone">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'desc', label: 'descrição livre' },
                { value: 'estruturado', label: 'personagens + painéis' },
              ]}
            />
          </Field>
        </div>

        <hr className="divider" />

        {mode === 'desc' ? (
          <>
            <Field label="Descrição da história / mundo" hint="O Claude monta o cânone (personagens, paleta, mundo) a partir disto.">
              <textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="ex.: Nara é uma exploradora ruiva de jaqueta laranja; seu robô Pip é pequeno e azul. Mundo de ruínas cobertas de vegetação." />
            </Field>
            <Field label="Cenas / painéis" hint="uma cena por linha">
              <textarea className="textarea mono" value={scenesText} onChange={(e) => setScenesText(e.target.value)} placeholder={'Nara encontra a entrada da ruína\nPip ilumina um corredor escuro\nOs dois descobrem um salão gigante'} />
            </Field>
          </>
        ) : (
          <>
            <div className="field-label" style={{ marginBottom: 10 }}>Personagens</div>
            {persons.map((p, i) => (
              <div className="pers-row" key={i}>
                <input className="input" placeholder="nome" value={p.nome} onChange={(e) => setPersons(upd(persons, i, { nome: e.target.value }))} />
                <input className="input" placeholder="descrição visual detalhada (trava do personagem)" value={p.descricao} onChange={(e) => setPersons(upd(persons, i, { descricao: e.target.value }))} />
                <button className="icon-btn" type="button" title="remover" onClick={() => setPersons(persons.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <Button size="sm" onClick={() => setPersons([...persons, { nome: '', descricao: '' }])}>+ personagem</Button>

            <div className="field-label" style={{ margin: '20px 0 10px' }}>Painéis</div>
            {panels.map((p, i) => (
              <div className="pers-row" key={i}>
                <input className="input" placeholder="personagens (vírgula)" value={p.personagens} onChange={(e) => setPanels(upd(panels, i, { personagens: e.target.value }))} />
                <input className="input" placeholder="cena" value={p.cena} onChange={(e) => setPanels(upd(panels, i, { cena: e.target.value }))} />
                <button className="icon-btn" type="button" title="remover" onClick={() => setPanels(panels.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <Button size="sm" onClick={() => setPanels([...panels, { cena: '', personagens: '' }])}>+ painel</Button>
          </>
        )}

        <div style={{ marginTop: 18, maxWidth: 520 }}>
          <WorkersField value={workers} onChange={setWorkers} avisoEncadeamento />
        </div>

        <div style={{ marginTop: 22, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button variant="primary" onClick={generate} disabled={!spec || run.running}>
            {run.running ? 'Gerando série…' : 'Gerar série'}
          </Button>
          {/* Fechar o socket não aborta o run no servidor — rótulo honesto. */}
          {run.running && <Button variant="ghost" onClick={run.cancel}>Parar de acompanhar</Button>}
          {!run.running && (result || run.error) && <Button variant="ghost" onClick={run.reset}>Limpar</Button>}
          {!spec && <span className="subtle">preencha título, {mode === 'desc' ? 'descrição e ao menos uma cena' : 'um personagem e um painel'}.</span>}
        </div>
      </div>

      {(run.running || run.logs.length > 0 || run.error) && (
        <>
          <div className="section-title">Console</div>
          {run.error && <div style={{ marginBottom: 12 }}><ErrorBanner msg={run.error} /></div>}
          <ProgressList progress={run.progress} />
          <Console logs={run.logs} running={run.running} />
        </>
      )}

      {result && (
        <>
          <div className="section-title">Âncoras dos personagens</div>
          {result.canon.personagens.length === 0 ? (
            <Empty>Sem personagens ancorados.</Empty>
          ) : (
            <div className="grade">
              {result.canon.personagens.map((p) => (
                <div className="card result-card" key={p.nome}>
                  <Thumb path={p.anchorPng} alt={p.nome} />
                  <div className="result-body">
                    <div className="result-style">{p.nome}</div>
                    <div className="result-meta">âncora</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Painéis</span>
            <Button size="sm" onClick={() => void openGallery()} disabled={sheetBusy}>{sheetBusy ? 'abrindo…' : 'Abrir galeria'}</Button>
          </div>
          <div className="grade">
            {result.paineis.map((p) => (
              <div className="card result-card" key={p.n}>
                <Thumb path={p.pngPath} alt={`painel ${p.n}`} wide />
                <div className="result-body">
                  <div className="result-top">
                    <span className="result-style">Painel {p.n}</span>
                    <Badge tone={p.aprovado ? 'ok' : 'warn'}>{p.aprovado ? 'aprovado' : 'revisar'}</Badge>
                  </div>
                  <div className="scene-txt">{p.cena}</div>
                  <div className="votes">
                    <span className="result-meta">consistência</span> <NotaBadge nota={p.consistencia} />
                    <span className="result-meta">cena</span> <NotaBadge nota={p.cenaNota} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function upd<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}
