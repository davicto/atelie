export const theme = {
  primary: '#002060',
  accent: '#00F0FF',
  primaryLight: '#5B7FB9',
  ok: '#34d399',
  warn: '#fbbf24',
  err: '#f87171',
  dim: 'gray',
} as const;

export type Theme = typeof theme;
