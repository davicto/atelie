import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useRunSocket } from '../ws';
import type { ClisResponse, PanelVote, RunResult, Settings, StyleInfo, VerdictJson } from '../types';
import { Badge, Button, Console, Empty, ErrorBanner, Field, Loading, NotaBadge, ProgressList, Segmented, Thumb } from '../ui';
import { cx, fmtDuration } from '../util';
import { lerSelecao } from './Estilos';

const SIZE_PRESETS = [
  { label: 'Quadrado', value: '1024x1024' },
  { label: 'Retrato', value: '1024x1536' },
  { label: 'Paisagem', value: '1536x1024' },
  { label: 'Wide', value: 'wide' },
];

export default function Criar() {
  const [styles, setStyles] = useState<StyleInfo[] | null>(null);
  const [clis, setClis] = useState<ClisResponse | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [prompt, setPrompt] = useState('');
  // Herda o que foi marcado no portfólio de estilos.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(lerSelecao()));
  const [versions, setVersions] = useState(2);
  const genProvider = 'codex' as const;
  const [judgeMode, setJudgeMode] = useState<'painel' | 'unico'>('painel');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [size, setSize] = useState('');
  const [avoid, setAvoid] = useState('');
  const [iterate, setIterate] = useState(0);
  const [sheetBusy, setSheetBusy] = useState(false);

  const run = useRunSocket<RunResult>('criar');

  useEffect(() => {
    (async () => {
      try {
        const [s, c, cfg] = await Promise.all([api.styles(), api.clis(), api.settings()]);
        setStyles(s);
        // Estilo apagado depois de selecionado no portfólio não pode ficar preso na seleção.
        setSelected((prev) => new Set([...prev].filter((id) => s.some((x) => x.id === id))));
        setClis(c);
        setSettings(cfg);
        setVersions(cfg.defaultVersionsPerStyle);
        setJudgeMode(cfg.judgeMode);
        setQuality(cfg.defaultQuality);
      } catch (err) {
        setLoadErr(String((err as Error).message));
      }
    })();
  }, []);

  const enabled = clis?.enabledClis;
  const codexOn = enabled?.codex ?? true;
  // painel disponível se ao menos um juiz do painel estiver habilitado
  const panelOn = useMemo(
    () => (settings ? settings.judgePanel.some((j) => enabled?.[j.provider as 'codex' | 'claude'] ?? true) : true),
    [settings, enabled],
  );
  const singleJudgeProvider = settings?.singleJudge.provider ?? 'claude';
  const unicoOn = enabled?.[singleJudgeProvider as 'codex' | 'claude'] ?? true;

  const grouped = useMemo(() => {
    const m = new Map<string, StyleInfo[]>();
    for (const s of styles ?? []) {
      if (!m.has(s.grupo)) m.set(s.grupo, []);
      m.get(s.grupo)!.push(s);
    }
    return [...m.entries()];
  }, [styles]);

  const styleName = (id: string) => styles?.find((s) => s.id === id)?.nome ?? id;

  function toggleStyle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const genWarn = !codexOn;
  const judgeWarn = (judgeMode === 'painel' && !panelOn) || (judgeMode === 'unico' && !unicoOn);
  const canRun = prompt.trim().length > 0 && selected.size > 0 && !run.running && !genWarn && !judgeWarn;

  function generate() {
    if (!canRun) return;
    run.start({
      type: 'run',
      payload: {
        prompt: prompt.trim(),
        styles: [...selected],
        versions,
        genProvider,
        judgeMode,
        quality,
        ...(size.trim() ? { size: size.trim() } : {}),
        ...(avoid.trim() ? { avoid: avoid.trim() } : {}),
        ...(iterate > 0 ? { iterate } : {}),
      },
    });
  }

  async function openGallery() {
    if (!run.result) return;
    setSheetBusy(true);
    try {
      const { path } = await api.sessionSheet(run.result.sessionId);
      window.open(`/api/file?path=${encodeURIComponent(path)}`, '_blank');
    } catch (err) {
      alert(`Não foi possível gerar a galeria: ${(err as Error).message}`);
    } finally {
      setSheetBusy(false);
    }
  }

  const result = run.result;
  const bestPath = result?.best?.pngPath ?? null;
  const allResults = useMemo(() => {
    if (!result) return [];
    return result.iterations.flatMap((it) =>
      it.results
        .filter((r) => r.pngPath)
        .map((r) => ({ ...r, iteration: it.iteration })),
    );
  }, [result]);

  if (loadErr) return <div className="view"><ErrorBanner msg={loadErr} /></div>;
  if (!styles || !clis || !settings) return <div className="view"><Loading label="carregando estilos…" /></div>;

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <div className="page-kicker">Esteira</div>
          <h1 className="page-title">Criar imagens</h1>
          <p className="page-desc">Descreva o pedido, escolha um ou mais estilos e gere. O juiz avalia cada versão e, se você pedir iteração, o loop tenta melhorar as reprovadas.</p>
        </div>
      </div>

      <div className="card card-pad">
        <Field label="Prompt" hint="O que você quer ver na imagem.">
          <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="ex.: um farol solitário numa costa rochosa ao entardecer, névoa baixa" />
        </Field>

        <div className="field-label" style={{ marginBottom: 10 }}>Estilos {selected.size > 0 && <span className="subtle">· {selected.size} selecionado(s)</span>}</div>
        {grouped.map(([grupo, items]) => (
          <div key={grupo} style={{ marginBottom: 14 }}>
            <div className="subtle mono" style={{ marginBottom: 7 }}>{grupo}</div>
            <div className="chips-wrap">
              {items.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={cx('chip', selected.has(s.id) && 'on')}
                  title={s.desc}
                  onClick={() => toggleStyle(s.id)}
                >
                  {s.nome}
                  {s.origem !== 'builtin' && <span className="subtle"> ·{s.origem}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}

        <hr className="divider" />

        <div className="row">
          <Field label="Versões por estilo">
            <input className="input num" type="number" min={1} max={8} value={versions} onChange={(e) => setVersions(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
          <Field label="Iterações de melhoria" hint="0 = sem loop">
            <input className="input num" type="number" min={0} max={5} value={iterate} onChange={(e) => setIterate(Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <Field label="Modo do juiz">
            <Segmented
              value={judgeMode}
              onChange={setJudgeMode}
              options={[
                { value: 'painel', label: 'painel', disabled: !panelOn },
                { value: 'unico', label: 'único', disabled: !unicoOn },
              ]}
            />
          </Field>
          <Field label="Qualidade">
            <Segmented
              value={quality}
              onChange={setQuality}
              options={[
                { value: 'low', label: 'baixa' },
                { value: 'medium', label: 'média' },
                { value: 'high', label: 'alta' },
              ]}
            />
          </Field>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <Field label="Dimensão" hint="dica ao gerador (o backend resolve)">
            <div className="chips-wrap" style={{ marginBottom: 8 }}>
              {SIZE_PRESETS.map((p) => (
                <button type="button" key={p.value} className={cx('chip', size === p.value && 'on')} onClick={() => setSize(size === p.value ? '' : p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
            <input className="input mono" style={{ maxWidth: 220 }} value={size} onChange={(e) => setSize(e.target.value)} placeholder="ex.: 1024x1024" />
          </Field>
          <Field label="Evitar (negativos)" hint="o que NÃO deve aparecer">
            <input className="input" value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="ex.: texto, marca d'água, deformações" />
          </Field>
        </div>

        {genWarn && <div className="hint-inline">Atenção: a CLI de geração “{genProvider}” está desligada — habilite-a no Diagnóstico ou troque de provedor.</div>}
        {judgeWarn && <div className="hint-inline">Atenção: nenhuma CLI habilitada para o modo de juiz “{judgeMode}”.</div>}

        <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button variant="primary" onClick={generate} disabled={!canRun}>
            {run.running ? 'Gerando…' : 'Gerar'}
          </Button>
          {run.running && <Button variant="ghost" onClick={run.cancel}>Cancelar</Button>}
          {!run.running && (result || run.error) && <Button variant="ghost" onClick={run.reset}>Limpar</Button>}
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
          <div className="section-title">Resultados</div>
          <div className="stat-strip">
            <span>sessão <b>{result.sessionId}</b></span>
            <span>duração <b>{fmtDuration(result.durationMs)}</b></span>
            <span>custo estimado <b>${result.estimatedCostUsd.toFixed(3)}</b></span>
            {result.best?.nota != null && <span>melhor nota <b>{result.best.nota.toFixed(1)}</b></span>}
            <Button size="sm" onClick={() => void openGallery()} disabled={sheetBusy}>{sheetBusy ? 'abrindo…' : 'Abrir galeria'}</Button>
          </div>
          {allResults.length === 0 ? (
            <Empty>Nenhuma imagem foi produzida nesta sessão.</Empty>
          ) : (
            <div className="grade">
              {allResults.map((r) => (
                <ResultCard
                  key={`${r.iteration}-${r.styleId}-${r.index}`}
                  styleName={styleName(r.styleId)}
                  iteration={r.iteration}
                  index={r.index}
                  pngPath={r.pngPath}
                  verdict={r.verdict}
                  best={!!bestPath && r.pngPath === bestPath}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function voteLabel(v: PanelVote): string {
  return v.spec?.label ?? v.spec?.model ?? v.model ?? v.provider ?? '?';
}
function voteNota(v: PanelVote): number | null {
  return v.nota ?? v.verdict?.nota ?? null;
}

export function ResultCard({
  styleName,
  iteration,
  index,
  pngPath,
  verdict,
  best,
}: {
  styleName: string;
  iteration?: number;
  index: number;
  pngPath: string | null;
  verdict: VerdictJson | null;
  best?: boolean;
}) {
  return (
    <div className={cx('card', 'result-card', best && 'best')}>
      <Thumb path={pngPath} alt={styleName} />
      <div className="result-body">
        <div className="result-top">
          <span className="result-style">{styleName}</span>
          <NotaBadge nota={verdict?.nota} aprovado={verdict?.aprovado} />
        </div>
        <div className="result-meta">
          {best && 'melhor · '}
          {iteration != null && `iter ${iteration} · `}versão {index + 1}
        </div>
        {verdict?.alinhamento && <div className="result-note"><b>Alinhamento:</b> {verdict.alinhamento}</div>}
        {verdict?.problemas && verdict.problemas.length > 0 && (
          <ul className="problems">
            {verdict.problemas.slice(0, 4).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {verdict?.sugestao_melhoria && <div className="result-note"><b>Sugestão:</b> {verdict.sugestao_melhoria}</div>}
        {verdict?.painel && verdict.painel.length > 0 && (
          <div className="votes">
            {verdict.painel.map((v, i) => (
              <Badge key={i} tone="mute">{voteLabel(v)} {voteNota(v)?.toFixed(1) ?? '—'}</Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
