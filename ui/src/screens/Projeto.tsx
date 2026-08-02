import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useRunSocket } from '../ws';
import type { CastMember, ImagemUpload, LibraryItem, ProjectFull, SerieResult, SpriteResult, StyleInfo } from '../types';
import { Badge, Button, Console, Empty, ErrorBanner, Field, ImageDrop, Loading, Modal, NotaBadge, ProgressList, Segmented, Thumb, WorkersField } from '../ui';
import { cx, fileUrl } from '../util';
import type { Goto } from '../App';

export default function Projeto({ projetoId, goto }: { projetoId: string; goto: Goto }) {
  const [projeto, setProjeto] = useState<ProjectFull | null>(null);
  const [estilos, setEstilos] = useState<StyleInfo[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    try {
      const [p, s] = await Promise.all([api.project(projetoId), api.styles()]);
      setProjeto(p);
      setEstilos(s);
      setErro(null);
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }
  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId]);

  if (erro && !projeto) return <div className="view"><ErrorBanner msg={erro} /></div>;
  if (!projeto) return <div className="view"><Loading label="abrindo o projeto…" /></div>;

  const estilo = estilos.find((s) => s.id === projeto.estiloId) ?? null;
  const aprovados = projeto.elenco.filter((m) => m.aprovado);

  async function trocarEstilo(id: string) {
    try {
      setProjeto(await api.updateProject(projetoId, { estiloId: id || null }));
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }

  async function apagarProjeto() {
    if (!confirm(`Apagar o projeto "${projeto!.nome}", seu elenco e seus sprites?`)) return;
    try {
      await api.deleteProject(projetoId);
      goto('projetos');
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }

  return (
    <div className="view">
      <button className="crumb" onClick={() => goto('projetos')}>← todos os projetos</button>
      <div className="page-head">
        <div>
          <div className="page-kicker">Projeto</div>
          <h1 className="page-title">{projeto.nome}</h1>
          {projeto.descricao && <p className="page-desc">{projeto.descricao}</p>}
        </div>
        <div className="chips-wrap">
          <Button variant="danger" size="sm" onClick={() => void apagarProjeto()}>Apagar projeto</Button>
        </div>
      </div>

      {erro && <div style={{ marginBottom: 14 }}><ErrorBanner msg={erro} /></div>}

      <div className="card card-pad">
        <div className="row">
          <Field label="Estilo de ilustração" hint="vale para os sprites e para todos os painéis da série">
            <select className="select" style={{ minWidth: 280 }} value={projeto.estiloId ?? ''} onChange={(e) => void trocarEstilo(e.target.value)}>
              <option value="">— sem estilo definido —</option>
              {estilos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                  {s.origem === 'user' ? ' (meu)' : ''}
                </option>
              ))}
            </select>
          </Field>
          {estilo && (
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="subtle">{estilo.desc}</div>
              {estilo.refs[0] && (
                <img
                  src={fileUrl(estilo.refs[0])}
                  alt={estilo.nome}
                  style={{ height: 72, borderRadius: 9, marginTop: 8, border: '1px solid var(--line)' }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <Elenco projeto={projeto} onMudou={carregar} setErro={setErro} />
      <Briefings projeto={projeto} onMudou={carregar} setErro={setErro} />
      <GerarSerie projeto={projeto} aprovados={aprovados} onMudou={carregar} />
      <Biblioteca projeto={projeto} onMudou={carregar} setErro={setErro} />
    </div>
  );
}

// ── Elenco: referências → sprite → validação ─────────────────────────────────
function Elenco({
  projeto,
  onMudou,
  setErro,
}: {
  projeto: ProjectFull;
  onMudou: () => Promise<void>;
  setErro: (s: string | null) => void;
}) {
  const [novo, setNovo] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);
  const [zoom, setZoom] = useState<CastMember | null>(null);
  // Chave por projeto: dois projetos abertos em abas diferentes não se misturam.
  const run = useRunSocket<SpriteResult>(`sprite:${projeto.id}`);

  // Quando um sprite termina, o projeto no disco mudou — recarrega.
  useEffect(() => {
    if (!run.result) return;
    setGerando(null);
    void onMudou();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.result]);

  function gerar(m: CastMember, extra?: string) {
    if (run.running) return;
    setGerando(m.id);
    run.start({ type: 'sprite-run', payload: { projectId: projeto.id, memberId: m.id, ...(extra ? { extra } : {}) } });
  }

  async function validar(m: CastMember, aprovado: boolean) {
    try {
      await api.updateMember(projeto.id, m.id, { aprovado });
      await onMudou();
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }

  async function remover(m: CastMember) {
    if (!confirm(`Remover ${m.nome} do elenco?`)) return;
    try {
      await api.deleteMember(projeto.id, m.id);
      await onMudou();
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }

  return (
    <>
      <div className="section-title">Elenco · personagens</div>
      <p className="page-desc" style={{ marginTop: -6, marginBottom: 16 }}>
        Suba as imagens de referência de cada personagem e gere o <b>sprite</b> (folha com poses e expressões). O sprite
        só vira âncora da série depois que você <b>validar</b>.
      </p>

      {projeto.elenco.length === 0 ? (
        <Empty>Nenhum personagem ainda. Adicione o primeiro para gerar o sprite.</Empty>
      ) : (
        <div className="grade">
          {projeto.elenco.map((m) => {
            const ocupado = run.running && gerando === m.id;
            return (
              <div className={cx('card', 'result-card', m.aprovado && 'best')} key={m.id}>
                <Thumb path={m.spritePng} alt={m.nome} contain wide onClick={m.spritePng ? () => setZoom(m) : undefined} />
                <div className="result-body">
                  <div className="result-top">
                    <span className="result-style">{m.nome}</span>
                    <Badge tone={m.aprovado ? 'ok' : m.spritePng ? 'warn' : 'mute'}>
                      {m.aprovado ? 'validado' : m.spritePng ? 'aguardando validação' : 'sem sprite'}
                    </Badge>
                  </div>
                  {m.descricao && <div className="result-note">{m.descricao}</div>}
                  <div className="result-meta">{m.refs.length} imagem(ns) de referência</div>
                  {m.refs.length > 0 && (
                    <div className="ref-strip">
                      {m.refs.slice(0, 4).map((r) => (
                        <img key={r} src={fileUrl(r)} alt="referência" style={{ width: 54, height: 54 }} onClick={() => window.open(fileUrl(r), '_blank')} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="card-actions">
                  {/* Com sprite, "revisar" abre o detalhe — é lá que se pede o ajuste da regeração. */}
                  <Button
                    size="sm"
                    variant={m.spritePng ? 'default' : 'primary'}
                    disabled={run.running}
                    onClick={() => (m.spritePng ? setZoom(m) : gerar(m))}
                  >
                    {ocupado ? 'gerando…' : m.spritePng ? 'Revisar / regerar' : 'Gerar sprite'}
                  </Button>
                  {m.spritePng && !m.aprovado && (
                    <Button size="sm" variant="primary" onClick={() => void validar(m, true)}>Validar ✓</Button>
                  )}
                  {m.aprovado && <Button size="sm" onClick={() => void validar(m, false)}>Revogar</Button>}
                  <Button size="sm" variant="danger" onClick={() => void remover(m)}>Remover</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button onClick={() => setNovo(true)}>+ Personagem</Button>
        {run.running && <span className="subtle">um sprite por vez — aguarde terminar.</span>}
      </div>

      {(run.running || run.logs.length > 0 || run.error) && (
        <div style={{ marginTop: 18 }}>
          {run.error && <div style={{ marginBottom: 12 }}><ErrorBanner msg={run.error} /></div>}
          <ProgressList progress={run.progress} />
          <Console logs={run.logs} running={run.running} />
        </div>
      )}

      {novo && (
        <NovoPersonagemModal
          projetoId={projeto.id}
          onFechar={() => setNovo(false)}
          onCriado={async () => {
            setNovo(false);
            await onMudou();
          }}
        />
      )}

      {zoom && (
        <Modal
          title={`Sprite · ${zoom.nome}`}
          onClose={() => setZoom(null)}
          footer={
            <>
              <AjusteRegerar
                onRegerar={(txt) => {
                  setZoom(null);
                  gerar(zoom, txt);
                }}
                desabilitado={run.running}
              />
              {!zoom.aprovado && (
                <Button
                  variant="primary"
                  onClick={async () => {
                    await validar(zoom, true);
                    setZoom(null);
                  }}
                >
                  Validar ✓
                </Button>
              )}
            </>
          }
        >
          {zoom.spritePng && <img className="modal-ref" src={fileUrl(zoom.spritePng)} alt={zoom.nome} />}
          {zoom.descricao && <p>{zoom.descricao}</p>}
          {zoom.refs.length > 0 && (
            <>
              <div className="section-title">Referências enviadas</div>
              <div className="ref-strip">
                {zoom.refs.map((r) => (
                  <img key={r} src={fileUrl(r)} alt="referência" onClick={() => window.open(fileUrl(r), '_blank')} />
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

/** Campo de ajuste + botão de regerar, usado no detalhe do sprite. */
function AjusteRegerar({ onRegerar, desabilitado }: { onRegerar: (txt: string) => void; desabilitado?: boolean }) {
  const [txt, setTxt] = useState('');
  return (
    <>
      <input
        className="input"
        style={{ maxWidth: 260 }}
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        placeholder="o que ajustar? ex.: cabelo mais curto"
      />
      <Button disabled={desabilitado} onClick={() => onRegerar(txt.trim())}>Regerar sprite</Button>
    </>
  );
}

function NovoPersonagemModal({
  projetoId,
  onFechar,
  onCriado,
}: {
  projetoId: string;
  onFechar: () => void;
  onCriado: () => Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [imagens, setImagens] = useState<ImagemUpload[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      await api.addMember(projetoId, { nome: nome.trim(), descricao: descricao.trim(), imagens });
      await onCriado();
    } catch (e) {
      setErro(String((e as Error).message));
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Novo personagem"
      onClose={onFechar}
      footer={
        <>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={() => void salvar()} disabled={!nome.trim() || salvando}>
            {salvando ? 'enviando…' : 'Adicionar'}
          </Button>
        </>
      }
    >
      {erro && <div style={{ marginBottom: 14 }}><ErrorBanner msg={erro} /></div>}
      <Field label="Nome">
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Nara" />
      </Field>
      <Field label="Trava visual" hint="rosto, cabelo, roupa, cores, acessórios — quanto mais concreto, mais estável fica">
        <textarea
          className="textarea"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="ex.: menina de 8 anos, cabelo ruivo cacheado na altura do ombro, jaqueta laranja com bolsos, calça jeans, tênis branco"
        />
      </Field>
      <Field label="Imagens de referência" hint="com referências o sprite é gerado por edição multi-referência — o rosto vem daqui">
        <ImageDrop files={imagens} onChange={setImagens} label="Arraste fotos/desenhos do personagem" />
      </Field>
    </Modal>
  );
}

// ── Briefings ────────────────────────────────────────────────────────────────
function Briefings({
  projeto,
  onMudou,
  setErro,
}: {
  projeto: ProjectFull;
  onMudou: () => Promise<void>;
  setErro: (s: string | null) => void;
}) {
  const [texto, setTexto] = useState('');
  const [quem, setQuem] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  async function adicionar() {
    if (!texto.trim() || salvando) return;
    setSalvando(true);
    try {
      await api.addBriefings(projeto.id, { texto: texto.trim(), personagens: [...quem] });
      setTexto('');
      setQuem(new Set());
      await onMudou();
    } catch (e) {
      setErro(String((e as Error).message));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    try {
      await api.deleteBriefing(projeto.id, id);
      await onMudou();
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }

  return (
    <>
      <div className="section-title">Briefings · uma linha por imagem</div>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <Field label="Novo briefing" hint="cada linha vira uma imagem da série, na ordem">
          <textarea
            className="textarea"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'Nara encontra a entrada da ruína coberta de trepadeiras\nPip ilumina um corredor escuro\nOs dois descobrem um salão gigante'}
          />
        </Field>
        {projeto.elenco.length > 0 && (
          <>
            <div className="field-label" style={{ marginBottom: 8 }}>Quem aparece (vazio = todos)</div>
            <div className="chips-wrap" style={{ marginBottom: 14 }}>
              {projeto.elenco.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={cx('chip', quem.has(m.nome) && 'on')}
                  onClick={() =>
                    setQuem((prev) => {
                      const n = new Set(prev);
                      if (n.has(m.nome)) n.delete(m.nome);
                      else n.add(m.nome);
                      return n;
                    })
                  }
                >
                  {m.nome}
                </button>
              ))}
            </div>
          </>
        )}
        <Button variant="primary" onClick={() => void adicionar()} disabled={!texto.trim() || salvando}>
          {salvando ? 'salvando…' : '+ Adicionar briefing(s)'}
        </Button>
      </div>

      {projeto.briefings.length === 0 ? (
        <Empty>Sem briefings ainda.</Empty>
      ) : (
        <div className="panel">
          {projeto.briefings.map((b, i) => (
            <div className="brief-row" key={b.id}>
              <span className="brief-n">{i + 1}</span>
              <div>
                <div className="brief-txt">{b.texto}</div>
                <div className="brief-who">{b.personagens.length ? b.personagens.join(' · ') : 'todos os personagens'}</div>
              </div>
              <button className="icon-btn" type="button" title="remover" onClick={() => void remover(b.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Geração da série do projeto ──────────────────────────────────────────────
function GerarSerie({
  projeto,
  aprovados,
  onMudou,
}: {
  projeto: ProjectFull;
  aprovados: CastMember[];
  onMudou: () => Promise<void>;
}) {
  const [titulo, setTitulo] = useState(projeto.nome);
  const [sheetBusy, setSheetBusy] = useState(false);
  // Começa no default das configurações; o ajuste aqui vale só para esta corrida.
  const [workers, setWorkers] = useState(0);
  const run = useRunSocket<SerieResult>(`serie:${projeto.id}`);

  useEffect(() => {
    api.settings().then((s) => setWorkers(s.concurrency)).catch(() => {});
  }, []);

  useEffect(() => {
    if (run.result) void onMudou();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.result]);

  // Durante o run a biblioteca enche painel a painel — cada log novo é a deixa
  // para recarregar o projeto e mostrar a imagem que acabou de ser arquivada.
  useEffect(() => {
    if (!run.running) return;
    void onMudou();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.logs.length, run.running]);

  const impedimento = useMemo(() => {
    if (aprovados.length === 0) return 'valide ao menos um sprite do elenco';
    if (projeto.briefings.length === 0) return 'adicione ao menos um briefing';
    if (!titulo.trim()) return 'dê um título à série';
    return null;
  }, [aprovados.length, projeto.briefings.length, titulo]);

  function gerar() {
    if (impedimento || run.running) return;
    run.start({
      type: 'serie-run',
      payload: {
        concurrency: workers,
        spec: {
          titulo: titulo.trim(),
          projectId: projeto.id,
          estilo: projeto.estiloId ?? 'custom',
          desc: projeto.descricao || projeto.nome,
          paineis: projeto.briefings.map((b) => ({ cena: b.texto, ...(b.personagens.length ? { personagens: b.personagens } : {}) })),
        },
      },
    });
  }

  async function abrirGaleria() {
    const r = run.result;
    if (!r) return;
    setSheetBusy(true);
    try {
      const path = r.contactSheet ?? (await api.serieSheet(r.serieId)).path;
      window.open(`/api/file?path=${encodeURIComponent(path)}`, '_blank');
    } catch (e) {
      alert(`Não foi possível abrir a galeria: ${(e as Error).message}`);
    } finally {
      setSheetBusy(false);
    }
  }

  return (
    <>
      <div className="section-title">Gerar a série</div>
      <div className="card card-pad">
        <div className="row">
          <Field label="Título da série">
            <input className="input" style={{ minWidth: 280 }} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </Field>
          <div className="chips-wrap" style={{ alignItems: 'center' }}>
            <Badge tone={aprovados.length ? 'ok' : 'warn'}>{aprovados.length} sprite(s) validado(s)</Badge>
            <Badge tone={projeto.briefings.length ? 'ok' : 'warn'}>{projeto.briefings.length} briefing(s)</Badge>
          </div>
        </div>
        <p className="subtle" style={{ marginTop: 4 }}>
          Os sprites validados entram como âncora — não são regerados, então a validação que você fez acima é a que vale.
        </p>
        <div style={{ marginTop: 14, maxWidth: 520 }}>
          <WorkersField value={workers} onChange={setWorkers} avisoEncadeamento />
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={gerar} disabled={!!impedimento || run.running}>
            {run.running ? 'Gerando série…' : 'Gerar série'}
          </Button>
          {/* Fechar o socket não aborta o run no servidor — daí o rótulo honesto. */}
          {run.running && <Button variant="ghost" onClick={run.cancel}>Parar de acompanhar</Button>}
          {impedimento && <span className="subtle">Para gerar: {impedimento}.</span>}
        </div>
      </div>

      {(run.running || run.logs.length > 0 || run.error) && (
        <div style={{ marginTop: 18 }}>
          {run.error && <div style={{ marginBottom: 12 }}><ErrorBanner msg={run.error} /></div>}
          <ProgressList progress={run.progress} />
          <Console logs={run.logs} running={run.running} />
        </div>
      )}

      {/* Os painéis não aparecem mais aqui: eles vivem na Biblioteca, que é
          persistente e guarda também as tentativas reprovadas. */}
      {run.result && (
        <div style={{ marginTop: 16 }}>
          <Button size="sm" onClick={() => void abrirGaleria()} disabled={sheetBusy}>
            {sheetBusy ? 'abrindo…' : 'Abrir galeria da série'}
          </Button>
        </div>
      )}
    </>
  );
}

// ── Biblioteca: tudo que já foi gerado, aprovado ou não ──────────────────────
function Biblioteca({
  projeto,
  onMudou,
  setErro,
}: {
  projeto: ProjectFull;
  onMudou: () => Promise<void>;
  setErro: (s: string | null) => void;
}) {
  const [zoom, setZoom] = useState<LibraryItem | null>(null);
  const [filtro, setFiltro] = useState<'todas' | 'aprovadas'>('todas');
  const [anexando, setAnexando] = useState(false);

  const itens = useMemo(
    () => (filtro === 'aprovadas' ? projeto.biblioteca.filter((b) => b.aprovado) : projeto.biblioteca),
    [projeto.biblioteca, filtro],
  );
  const aprovadas = projeto.biblioteca.filter((b) => b.aprovado).length;

  async function remover(item: LibraryItem) {
    if (!confirm('Remover esta imagem da biblioteca? O arquivo é apagado.')) return;
    try {
      await api.removeFromLibrary(projeto.id, item.id);
      setZoom(null);
      await onMudou();
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }

  async function anexar(imagens: ImagemUpload[]) {
    if (!imagens.length) return;
    try {
      await api.addToLibrary(projeto.id, { imagens });
      setAnexando(false);
      await onMudou();
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }

  return (
    <>
      <div className="section-title" style={{ justifyContent: 'space-between' }}>
        <span>Biblioteca · {projeto.biblioteca.length} imagem(ns)</span>
        <span className="chips-wrap" style={{ alignItems: 'center' }}>
          {projeto.biblioteca.length > 0 && (
            <Segmented
              value={filtro}
              onChange={setFiltro}
              options={[
                { value: 'todas', label: `todas · ${projeto.biblioteca.length}` },
                { value: 'aprovadas', label: `aprovadas · ${aprovadas}` },
              ]}
            />
          )}
          <Button size="sm" onClick={() => setAnexando(true)}>+ Anexar imagem</Button>
        </span>
      </div>
      <p className="page-desc" style={{ marginTop: -6, marginBottom: 16 }}>
        Toda imagem gerada entra aqui na hora — inclusive as tentativas que o juiz reprovou, que antes eram
        sobrescritas e se perdiam. Nada some se você trocar de aba: remova só o que não quiser guardar.
      </p>

      {projeto.biblioteca.length === 0 ? (
        <Empty>Nada guardado ainda. Gere a série e as imagens aparecem aqui automaticamente.</Empty>
      ) : itens.length === 0 ? (
        <Empty>Nenhuma imagem aprovada ainda — veja em “todas”.</Empty>
      ) : (
        <div className="grade">
          {itens.map((b) => (
            <div className={cx('card', 'result-card', b.aprovado && 'best')} key={b.id}>
              <Thumb path={b.png} alt={b.cena || 'imagem do projeto'} wide onClick={() => setZoom(b)} />
              <div className="result-body">
                <div className="result-top">
                  <span className="result-style">
                    {b.painel ? `Painel ${b.painel}` : 'Anexada'}
                    {b.tentativa && b.tentativa > 1 ? ` · tentativa ${b.tentativa}` : ''}
                  </span>
                  <Badge tone={b.aprovado ? 'ok' : 'warn'}>{b.aprovado ? 'aprovada' : 'revisar'}</Badge>
                </div>
                {b.cena && <div className="scene-txt">{b.cena}</div>}
                {(b.consistencia != null || b.cenaNota != null) && (
                  <div className="votes">
                    <span className="result-meta">consistência</span> <NotaBadge nota={b.consistencia ?? null} />
                    <span className="result-meta">cena</span> <NotaBadge nota={b.cenaNota ?? null} />
                  </div>
                )}
              </div>
              <div className="card-actions">
                <Button size="sm" onClick={() => setZoom(b)}>Ver</Button>
                <Button size="sm" variant="danger" onClick={() => void remover(b)}>Remover</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {anexando && (
        <Modal title="Anexar imagem à biblioteca" onClose={() => setAnexando(false)}>
          <Field label="Imagens" hint="ficam guardadas junto com as geradas, no projeto">
            <ImageDrop files={[]} onChange={(f) => void anexar(f)} />
          </Field>
        </Modal>
      )}

      {zoom && (
        <Modal
          title={zoom.painel ? `Painel ${zoom.painel}${zoom.tentativa ? ` · tentativa ${zoom.tentativa}` : ''}` : 'Imagem do projeto'}
          onClose={() => setZoom(null)}
          footer={
            <>
              <Button variant="danger" onClick={() => void remover(zoom)}>Remover da biblioteca</Button>
              <Button onClick={() => window.open(fileUrl(zoom.png), '_blank')}>Abrir em tamanho real</Button>
            </>
          }
        >
          <img className="modal-ref" src={fileUrl(zoom.png)} alt={zoom.cena || 'imagem'} />
          {zoom.cena && <p>{zoom.cena}</p>}
          <div className="chips-wrap">
            <Badge tone={zoom.aprovado ? 'ok' : 'warn'}>{zoom.aprovado ? 'aprovada' : 'reprovada pelo juiz'}</Badge>
            {zoom.consistencia != null && <Badge tone="mute">consistência {zoom.consistencia}</Badge>}
            {zoom.cenaNota != null && <Badge tone="mute">cena {zoom.cenaNota}</Badge>}
            {zoom.serieId && <Badge tone="mute">série {zoom.serieId}</Badge>}
          </div>
        </Modal>
      )}
    </>
  );
}
