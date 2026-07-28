import { useEffect, useState } from 'react';
import { api } from '../api';
import type { FullSession, SessionSummary, VerdictJson } from '../types';
import { Badge, Button, Empty, ErrorBanner, Loading, NotaBadge, Thumb } from '../ui';
import { fmtDate, fmtDuration } from '../util';
import { ResultCard } from './Criar';

export default function Sessoes() {
  const [list, setList] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setList(await api.sessions());
    } catch (err) {
      setError(String((err as Error).message));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (openId) return <Detail id={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <div className="page-kicker">Histórico</div>
          <h1 className="page-title">Sessões</h1>
          <p className="page-desc">Todas as gerações salvas em ~/.atelie. Clique para ver as imagens, os vereditos e abrir a galeria.</p>
        </div>
        <Button onClick={() => void load()}>↻ Recarregar</Button>
      </div>

      {error && <ErrorBanner msg={error} />}
      {!list ? (
        <Loading label="lendo sessões…" />
      ) : list.length === 0 ? (
        <Empty>Nenhuma sessão ainda. Vá em <b>Criar</b> para gerar sua primeira imagem.</Empty>
      ) : (
        <div className="sess-list">
          {list.map((s) => (
            <div className="card sess-item" key={s.id} onClick={() => setOpenId(s.id)}>
              <div style={{ minWidth: 0 }}>
                <div className="sess-req">{s.request || '(sem pedido)'}</div>
                <div className="sess-sub">{fmtDate(s.createdAt)} · {s.styleIds.join(', ') || '—'}</div>
              </div>
              <div className="sess-metrics">
                <Badge tone="mute">{s.imageCount} img</Badge>
                <Badge tone="mute">{s.iterations} iter</Badge>
                {s.durationMs != null && <Badge tone="mute">{fmtDuration(s.durationMs)}</Badge>}
                <NotaBadge nota={s.bestNota} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const [full, setFull] = useState<FullSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  useEffect(() => {
    api.session(id).then(setFull).catch((err) => setError(String((err as Error).message)));
  }, [id]);

  async function openGallery() {
    setSheetBusy(true);
    try {
      const { path } = await api.sessionSheet(id);
      window.open(`/api/file?path=${encodeURIComponent(path)}`, '_blank');
    } catch (err) {
      alert(`Não foi possível gerar a galeria: ${(err as Error).message}`);
    } finally {
      setSheetBusy(false);
    }
  }

  const verdictByJob = new Map<string, VerdictJson>();
  const styleByJob = new Map<string, string>();
  for (const r of full?.session.results ?? []) {
    if (r.verdict) verdictByJob.set(r.job.id, r.verdict);
    styleByJob.set(r.job.id, r.job.styleId);
  }

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <div className="page-kicker">Sessão</div>
          <h1 className="page-title" style={{ overflowWrap: 'anywhere' }}>{full?.session.request ?? id}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button onClick={onBack}>← Voltar</Button>
          <Button variant="primary" onClick={() => void openGallery()} disabled={sheetBusy}>{sheetBusy ? 'abrindo…' : 'Abrir galeria'}</Button>
        </div>
      </div>

      {error && <ErrorBanner msg={error} />}
      {!full ? (
        <Loading label="carregando sessão…" />
      ) : (
        <>
          <div className="stat-strip">
            <span>id <b>{full.session.id}</b></span>
            <span>criada <b>{fmtDate(full.session.createdAt)}</b></span>
            <span>provedor <b>{full.session.genProvider ?? full.session.provider ?? '—'}</b></span>
            {full.session.size && <span>dimensão <b>{full.session.size}</b></span>}
            {full.session.totalDurationMs != null && <span>duração <b>{fmtDuration(full.session.totalDurationMs)}</b></span>}
            {full.session.estimatedCostUsd != null && <span>custo <b>${full.session.estimatedCostUsd.toFixed(3)}</b></span>}
          </div>

          {full.images.length === 0 ? (
            <Empty>Esta sessão não tem imagens registradas.</Empty>
          ) : (
            <div className="grade">
              {full.images.map((img) => {
                const verdict = verdictByJob.get(img.jobId) ?? null;
                const idxFromJob = Number(img.jobId.slice(img.jobId.lastIndexOf('-') + 1));
                if (verdict) {
                  return (
                    <ResultCard
                      key={img.jobId}
                      styleName={styleByJob.get(img.jobId) ?? img.styleId}
                      iteration={img.iteration}
                      index={Number.isFinite(idxFromJob) ? idxFromJob : 0}
                      pngPath={img.pngPath}
                      verdict={verdict}
                    />
                  );
                }
                return (
                  <div className="card result-card" key={img.jobId}>
                    <Thumb path={img.pngPath} alt={img.styleId} />
                    <div className="result-body">
                      <div className="result-top">
                        <span className="result-style">{img.styleId || '—'}</span>
                        <NotaBadge nota={img.nota} />
                      </div>
                      <div className="result-meta">iter {img.iteration}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
