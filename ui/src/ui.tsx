import React, { useEffect, useRef, useState } from 'react';
import type { ImagemUpload, LogEntry, ProgressEvent } from './types';
import { cx, fmtElapsed, fileUrl, notaClass, readAsDataUrl } from './util';

// ── Identidade visual ────────────────────────────────────────────────────────
/**
 * Cerdas do pincel: 4.2 de largura na virola (y=9.5), barriga curta e afunilamento
 * longo — 3.0 na metade, 1.9 no último terço — até uma ponta fina e arredondada cujo
 * ponto mais baixo é exatamente (22.43, 18.94), o pivô da rotação e o alvo do hover.
 * O arco final (r 0.62, corda 1.14) tem flecha 0.376, então a corda fica em y=18.564
 * para o fundo cair em 18.94.
 */
const BRISTLES =
  'M20.33 9.5C20.15 12.8 21.55 16.6 21.86 18.564a0.62 0.62 0 0 1 1.14 0C23.31 16.6 24.71 12.8 24.53 9.5z';

/**
 * Logo: pincel de cerdas finas + paleta de pintura. No hover o pincel desliza no
 * próprio eixo até a PONTA encostar na cavidade vermelha, e só então as cerdas
 * pegam a cor (ver `.brush-arm` / `.brush-tip` no index.css).
 *
 * Geometria travada: a ponta em repouso fica em (22.43, 18.94) e o grupo do pincel
 * gira 32° EM TORNO DA PRÓPRIA PONTA — por isso a rotação não a desloca. O hover
 * translada (-2.23, +3.56), que é o eixo do pincel × 4.2, levando a ponta a
 * (20.20, 22.50): a borda de cima da cavidade vermelha (cy 24.4, r 2). Mexer em
 * qualquer um desses números exige refazer os outros.
 */
export function BrushLogo() {
  return (
    <svg className="brush" viewBox="0 0 40 40" aria-hidden focusable="false">
      {/* paleta: corpo + furo do polegar como buraco de verdade (evenodd) */}
      <path
        fillRule="evenodd"
        d="M2.5 27a11 7.2 0 1 0 22 0a11 7.2 0 1 0-22 0zM9.6 30.2a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0z"
        fill="#ece0c8"
        stroke="rgba(42,38,34,0.24)"
        strokeWidth="0.7"
      />
      {/* cavidades de tinta — a vermelha é o alvo da ponta */}
      <circle cx="6.2" cy="26.4" r="1.9" fill="#2f4f9e" />
      <circle cx="10.4" cy="23.6" r="1.9" fill="#3d7a4e" />
      <circle cx="15.2" cy="22.6" r="1.9" fill="#b8791d" />
      <circle cx="20.2" cy="24.4" r="2" fill="#c0392b" />

      {/* só o terço final das cerdas muda de cor: mesmo path, recortado */}
      <defs>
        <clipPath id="brushTipClip">
          <rect x="18" y="15.4" width="9" height="4.2" />
        </clipPath>
      </defs>

      {/* o translate do hover mora no grupo de fora; a rotação fixa, no de dentro
          (transform via CSS sobrescreveria o atributo se fossem o mesmo elemento) */}
      <g className="brush-arm">
        <g transform="rotate(32 22.43 18.94)">
          {/* cabo */}
          <rect x="20.48" y="-1.6" width="3.9" height="7" rx="1.95" fill="#c9a882" />
          <rect x="20.48" y="-1.6" width="1.55" height="7" rx="0.78" fill="#e0c4a3" />
          {/* virola */}
          <rect x="19.73" y="5.4" width="5.4" height="4.2" rx="1.1" fill="#a9a29a" />
          <rect x="19.73" y="6.7" width="5.4" height="0.9" fill="#8d857c" />
          {/* cerdas: cheias na virola, afinando até uma ponta fina e arredondada */}
          <path d={BRISTLES} fill="#cbb08a" />
          <path className="brush-tip" d={BRISTLES} fill="#c0b092" clipPath="url(#brushTipClip)" />
        </g>
      </g>
    </svg>
  );
}

const SPLAT_PATHS = [
  'M104 6c34-6 71 14 84 45s6 71-19 93-64 27-92 12S24 116 26 84 70 12 104 6z',
  'M88 10c38-8 78 18 87 54s-12 74-45 92-73 8-91-22S18 62 47 34c14-13 27-20 41-24z',
  'M96 12c32 0 66 20 79 50s5 68-20 89-63 24-88 6S22 106 27 76 64 12 96 12z',
];

