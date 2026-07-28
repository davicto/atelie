import React, { useEffect, useRef } from 'react';
import type { LogEntry, ProgressEvent } from './types';
import { cx, fmtElapsed, fileUrl, notaClass } from './util';

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
  variant?: 'default' | 'primary' | 'ghost';
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
export function Thumb({ path, alt, wide }: { path: string | null | undefined; alt: string; wide?: boolean }) {
  const [broken, setBroken] = React.useState(false);
  return (
    <div className={cx('thumb', wide && 'wide')}>
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
