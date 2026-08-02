import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ImagemUpload, ProjectFull, ProjectSummary, StyleInfo } from '../types';
import { Badge, Button, CoverEditButton, CoverPicker, Empty, ErrorBanner, Field, Loading, Modal } from '../ui';
import { fileUrl, fmtDate } from '../util';
import type { Goto } from '../App';

export default function Projetos({ goto }: { goto: Goto }) {
  const [projetos, setProjetos] = useState<ProjectSummary[] | null>(null);
  const [estilos, setEstilos] = useState<StyleInfo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [capaDe, setCapaDe] = useState<string | null>(null);

  async function carregar() {
    setErro(null);
    try {
      const [p, s] = await Promise.all([api.projects(), api.styles()]);
      setProjetos(p);
      setEstilos(s);
    } catch (e) {
      setErro(String((e as Error).message));
    }
  }
  useEffect(() => {
    void carregar();
  }, []);

  const nomeEstilo = (id: string | null) => (id ? estilos.find((s) => s.id === id)?.nome ?? id : 'sem estilo');

  if (erro && !projetos) return <div className="view"><ErrorBanner msg={erro} /></div>;
  if (!projetos) return <div className="view"><Loading label="carregando projetos…" /></div>;

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <div className="page-kicker">Ateliê</div>
          <h1 className="page-title">Projetos</h1>
          <p className="page-desc">
            Cada projeto guarda um estilo, o elenco de personagens (com os sprites que você validou) e a lista de
            briefings. Séries geradas dentro do projeto reaproveitam esses sprites como âncora.
          </p>
        </div>
        <Button variant="primary" onClick={() => setNovo(true)}>+ Novo projeto</Button>
      </div>

      {erro && <div style={{ marginBottom: 14 }}><ErrorBanner msg={erro} /></div>}

      {projetos.length === 0 ? (
        <Empty>Nenhum projeto ainda. Crie o primeiro para montar o elenco e os briefings.</Empty>
      ) : (
        <div className="style-grid">
          {projetos.map((p) => (
            <div className="style-card" key={p.id} onClick={() => goto('projeto', p.id)} style={{ cursor: 'pointer' }}>
              <div className="style-cover">
                {p.capa ? (
                  <img src={fileUrl(p.capa)} alt={p.nome} loading="lazy" />
                ) : (
                  <div className="style-cover blank" style={{ width: '100%', height: '100%' }}>
                    <span>{p.nome.slice(0, 1).toUpperCase()}</span>
                  </div>
                )}
                <CoverEditButton title={`trocar a capa de ${p.nome}`} onClick={() => setCapaDe(p.id)} />
              </div>
              <div className="style-body">
                <div className="style-name">{p.nome}</div>
                <div className="style-desc">{p.descricao || nomeEstilo(p.estiloId)}</div>
                <div className="chips-wrap" style={{ marginTop: 4 }}>
                  <Badge tone={p.aprovados > 0 ? 'ok' : 'mute'}>{p.aprovados}/{p.personagens} personagens</Badge>
                  <Badge tone="mute">{p.briefings} briefings</Badge>
                  {p.series > 0 && <Badge tone="accent">{p.series} série(s)</Badge>}
                </div>
                <div className="subtle mono">{fmtDate(p.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {novo && (
        <NovoProjetoModal
          estilos={estilos}
          onFechar={() => setNovo(false)}
          onCriado={(id) => {
            setNovo(false);
            goto('projeto', id);
          }}
        />
      )}

      {capaDe && (
        <CapaProjetoModal
          projetoId={capaDe}
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
 * Capa do projeto: escolhe uma imagem da biblioteca dele, ou anexa uma nova (que
 * entra na biblioteca e vira capa). O projeto completo é buscado aqui porque a
 * listagem só traz o resumo — a biblioteca não vem nela.
 */
function CapaProjetoModal({
  projetoId,
  onFechar,
  onTrocada,
  setErro,
}: {
  projetoId: string;
  onFechar: () => void;
  onTrocada: () => Promise<void>;
  setErro: (s: string | null) => void;
}) {
  const [projeto, setProjeto] = useState<ProjectFull | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.project(projetoId).then(setProjeto).catch((e) => setErro(String((e as Error).message)));
  }, [projetoId, setErro]);

  async function escolher(itemId: string) {
    setSalvando(true);
    try {
      await api.updateProject(projetoId, { capaItemId: itemId });
      await onTrocada();
    } catch (e) {
      setErro(String((e as Error).message));
      setSalvando(false);
    }
  }

  async function anexar(imagens: ImagemUpload[]) {
    if (!imagens.length) return;
    setSalvando(true);
    try {
      const [novo] = await api.addToLibrary(projetoId, { imagens, cena: 'capa do projeto' });
      if (novo) await api.updateProject(projetoId, { capaItemId: novo.id });
      await onTrocada();
    } catch (e) {
      setErro(String((e as Error).message));
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Capa do projeto"
      onClose={onFechar}
      footer={
        <>
          {projeto?.capaItemId && (
            <Button
              onClick={async () => {
                setSalvando(true);
                try {
                  await api.updateProject(projetoId, { capaItemId: null });
                  await onTrocada();
                } catch (e) {
                  setErro(String((e as Error).message));
                  setSalvando(false);
                }
              }}
            >
              Voltar à capa automática
            </Button>
          )}
          <Button onClick={onFechar}>Fechar</Button>
        </>
      }
    >
      {!projeto ? (
        <Loading label="carregando as imagens do projeto…" />
      ) : salvando ? (
        <Loading label="trocando a capa…" />
      ) : (
        <CoverPicker
          imagens={projeto.biblioteca.map((b) => ({ key: b.id, png: b.png, rotulo: b.cena || 'imagem do projeto' }))}
          atual={projeto.capaItemId ?? null}
          onEscolher={(id) => void escolher(id)}
          onAnexar={(f) => void anexar(f)}
          vazio="Este projeto ainda não tem imagens guardadas. Gere a série ou anexe uma imagem aqui."
        />
      )}
    </Modal>
  );
}

function NovoProjetoModal({
  estilos,
  onFechar,
  onCriado,
}: {
  estilos: StyleInfo[];
  onFechar: () => void;
  onCriado: (id: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [estiloId, setEstiloId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const p = await api.createProject({ nome: nome.trim(), descricao: descricao.trim(), estiloId: estiloId || null });
      onCriado(p.id);
    } catch (e) {
      setErro(String((e as Error).message));
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Novo projeto"
      onClose={onFechar}
      footer={
        <>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={() => void salvar()} disabled={!nome.trim() || salvando}>
            {salvando ? 'criando…' : 'Criar projeto'}
          </Button>
        </>
      }
    >
      {erro && <div style={{ marginBottom: 14 }}><ErrorBanner msg={erro} /></div>}
      <Field label="Nome">
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Bosque Mananciais" />
      </Field>
      <Field label="Sobre o projeto" hint="mundo, tom, público — vira contexto da série">
        <textarea className="textarea" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Field>
      <Field label="Estilo de ilustração" hint="pode trocar depois; define o traço de todos os sprites e painéis">
        <select className="select" value={estiloId} onChange={(e) => setEstiloId(e.target.value)}>
          <option value="">— sem estilo definido —</option>
          {estilos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
              {s.origem === 'user' ? ' (meu)' : ''}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}
