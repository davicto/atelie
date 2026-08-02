/**
 * Pool de concorrência manual, compartilhado pelo pipeline avulso e pela série.
 *
 * `limit <= 0` significa SEM LIMITE: dispara todos os itens de uma vez. É o
 * default do app (`settings.concurrency`), então o valor 0 não é "desligado" —
 * é "todos ao mesmo tempo".
 */
export async function runPool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let idx = 0;
  const width = limit > 0 ? Math.min(limit, items.length) : items.length;
  const runners = Array.from({ length: width }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) break;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

/**
 * Rodar em paralelo é incompatível com usar o painel anterior como referência:
 * se os painéis saem ao mesmo tempo, o painel N não tem o N-1 pronto para olhar.
 * Só `1` mantém a cadeia sequencial — 0 (ilimitado) e >1 a quebram.
 */
export function permiteEncadear(limit: number): boolean {
  return limit === 1;
}
