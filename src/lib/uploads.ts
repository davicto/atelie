import fs from 'fs';
import path from 'path';
import { SESSIONS_ROOT } from '../config';

/** Raiz dos arquivos enviados pela UI web: ~/.atelie/uploads. */
export const UPLOADS_DIR = path.join(SESSIONS_ROOT, 'uploads');

/** Imagem enviada pelo navegador (FileReader.readAsDataURL). */
export interface UploadInput {
  /** Nome original — só a extensão/base é aproveitada, sempre saneada. */
  name?: string;
  /** `data:image/png;base64,AAAA…` */
  dataUrl: string;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;

/** Base do nome sem extensão, sem acento/símbolo e sem qualquer componente de caminho. */
function safeBase(name: string | undefined): string {
  const only = path.basename(String(name ?? '')).replace(/\.[^.]+$/, '');
  const slug = only
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'imagem';
}

/**
 * Decodifica um data URL de imagem. Lança se o mime não for uma imagem suportada
 * (o backend de geração só aceita png/jpg/webp/gif como referência).
 */
export function decodeImageDataUrl(dataUrl: string): { buf: Buffer; ext: string } {
  const m = DATA_URL.exec(String(dataUrl ?? '').trim());
  if (!m) throw new Error('imagem inválida: esperado um data URL base64');
  const mime = m[1].toLowerCase();
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error(`tipo de imagem não suportado: ${mime} (use png, jpeg, webp ou gif)`);
  return { buf: Buffer.from(m[2], 'base64'), ext };
}

/**
 * Grava as imagens em `<destDir>` com nomes previsíveis (`NN-<slug>.<ext>`) e
 * devolve os caminhos absolutos. `destDir` precisa estar sob ~/.atelie — é o que
 * a rota /api/file consegue servir de volta para as <img> da UI.
 */
export function saveImagesTo(destDir: string, files: UploadInput[], startIndex = 0): string[] {
  const abs = path.resolve(destDir);
  const rootSep = SESSIONS_ROOT.endsWith(path.sep) ? SESSIONS_ROOT : SESSIONS_ROOT + path.sep;
  if (abs !== SESSIONS_ROOT && !abs.startsWith(rootSep)) {
    throw new Error('destino de upload fora de ~/.atelie');
  }
  fs.mkdirSync(abs, { recursive: true });
  const out: string[] = [];
  files.forEach((f, i) => {
    const { buf, ext } = decodeImageDataUrl(f.dataUrl);
    const n = String(startIndex + i + 1).padStart(2, '0');
    const p = path.join(abs, `${n}-${safeBase(f.name)}${ext}`);
    fs.writeFileSync(p, buf);
    out.push(p);
  });
  return out;
}

/** Pasta temporária de upload (usada quando ainda não há dono definitivo). */
export function scratchUploadDir(scope: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join(UPLOADS_DIR, safeBase(scope) || 'geral', `${stamp}-${rand}`);
}

/** Normaliza o corpo `imagens` das rotas: aceita data URLs crus ou {name,dataUrl}. */
export function coerceUploads(raw: unknown): UploadInput[] {
  if (!Array.isArray(raw)) return [];
  const out: UploadInput[] = [];
  for (const x of raw) {
    if (typeof x === 'string') out.push({ dataUrl: x });
    else if (x && typeof x === 'object' && typeof (x as any).dataUrl === 'string') {
      out.push({ name: (x as any).name, dataUrl: (x as any).dataUrl });
    }
  }
  return out;
}