/** Manchas de tinta do fundo (decorativas, atrás de tudo). */
export function Splats() {
  const cores: Array<'blue' | 'red' | 'green'> = ['blue', 'red', 'green'];
  return (
    <div className="splats" aria-hidden>
      {cores.map((c, i) => (
        <svg key={c} className={cx('splat', c)} viewBox="0 0 200 200" fill="currentColor">
          <path d={SPLAT_PATHS[i]} />
          <circle cx={i === 1 ? 178 : 22} cy={34 + i * 12} r={9 - i} />
          <circle cx={i === 2 ? 30 : 172} cy={170 - i * 14} r={6} />
        </svg>
      ))}
    </div>
  );
}

/** Lápis translúcido sobre uma capa: abre a configuração da imagem. */
export function CoverEditButton({ onClick, title = 'trocar a imagem' }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      className="cover-edit"
      title={title}
      aria-label={title}
      // O card inteiro é clicável (abre o item) — o lápis não pode disparar isso.
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

/**
 * Corpo do modal de capa: grade com as imagens já disponíveis + anexar nova.
 * Não abre modal sozinho — quem chama decide o título e o rodapé.
 */
export function CoverPicker({
  imagens,
  atual,
  onEscolher,
  onAnexar,
  vazio = 'Nenhuma imagem disponível ainda — anexe a primeira.',
}: {
  imagens: Array<{ key: string; png: string; rotulo?: string }>;
  atual?: string | null;
  onEscolher: (key: string) => void;
  onAnexar: (files: ImagemUpload[]) => void;
  vazio?: string;
}) {
  return (
    <>
      {imagens.length === 0 ? (
        <div className="subtle" style={{ marginBottom: 12 }}>{vazio}</div>
      ) : (
        <>
          <div className="field-label" style={{ marginBottom: 8 }}>Escolher uma imagem existente</div>
          <div className="cover-pick">
            {imagens.map((im) => (
              <button
                key={im.key}
                type="button"
                className={cx(atual === im.key && 'on')}
                title={im.rotulo ?? 'usar como capa'}
                onClick={() => onEscolher(im.key)}
              >
                <img src={fileUrl(im.png)} alt={im.rotulo ?? 'imagem'} loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="field-label" style={{ margin: '14px 0 8px' }}>…ou anexar uma nova</div>
      <ImageDrop files={[]} onChange={onAnexar} label="Arraste a nova capa ou clique para escolher" />
    </>
  );
}

/**
 * Quantas imagens o codex gera ao mesmo tempo. `0` = ilimitado (default do app).
 *
 * `avisoEncadeamento` liga o alerta de que paralelizar desliga a referência ao
 * painel anterior — só faz sentido em série, não no fluxo avulso.
 */
export function WorkersField({
  value,
  onChange,
  avisoEncadeamento = false,
  hint = 'imagens simultâneas no codex',
}: {
  value: number;
  onChange: (n: number) => void;
  avisoEncadeamento?: boolean;
  hint?: string;
}) {
  const ilimitado = value === 0;
  return (
    // NÃO usa <Field>: ele embrulha os filhos num <label>, e clicar num <button>
    // dentro de um label dispara a ativação duas vezes — o chip alternava 0→1→0 e
    // parecia não funcionar. Mesmo padrão dos chips de "quem aparece".
    <div className="field">
      <span className="field-label">Workers</span>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          className={cx('chip', ilimitado && 'on')}
          onClick={() => onChange(ilimitado ? 1 : 0)}
          title="dispara todas as imagens de uma vez"
        >
          {ilimitado ? '✓ ilimitado' : 'ilimitado'}
        </button>
        {!ilimitado && (
          <input
            className="input num"
            type="number"
            min={1}
            value={value}
            onChange={(e) => onChange(Math.max(1, Math.round(Number(e.target.value) || 1)))}
          />
        )}
      </div>
      <span className="field-hint">{hint}</span>
      {avisoEncadeamento && value !== 1 && (
        <div className="subtle" style={{ marginTop: 2 }}>
          Com {ilimitado ? 'workers ilimitados' : 'mais de 1 worker'} os painéis saem juntos, então{' '}
          <b>nenhum usa o anterior como referência</b> — o painel N-1 ainda não existe quando o N é gerado. A coerência
          passa a vir só das âncoras dos personagens. Use 1 worker para manter o encadeamento.
        </div>
      )}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose} role="dialog" aria-modal>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="fechar">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ── Upload de imagens (arrastar ou clicar) ───────────────────────────────────
export function ImageDrop({
  files,
  onChange,
  label = 'Arraste imagens de referência ou clique para escolher',
  hint = 'png, jpeg, webp ou gif',
}: {
  files: ImagemUpload[];
  onChange: (f: ImagemUpload[]) => void;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    const novos: ImagemUpload[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith('image/')) continue;
      novos.push({ name: f.name, dataUrl: await readAsDataUrl(f) });
    }
    if (novos.length) onChange([...files, ...novos]);
  }

  return (
    <div>
      <div
        className={cx('drop', over && 'over')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void add(e.dataTransfer.files);
        }}
      >
        <b>{label}</b>
        <span className="drop-note">{hint}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {files.length > 0 && (
        <div className="drop-grid">
          {files.map((f, i) => (
            <div className="drop-item" key={`${f.name}-${i}`}>
              <img src={f.dataUrl} alt={f.name ?? `referência ${i + 1}`} />
              <button type="button" title="remover" onClick={() => onChange(files.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Primitivas ───────────────────────────────────────────────────────────────
export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Loading({ label = 'carregando…' }: { label?: string }) {
  return (
    <div className="loading-row">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="error-banner">
      <span aria-hidden>✕</span>
      <span>{msg}</span>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

type Tone = 'ok' | 'warn' | 'err' | 'accent' | 'mute' | 'default';
export function Badge({ tone = 'default', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cx('badge', tone !== 'default' && tone)}>{children}</span>;
}

export function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cx('switch', checked && 'on')}
      onClick={() => !disabled && onChange(!checked)}
    />
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  size,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  size?: 'sm';
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} className={cx('btn', variant !== 'default' && variant, size === 'sm' && 'sm')} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx('seg-btn', value === o.value && 'on')}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NotaBadge({ nota, aprovado }: { nota: number | null | undefined; aprovado?: boolean | null }) {
  const cls = notaClass(nota);
  const mark = aprovado == null ? '' : aprovado ? ' ✓' : ' ✕';
  return <span className={cx('nota', cls)}>{nota == null ? '—' : nota.toFixed(1)}{mark}</span>;
}

// ── Imagem servida por /api/file com fallback ────────────────────────────────
export function Thumb({
  path,
  alt,
  wide,
  contain,
  onClick,
}: {
  path: string | null | undefined;
  alt: string;
  wide?: boolean;
  /** `contain` mostra a imagem inteira (sprites/folhas de personagem) em vez de cortar. */
  contain?: boolean;
  onClick?: () => void;
}) {
  const [broken, setBroken] = React.useState(false);
  return (
    <div
      className={cx('thumb', wide && 'wide', contain && 'contain')}
      onClick={onClick}
      style={onClick ? { cursor: 'zoom-in' } : undefined}
    >
      {path && !broken ? (
        <img src={fileUrl(path)} alt={alt} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span className="thumb-fallback">{path ? 'imagem indisponível' : 'sem imagem'}</span>
      )}
    </div>
  );
}

// ── Console de log ao vivo ───────────────────────────────────────────────────
export function Console({ logs, running }: { logs: LogEntry[]; running?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);
  return (
    <div className="console" ref={ref}>
      {logs.length === 0 ? (
        <div className="console-empty">{running ? 'aguardando o servidor…' : 'sem saída ainda.'}</div>
      ) : (
        logs.map((l, i) => (
          <div className="console-line" key={i}>
            <span className="console-time">{fmtElapsed(l.elapsedMs)}</span>
            <span className={cx('console-msg', l.level)}>{l.msg}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ── Barras de progresso por job ──────────────────────────────────────────────
export function ProgressList({ progress }: { progress: Record<string, ProgressEvent> }) {
  const entries = Object.values(progress);
  if (entries.length === 0) return null;
  return (
    <div>
      {entries.map((ev) => (
        <div className="prog" key={ev.jobId}>
          <div className="prog-head">
            <span className="prog-job">{ev.jobId} · {ev.phase}</span>
            <span className="prog-pct">{Math.round(ev.percent)}%</span>
          </div>
          <div className="prog-track">
            <div className="prog-fill" style={{ width: `${Math.max(0, Math.min(100, ev.percent))}%` }} />
          </div>
          {ev.message && <div className="prog-msg">{ev.message}</div>}
        </div>
      ))}
    </div>
  );
}
