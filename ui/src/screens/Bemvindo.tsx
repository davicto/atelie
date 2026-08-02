import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Button, ErrorBanner, Spinner } from '../ui';
import type { CodexAuth } from '../types';

// Wizard de primeira execução. Aparece por cima do app enquanto faltar a única
// credencial obrigatória: o login ChatGPT (é ele que habilita gerar E julgar).
// O Claude Code é opcional — sem ele o app roda com o juiz do próprio Codex,
// perdendo só "criar estilo novo" e "cânone de série".
//
// O login usa o fluxo de CÓDIGO DE DISPOSITIVO: o app mostra um link e um código,
// o usuário confirma no navegador. Nenhum terminal envolvido.

const POLL_MS = 2500;

export default function Bemvindo({ onPronto }: { onPronto: () => void }) {
  const [auth, setAuth] = useState<CodexAuth | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const jaAvisou = useRef(false);

  const consultar = useCallback(async () => {
    try {
      const a = await api.codexAuth();
      setAuth(a);
      setErro(null);
      if (a.logado && !jaAvisou.current) {
        jaAvisou.current = true;
        onPronto();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [onPronto]);

  useEffect(() => {
    void consultar();
    const t = setInterval(() => void consultar(), POLL_MS);
    return () => clearInterval(t);
  }, [consultar]);

  const entrar = async () => {
    setErro(null);
    try {
      await api.codexLogin();
      await consultar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const copiarCodigo = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem permissão de clipboard — o código está visível na tela mesmo assim */
    }
  };

  const emCurso = auth?.emCurso ?? null;
  const aguardando = emCurso?.fase === 'iniciando' || emCurso?.fase === 'aguardando-codigo';

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-head">
          <div className="brand-mark" />
          <div>
            <div className="welcome-title">Bem-vindo ao Ateliê</div>
            <div className="welcome-sub">Falta um passo antes de criar a primeira imagem.</div>
          </div>
        </div>

        {erro && <ErrorBanner msg={erro} />}

        {!auth ? (
          <div className="loading-row">
            <Spinner /> verificando…
          </div>
        ) : (
          <>
            <div className="welcome-step">
              <div className="welcome-step-num">1</div>
              <div className="welcome-step-body">
                <div className="welcome-step-title">Conectar sua conta ChatGPT</div>
                <div className="welcome-step-desc">
                  O Ateliê usa a sua assinatura do ChatGPT para gerar e avaliar as imagens. Nada é cobrado
                  por fora, e a sua senha não passa por aqui — a confirmação acontece no site da OpenAI.
                </div>

                {emCurso?.fase === 'erro' && <ErrorBanner msg={emCurso.mensagem ?? 'falha no login'} />}

                {aguardando ? (
                  <div className="welcome-device">
                    {emCurso?.codigo ? (
                      <>
                        <div className="welcome-device-label">Digite este código na página que abrir:</div>
                        <div className="welcome-code">
                          <span className="mono">{emCurso.codigo}</span>
                          <Button onClick={() => void copiarCodigo(emCurso.codigo!)}>
                            {copiado ? 'copiado' : 'copiar'}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="loading-row">
                        <Spinner /> preparando o login…
                      </div>
                    )}
                    {emCurso?.url && (
                      <a className="btn primary" href={emCurso.url} target="_blank" rel="noreferrer">
                        Abrir a página de confirmação
                      </a>
                    )}
                    <div className="welcome-wait">
                      <Spinner /> esperando você confirmar no navegador…
                    </div>
                  </div>
                ) : (
                  <div className="welcome-actions">
                    <Button variant="primary" onClick={() => void entrar()} disabled={!auth.disponivel}>
                      Entrar com ChatGPT
                    </Button>
                    <Button onClick={() => void consultar()}>Já entrei, verificar</Button>
                  </div>
                )}

                {!auth.disponivel && (
                  <div className="welcome-hint">
                    O componente de login não foi encontrado nesta instalação. Reinstale o Ateliê, ou instale o
                    Codex CLI manualmente (<code className="mono">npm i -g @openai/codex</code>) e rode{' '}
                    <code className="mono">codex login</code>.
                  </div>
                )}
              </div>
            </div>

            <div className="welcome-step welcome-step-opt">
              <div className="welcome-step-num">2</div>
              <div className="welcome-step-body">
                <div className="welcome-step-title">
                  Claude Code <span className="welcome-opt">opcional</span>
                </div>
                <div className="welcome-step-desc">
                  Só é preciso se você quiser <b>criar estilos novos</b> ou usar o <b>cânone de série</b>. Sem ele,
                  o Ateliê gera, avalia e melhora as imagens normalmente.
                </div>
              </div>
            </div>

            <div className="welcome-foot">
              <button className="linkish" onClick={onPronto}>
                Continuar mesmo assim
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
