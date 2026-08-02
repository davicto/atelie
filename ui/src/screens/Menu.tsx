import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Goto, Route } from '../App';

interface Entrada {
  route: Route;
  ico: string;
  nome: string;
  desc: string;
}

const ENTRADAS: Entrada[] = [
  { route: 'estilos', ico: '🎨', nome: 'Estilos', desc: 'O portfólio de estilos de ilustração. Veja os do catálogo e crie os seus a partir de imagens de referência e um texto explicativo.' },
  { route: 'projetos', ico: '📁', nome: 'Projetos', desc: 'Cada projeto tem seu estilo, seu elenco de personagens (com sprites validados) e seus briefings. É onde nasce uma série coerente.' },
  { route: 'criar', ico: '✏️', nome: 'Criar avulso', desc: 'Uma imagem solta, sem projeto: um pedido, um ou mais estilos e N versões avaliadas pelo juiz.' },
  { route: 'serie', ico: '🎞️', nome: 'Série livre', desc: 'Uma sequência coerente a partir de uma descrição — sem precisar montar um projeto antes.' },
  { route: 'sessoes', ico: '🗂️', nome: 'Sessões', desc: 'Tudo que já foi gerado, com notas, prompts e imagens.' },
  { route: 'ambiente', ico: '🩺', nome: 'Ambiente', desc: 'Estado das CLIs (codex, claude), autenticação e capacidades ligadas.' },
];

export default function Menu({ goto }: { goto: Goto }) {
  const [contagem, setContagem] = useState<{ estilos: number; projetos: number; sessoes: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, p, ss] = await Promise.all([api.styles(), api.projects(), api.sessions()]);
        setContagem({ estilos: s.length, projetos: p.length, sessoes: ss.length });
      } catch {
        setContagem(null);
      }
    })();
  }, []);

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <div className="page-kicker">Bem-vindo</div>
          <h1 className="page-title">O que vamos pintar hoje?</h1>
          <p className="page-desc">
            Escolha um estilo, monte o elenco do seu projeto, escreva os briefings — e o ateliê gera a série inteira
            mantendo os personagens iguais de uma imagem para a outra.
          </p>
        </div>
      </div>

      {contagem && (
        <div className="stat-strip">
          <span>estilos <b>{contagem.estilos}</b></span>
          <span>projetos <b>{contagem.projetos}</b></span>
          <span>sessões <b>{contagem.sessoes}</b></span>
        </div>
      )}

      <div className="hub">
        {ENTRADAS.map((e) => (
          <button className="hub-card" key={e.route} onClick={() => goto(e.route)}>
            <span className="hub-ico" aria-hidden>{e.ico}</span>
            <span className="hub-name">{e.nome}</span>
            <span className="hub-desc">{e.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
