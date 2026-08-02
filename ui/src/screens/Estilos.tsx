import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { ImagemUpload, StyleDetail, StyleInfo } from '../types';
import { Badge, Button, CoverEditButton, CoverPicker, Empty, ErrorBanner, Field, ImageDrop, Loading, Modal, Segmented } from '../ui';
import { cx, fileUrl, fmtDate } from '../util';

/** Chave lida pela tela Criar para pré-selecionar os estilos escolhidos aqui. */
export const SELECAO_KEY = 'atelie.estilosSelecionados';

export function lerSelecao(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SELECAO_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

type Filtro = 'todos' | 'meus' | 'catalogo';

export default function Estilos() {
  const [estilos, setEstilos] = useState<StyleInfo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(lerSelecao()));
  const [aberto, setAberto] = useState<StyleDetail | null>(null);
  const [criando, setCriando] = useState(false);
  const [capaDe, setCapaDe] = useState<StyleInfo | null>(null);

  async function carregar() {
    setErro(null);
    try {
      setEstilos(await api.styles());
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }
  useEffect(() => {
    void carregar();
  }, []);

  // A seleção acompanha o usuário até a tela Criar.
  useEffect(() => {
    localStorage.setItem(SELECAO_KEY, JSON.stringify([...selecionados]));
  }, [selecionados]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (estilos ?? []).filter((s) => {
      if (filtro === 'meus' && s.origem !== 'user') return false;
      if (filtro === 'catalogo' && s.origem === 'user') return false;
      if (!q) return true;
      return `${s.nome} ${s.desc} ${s.grupo}`.toLowerCase().includes(q);
    });
  }, [estilos, filtro, busca]);

  const grupos = useMemo(() => {
    const m = new Map<string, StyleInfo[]>();
    for (const s of visiveis) {
      if (!m.has(s.grupo)) m.set(s.grupo, []);
      m.get(s.grupo)!.push(s);
    }
    return [...m.entries()];
  }, [visiveis]);

  const meus = (estilos ?? []).filter((s) => s.origem === 'user').length;

  function alternar(id: string) {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function abrir(id: string) {
    try {
      setAberto(await api.style(id));
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }

  async function apagar(id: string) {
    if (!confirm('Apagar este estilo e suas imagens de referência?')) return;
    try {
      await api.deleteStyle(id);
      setAberto(null);
      setSelecionados((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      await carregar();
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }

  if (erro && !estilos) return <div className="view"><ErrorBanner msg={erro} /></div>;
  if (!estilos) return <div className="view"><Loading label="abrindo o portfólio…" /></div>;

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <div className="page-kicker">Portfólio</div>
          <h1 className="page-title">Estilos de ilustração</h1>
          <p className="page-desc">
            Clique num estilo para ver a descrição e as imagens de referência. Marque os que quiser usar — a seleção
            aparece já pronta na tela Criar. Os seus estilos ficam com o selo <b>meu estilo</b>.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCriando(true)}>+ Novo estilo</Button>
      </div>

      {erro && <div style={{ marginBottom: 14 }}><ErrorBanner msg={erro} /></div>}

      <div className="row" style={{ marginBottom: 22 }}>
        <Segmented
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: 'todos', label: `todos · ${estilos.length}` },
            { value: 'meus', label: `meus · ${meus}` },
            { value: 'catalogo', label: 'catálogo' },
          ]}
        />
        <input
          className="input"
          style={{ maxWidth: 260 }}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="buscar por nome ou descrição…"
        />
        {selecionados.size > 0 && (
          <span className="chips-wrap" style={{ alignItems: 'center' }}>
            <Badge tone="accent">{selecionados.size} selecionado(s)</Badge>
            <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>limpar seleção</Button>
          </span>
        )}
      </div>

      {visiveis.length === 0 ? (
        <Empty>Nenhum estilo encontrado com esse filtro.</Empty>
      ) : (
        grupos.map(([grupo, items]) => (
          <div key={grupo}>
            <div className="section-title">{grupo}</div>
            <div className="style-grid">
              {items.map((s) => (
                <StyleCard
                  key={s.id}
                  estilo={s}
                  selecionado={selecionados.has(s.id)}
                  onAbrir={() => void abrir(s.id)}
                  onSelecionar={() => alternar(s.id)}
                  onTrocarCapa={() => setCapaDe(s)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {aberto && <DetalheEstilo estilo={aberto} onFechar={() => setAberto(null)} onApagar={() => void apagar(aberto.id)} />}
      {criando && (
        <NovoEstiloModal
          onFechar={() => setCriando(false)}
          onCriado={async (novo) => {
            setCriando(false);
            await carregar();
            setAberto(novo);
          }}
        />
      )}

      {capaDe && (
        <CapaEstiloModal
          estilo={capaDe}
          onFechar={() => setCapaDe(null)}
          onTrocada={async () => {
            setCapaDe(null);
            await carregar();
          }}
          setErro={setErro}
        />
      )}
    </div>
  );
}

/**
 * Capa de um estilo do usuário. A capa é sempre `refs[0]`, então "escolher" é
 * promover uma das refs a primeira; anexar entra na frente e já vira capa.
 */
function CapaEstiloModal({
  estilo,
  onFechar,
  onTrocada,
  setErro,
}: {
  estilo: StyleInfo;
  onFechar: () => void;
  onTrocada: () => Promise<void>;
  setErro: (s: string | null) => void;
}) {
  const [salvando, setSalvando] = useState(false);

  async function aplicar(fn: () => Promise<unknown>) {
    setSalvando(true);
    try {
      await fn();
      await onTrocada();
    } catch (e) {
      setErro(String((e as Error).message));
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={`Capa · ${estilo.nome}`}
      onClose={onFechar}
      footer={<Button onClick={onFechar}>Fechar</Button>}
    >
      {salvando ? (
        <Loading label="trocando a capa…" />
      ) : (
        <CoverPicker
          imagens={estilo.refs.map((r, i) => ({ key: String(i), png: r, rotulo: i === 0 ? 'capa atual' : `referência ${i + 1}` }))}
          atual="0"
          onEscolher={(k) => void aplicar(() => api.setStyleCover(estilo.id, { refIndex: Number(k) }))}
          onAnexar={(imagens) => imagens.length && void aplicar(() => api.setStyleCover(estilo.id, { imagens }))}
          vazio="Este estilo ainda não tem imagens de referência — anexe a primeira."
        />
      )}
    </Modal>
  );
}

function StyleCard({
  estilo,
  selecionado,
  onAbrir,
  onSelecionar,
  onTrocarCapa,
}: {
  estilo: StyleInfo;
  selecionado: boolean;
  onAbrir: () => void;
  onSelecionar: () => void;
  onTrocarCapa: () => void;
}) {
  const capa = estilo.refs[0];
  return (
    <div className={cx('style-card', selecionado && 'on')}>
      {selecionado && <span className="style-check" aria-hidden>✓</span>}
      {estilo.origem === 'user' && (
        <span className="style-mark">
          <Badge tone="accent">meu estilo</Badge>
        </span>
      )}
      <div className="style-cover" onClick={onAbrir} style={{ cursor: 'pointer' }}>
        {capa ? (
          <img src={fileUrl(capa)} alt={estilo.nome} loading="lazy" />
        ) : (
          <div className="style-cover blank" style={{ width: '100%', height: '100%' }}>
            <span>{estilo.nome.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
        {/* Só os estilos que o usuário criou: o catálogo é fixo, capa incluída. */}
        {estilo.origem === 'user' && (
          <CoverEditButton title={`trocar a capa de ${estilo.nome}`} onClick={onTrocarCapa} />
        )}
      </div>
      <div className="style-body">
        <div className="style-name">{estilo.nome}</div>
        <div className="style-desc">{estilo.desc}</div>
        <div className="style-foot">
          <button className="btn sm ghost" type="button" onClick={onAbrir}>ver detalhes</button>
          <button className={cx('chip', selecionado && 'on')} type="button" onClick={onSelecionar}>
            {selecionado ? '✓ selecionado' : 'selecionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetalheEstilo({ estilo, onFechar, onApagar }: { estilo: StyleDetail; onFechar: () => void; onApagar: () => void }) {
  return (
    <Modal
      title={estilo.nome}
      onClose={onFechar}
      footer={
        <>
          {estilo.origem === 'user' && <Button variant="danger" onClick={onApagar}>Apagar estilo</Button>}
          <Button onClick={onFechar}>Fechar</Button>
        </>
      }
    >
      <div className="chips-wrap" style={{ marginBottom: 14 }}>
        <Badge tone={estilo.origem === 'user' ? 'accent' : 'mute'}>{estilo.origem === 'user' ? 'meu estilo' : 'catálogo'}</Badge>
        <Badge tone="mute">{estilo.grupo}</Badge>
        <Badge tone="mute">{estilo.defaults.aspect} · {estilo.defaults.quality}</Badge>
        {estilo.criadoEm && <Badge tone="mute">criado em {fmtDate(estilo.criadoEm)}</Badge>}
      </div>

      <p style={{ marginTop: 0 }}>{estilo.desc}</p>

      {estilo.refs.length > 0 ? (
        <>
          <div className="section-title">Referências</div>
          <img className="modal-ref" src={fileUrl(estilo.refs[0])} alt={`referência de ${estilo.nome}`} />
          {estilo.refs.length > 1 && (
            <div className="ref-strip">
              {estilo.refs.slice(1).map((r) => (
                <img key={r} src={fileUrl(r)} alt="referência" onClick={() => window.open(fileUrl(r), '_blank')} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="subtle">Estilo do catálogo — sem imagens de referência anexadas.</div>
      )}

      <div className="section-title">Instrução de estilo (template)</div>
      <div className="console" style={{ height: 'auto', maxHeight: 200 }}>{estilo.template}</div>
    </Modal>
  );
}

function NovoEstiloModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: (s: StyleDetail) => Promise<void> }) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [grupo, setGrupo] = useState('Meus estilos');
  const [autor, setAutor] = useState<'claude' | 'manual'>('claude');
  const [template, setTemplate] = useState('');
  const [imagens, setImagens] = useState<ImagemUpload[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pronto = descricao.trim().length > 0 && !salvando;

  async function salvar() {
    if (!pronto) return;
    setSalvando(true);
    setErro(null);
    try {
      const novo = await api.createStyle({
        nome: nome.trim() || undefined,
        descricao: descricao.trim(),
        grupo: grupo.trim() || undefined,
        autor,
        ...(autor === 'manual' && template.trim() ? { template: template.trim() } : {}),
        imagens,
      });
      await onCriado(novo);
    } catch (e) {
      setErro(String((e as Error).message));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Novo estilo"
      onClose={onFechar}
      footer={
        <>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={() => void salvar()} disabled={!pronto}>
            {salvando ? (autor === 'claude' ? 'a Claude está estudando as referências…' : 'salvando…') : 'Criar estilo'}
          </Button>
        </>
      }
    >
      {erro && <div style={{ marginBottom: 14 }}><ErrorBanner msg={erro} /></div>}

      <Field label="Nome" hint="opcional — sem nome, sai um a partir da descrição">
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Aquarela do Bosque" />
      </Field>

      <Field label="Texto explicativo" hint="Descreva o traço, a paleta, a luz, o clima. É a base do estilo.">
        <textarea
          className="textarea"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="ex.: aquarela suave com contorno de nanquim fino, paleta terrosa com verdes e ocres, luz difusa de fim de tarde, papel texturizado visível"
        />
      </Field>

      <Field label="Imagens de referência" hint="Quanto mais coerentes entre si, mais fiel fica o estilo.">
        <ImageDrop files={imagens} onChange={setImagens} />
      </Field>

      <div className="row" style={{ marginTop: 4 }}>
        <Field label="Quem escreve o estilo">
          <Segmented
            value={autor}
            onChange={setAutor}
            options={[
              { value: 'claude', label: 'Claude vê as referências' },
              { value: 'manual', label: 'eu escrevo' },
            ]}
          />
        </Field>
        <Field label="Grupo">
          <input className="input" style={{ maxWidth: 200 }} value={grupo} onChange={(e) => setGrupo(e.target.value)} />
        </Field>
      </div>

      {autor === 'manual' && (
        <Field label="Template do prompt" hint="Use {subject} {scene} {extra}; sem isso, montamos um a partir da descrição.">
          <textarea
            className="textarea mono"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="Soft watercolor illustration with fine ink outline… {subject}. {scene} {extra}"
          />
        </Field>
      )}
    </Modal>
  );
}
