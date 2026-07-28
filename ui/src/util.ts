export function cx(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ');
}

/** elapsedMs → mm:ss (cronômetro do console). */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function fmtDuration(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, '0')}s`;
}

/** URL da rota /api/file para uma imagem/arquivo absoluto sob ~/.atelie. */
export function fileUrl(p: string): string {
  return `/api/file?path=${encodeURIComponent(p)}`;
}

export function notaClass(nota: number | null | undefined): string {
  if (nota == null) return 'na';
  if (nota >= 7) return 'ok';
  if (nota >= 5) return 'mid';
  return 'bad';
}
