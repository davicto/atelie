import type { Session } from '../types';
import { buildSlots, subjectAnchor } from '../lib/promptComposer';

function timestampId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `${stamp}-${rand}`;
}

export function createSession(
  request: string,
  styleIds: string[],
  n: number,
  provider: string,
  versionsPerStyle: number = n,
): Session {
  return {
    id: timestampId(),
    createdAt: new Date().toISOString(),
    request,
    slots: buildSlots(request),
    subjectAnchor: subjectAnchor(request),
    styleIds,
    n,
    versionsPerStyle,
    iteration: 1,
    provider,
    jobs: [],
    results: [],
  };
}
