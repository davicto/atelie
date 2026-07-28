/**
 * Porta de pupilo `_extract_json`: extrai o primeiro objeto/array JSON válido de
 * um texto sujo (com prosa ou cercas markdown ao redor). O recorte balanceado
 * também descarta a DUPLICAÇÃO do texto do juiz descrita no BUILD_CONTRACT
 * (o mesmo JSON aparece no bloco assistant E no result).
 */
function firstOpen(s: string): number {
  const a = s.indexOf('{');
  const b = s.indexOf('[');
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

export function extractJson(raw: string): any | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // 1) tira cercas markdown ```json ... ``` (ou ``` ... ```)
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // 2) tenta parsear direto
  try {
    return JSON.parse(s);
  } catch {
    // segue para o recorte balanceado
  }

  // 3) recorta o PRIMEIRO {..} ou [..] balanceado (respeita strings/escapes)
  const start = firstOpen(s);
  if (start === -1) return null;
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
